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

    //TODO: private interface, so I can get event topic

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
            this.targetPool = new Contract(targetPoolAddress, Contracts.MainPool.abi, this.provider);

            this.provider.on(
                {
                    address: this.mainPool.address,
                    topics: [''],
                },
                async (event: providers.Log) => {
                    this.logger.debug(`Found price change event: ${event}`);
                    // TODO: calc & initialize price change in target pools
                    // IMPROVEMENT: create a job & add to the queue
                },
            );
        } catch (error) {
            this.logger.error(error.toString());
        }
    }

    private balancePrice(price: number): number {
        return 0;
    }
}
