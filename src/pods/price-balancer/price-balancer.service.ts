/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, providers, Wallet } from 'ethers';
import { Contracts } from '../../utils';
import BN from 'bn.js';
import bnsqrt from 'bn-sqrt';

type TradingPair<T extends Contract> = {
    token0: T;
    token1: T;
};
const Q96 = new BN(2).pow(new BN(96));

@Injectable()
export class PriceBalancerService implements OnModuleInit {
    private readonly logger = new Logger(PriceBalancerService.name);

    private provider: providers.JsonRpcProvider;
    private wallet: Wallet;
    private mainPool: Contract;
    private targetPool: Contract;
    private tradingPair: TradingPair<Contract>;

    constructor(private readonly configService: ConfigService) {}

    public async onModuleInit(): Promise<void> {
        this.logger.debug('onModuleInit');
        try {
            const web3ProviderUrl = this.configService.get<string>('WEB3');
            const web3ProviderAPIKey = this.configService.get<string>('WEB3_API_KEY');
            const mainPoolAddress = this.configService.get<string>('MAIN_POOL_ADDRESS') as string;
            const targetPoolAddress = this.configService.get<string>('TARGET_POOL_ADDRESS') as string;
            const rawWalletPrivateKey = this.configService.get<string>('PRIVATE_KEY');

            if (!rawWalletPrivateKey) {
                throw new Error('Wallet private key not provided');
            }
            const walletPrivateKey = rawWalletPrivateKey?.startsWith('0x')
                ? rawWalletPrivateKey
                : `0x${rawWalletPrivateKey}`;

            if (!mainPoolAddress || !targetPoolAddress) {
                throw new Error('One or more pool addresses missing');
            }
            if (!web3ProviderUrl || !web3ProviderAPIKey) {
                throw new Error('Web3 provider cannot be set up. One or more parameters missing');
            }

            this.provider = new providers.JsonRpcProvider(`${web3ProviderUrl}${web3ProviderAPIKey}`);
            this.wallet = new Wallet(walletPrivateKey, this.provider);
            this.mainPool = new Contract(mainPoolAddress, Contracts.MainPool.abi, this.provider);
            this.targetPool = new Contract(targetPoolAddress, Contracts.MainPool.abi, this.provider);

            const [token0Address, token1Address] = await Promise.all([this.mainPool.token0(), this.mainPool.token1()]);
            this.tradingPair = {
                token0: new Contract(token0Address, Contracts.ERC20.abi, this.provider),
                token1: new Contract(token1Address, Contracts.ERC20.abi, this.provider),
            };

            const poolInterface = this.mainPool.interface;
            const topics = [poolInterface.getEventTopic(poolInterface.getEvent('Swap'))];

            this.provider.on(
                {
                    address: this.mainPool.address,
                    topics,
                },
                async (event: providers.Log) => {
                    this.logger.verbose(`Found price change event`);
                    const { name } = poolInterface.parseLog(event);
                    const log = poolInterface.decodeEventLog(name, event.data, event.topics);
                    this.logger.verbose(`Event parsed to ${JSON.stringify(log)}`);

                    const { sqrtPriceX96, tick } = log;

                    // calculate & initialize price change in target pools
                    // IMPROVEMENT: create a Job & add to the message queue
                    await this.balance(new BN(sqrtPriceX96.toString()), new BN(tick.toString()));
                },
            );
        } catch (error) {
            this.logger.error(error.stack, error.message);
        }
    }

    public async balance(currentSqrtPriceInMain: BN, currentTickInMain: BN): Promise<void> {
        try {
            const { sqrtPriceX96, tick } = await this.targetPool.slot0();
            const currentSqrtPriceInTarget = new BN(sqrtPriceX96.toString());
            const currentTickInTarget = new BN(tick.toString());
            const tickSpacing = new BN((await this.targetPool.tickSpacing()).toString());

            this.logger.debug(
                `\ncurrentSqrtPriceInMain: ${currentSqrtPriceInMain},
                currentTickInMain: ${currentTickInMain},
                currentSqrtPriceInTarget: ${currentSqrtPriceInTarget},
                currentTickInTarget: ${currentTickInTarget},
                tickSpacingInTarget: ${tickSpacing}`,
            );

            // calc price of X in terms of Y
            const mainPoolPrice = this.getPriceFromSqrtX96(currentSqrtPriceInMain);
            const targetPoolPrice = this.getPriceFromSqrtX96(currentSqrtPriceInTarget);

            // adjust for tickSpacing
            const adjustedTick = this.adjustTickForSpacing(currentTickInTarget, tickSpacing);

            // get liquidity from adjusted tick
            // set liquidity=1 for testing purposes only
            const { liquidity: liquidityInTarget = 1 } = await this.targetPool.ticks(adjustedTick.toString());
            const decimals0 = await this.tradingPair.token0.decimals();
            const decimals1 = await this.tradingPair.token1.decimals();

            this.logger.debug(
                `\nmainPoolPrice: ${mainPoolPrice},
                targetPoolPrice: ${targetPoolPrice}, 
                adjustedTick: ${adjustedTick},
                liquidityInTarget: ${liquidityInTarget},
                decimals0: ${decimals0},
                decimals1: ${decimals1}`,
            );

            // select token to be swapped
            // calculate amount to be swapped
            let tokenToSwap: Contract, deltaPrice: BN;
            if (mainPoolPrice.gt(targetPoolPrice)) {
                tokenToSwap = this.tradingPair.token1;
                deltaPrice = bnsqrt(mainPoolPrice).sub(bnsqrt(targetPoolPrice));
            } else if (mainPoolPrice.lt(targetPoolPrice)) {
                tokenToSwap = this.tradingPair.token0;
                deltaPrice = new BN(1).div(bnsqrt(mainPoolPrice)).sub(new BN(1).div(bnsqrt(targetPoolPrice)));
            } else {
                return;
            }

            const amountToSwap = new BN(liquidityInTarget.toString()).mul(deltaPrice);
            const amountToSwapInSmallestUnit = amountToSwap.mul(
                new BN((10 ** (await tokenToSwap.decimals())).toString()),
            );

            this.logger.debug(`
                delta P: ${deltaPrice},
                tokenToSwap: ${await tokenToSwap.name()},
                amountToSwap in smallest unit: ${amountToSwapInSmallestUnit}
            `);

            // call RouterV3.swap()
        } catch (error) {
            this.logger.error(error.stack, error.message);
        }
    }

    private getPriceFromSqrtX96(sqrtPriceX96: BN): BN {
        return sqrtPriceX96.div(Q96).pow(new BN(2));
    }

    private adjustTickForSpacing(rawTick: BN, tickSpacing: BN): BN {
        return rawTick.divRound(tickSpacing).mul(tickSpacing);
    }
}
