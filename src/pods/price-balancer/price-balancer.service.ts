import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, ethers, providers, Wallet } from 'ethers';
import { Contracts } from '../../utils';

@Injectable()
export class PriceBalancerService implements OnModuleInit {
    private readonly logger = new Logger(PriceBalancerService.name);

    private provider: providers.JsonRpcProvider;
    private wallet: Wallet;
    private mainPool: Contract;
    private targetPool: Contract;

    constructor(private readonly configService: ConfigService) {}

    public async onModuleInit(): Promise<void> {
        this.logger.debug('onModuleInit');
        try {
            const web3ProviderUrl = this.configService.get<string>('WEB3');
            const web3ProviderAPIKey = this.configService.get<string>('WEB3_API_KEY');
            const mainPoolAddress = this.configService.get<string>('MAIN_POOL_ADDRESS') as string;
            const targetPoolAddress = this.configService.get<string>('TARGET_POOL_ADDRESS') as string;
            const rawWalletPrivateKey = this.configService.get<string>('PRIVATE_KEY');
            const walletPrivateKey = rawWalletPrivateKey?.startsWith('0x')
                ? rawWalletPrivateKey
                : `0x${rawWalletPrivateKey}`;

            if (!walletPrivateKey) {
                this.logger.error('Wallet private key not provided');
                throw new Error('Wallet private key not provided');
            }
            this.provider = new providers.JsonRpcProvider(`${web3ProviderUrl}${web3ProviderAPIKey}`);
            this.wallet = new Wallet(walletPrivateKey, this.provider);
            this.mainPool = new Contract(mainPoolAddress, Contracts.MainPool.abi, this.provider);
            // this.targetPool = new Contract(targetPoolAddress, Contracts.MainPool.abi, this.provider);

            const poolInterface = this.mainPool.interface;
            const topics = [poolInterface.getEventTopic(poolInterface.getEvent('Swap'))];

            this.provider.on(
                {
                    address: this.mainPool.address,
                    topics,
                },
                async (event: providers.Log) => {
                    this.logger.verbose(`Found price change event: ${event.toString()}`);
                    const { name } = poolInterface.parseLog(event);
                    const log = poolInterface.decodeEventLog(name, event.data, event.topics);
                    this.logger.verbose(`Event parsed to ${JSON.stringify(log)}`);
                    const [ sqrtPriceX96 ] = log;

                    // TODO: calc & initialize price change in target pools

                    // compare sqrtPriceX96 in main and target pools
                    // calc price = (sqrtPriceX96 / 2 ** 96) ** 2
                    // rawTick = getTickAtSqrtPrice(price);
                    // adjust for tickSpacing: tick = Math.round(rawTick / tickSpacing) * tickSpacing
                    // get liquidity from adjusted tick
                    // calc price delta
                    // calc delta X/Y amount to be swapped

                    // swap (get router v3 abi and address, get ERC20 contract, approve tokens)

                    // IMPROVEMENT: create a job & add to the queue
                },
            );
        } catch (error) {
            this.logger.error(error.toString());
        }
    }

    private getTickAtSqrtPrice(sqrtPriceX96: number) {
        return Math.floor(Math.log((sqrtPriceX96 / 2 ** 96) ** 2) / Math.log(1.0001));
    }

    private getPrice(sqrtPriceX96, decimals0, decimals1): number {
        const buyOneOfToken0 = (sqrtPriceX96 / 2 ** 96) ** 2 / (10 ** decimals1 / 10 ** decimals0).toFixed(decimals1);

        const buyOneOfToken1 = (1 / buyOneOfToken0).toFixed(decimals0);
        this.logger.log('price of token0 in value of token1 : ' + buyOneOfToken0.toString());
        this.logger.log('price of token1 in value of token0 : ' + buyOneOfToken1.toString());

        // Convert to wei
        const buyOneOfToken0Wei = Math.floor(buyOneOfToken0 * 10 ** decimals1).toLocaleString('fullwide', {
            useGrouping: false,
        });
        const buyOneOfToken1Wei = Math.floor(buyOneOfToken1 * 10 ** decimals0).toLocaleString('fullwide', {
            useGrouping: false,
        });
        this.logger.log('price of token0 in value of token1 in lowest decimal : ' + buyOneOfToken0Wei);
        this.logger.log('price of token1 in value of token1 in lowest decimal : ' + buyOneOfToken1Wei);
        return 0;
    }
}
