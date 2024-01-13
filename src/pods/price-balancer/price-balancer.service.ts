/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, providers, Wallet } from 'ethers';
import { Contracts } from '../../utils';

type TradingPair<T extends Contract> = {
    token0: T;
    token1: T;
};
const Q96 = 2 ** 96;

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
                    // IMPROVEMENT: create a Job & add to the message queue
                    await this.balance(sqrtPriceX96, tick); // calculate & initialize price change in target pools
                },
            );
        } catch (error) {
            this.logger.error(error.message);
        }
    }

    public async balance(currentSqrtPriceInMain: number, currentTickInMain: number): Promise<void> {
        try {
            const { sqrtPriceX96: currentSqrtPriceInTarget, tick: currentTickInTarget } = await this.targetPool.slot0();
            const tickSpacing = await this.targetPool.tickSpacing();
            this.logger.debug(
                `currentSqrtPriceInMain: ${currentSqrtPriceInMain},
                currentTickInMain: ${currentTickInMain},
                currentSqrtPriceInTarget: ${currentSqrtPriceInTarget},
                currentTickInTarget: ${currentTickInTarget},
                tickSpacingInTarget: ${tickSpacing}`,
            );

            // calc price = (sqrtPriceX96 / 2 ** 96) ** 2, price of X in terms of Y
            const mainPoolPrice = this.getPriceFromSqrtX96(currentSqrtPriceInMain); // desired price for Target Pool
            const targetPoolPrice = this.getPriceFromSqrtX96(currentSqrtPriceInTarget);

            // adjust for tickSpacing: tick = Math.round(rawTick / tickSpacing) * tickSpacing
            const adjustedTick = this.adjustTickForSpacing(currentTickInTarget, tickSpacing);

            // get liquidity from adjusted tick
            const { liquidity: liquidityInTarget } = await this.targetPool.ticks(adjustedTick);
            const decimals0 = await this.tradingPair.token0.decimals();
            const decimals1 = await this.tradingPair.token1.decimals();

            this.logger.debug(
                `mainPoolPrice: ${mainPoolPrice},
                targetPoolPrice: ${targetPoolPrice}, 
                adjustedTick: ${adjustedTick},
                liquidityInTarget: ${liquidityInTarget},
                decimals0: ${decimals0},
                decimals1: ${decimals1}`,
            );

            // select token to be swapped
            // calculate delta P, delta X(Y) amount to be swapped
            let tokenToSwap: Contract, deltaPrice: number;
            if (mainPoolPrice > targetPoolPrice) {
                tokenToSwap = this.tradingPair.token1;
                deltaPrice = Math.sqrt(mainPoolPrice) - Math.sqrt(targetPoolPrice);
            } else if (mainPoolPrice < targetPoolPrice) {
                tokenToSwap = this.tradingPair.token0;
                deltaPrice = 1 / Math.sqrt(mainPoolPrice) - 1 / Math.sqrt(targetPoolPrice);
            } else {
                return;
            }

            const amountToSwap = (liquidityInTarget || 1) * deltaPrice; // set L=1 for testing purposes only

            this.logger.debug(`
                delta P: ${deltaPrice},
                tokenToSwap: ${await tokenToSwap.name()},
                amountToSwap: ${amountToSwap * 10 ** (await tokenToSwap.decimals())},
            `);

            // call RouterV3.swap()
        } catch (error) {
            this.logger.error(error.message);
        }
    }

    private getPriceFromSqrtX96(sqrtPriceX96: number): number {
        return (sqrtPriceX96 / Q96) ** 2;
    }

    private adjustTickForSpacing(rawTick: number, tickSpacing: number): number {
        return Math.round(rawTick / tickSpacing) * tickSpacing;
    }
}
