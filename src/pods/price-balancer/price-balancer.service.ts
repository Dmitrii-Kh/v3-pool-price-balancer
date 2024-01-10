import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, ethers, providers } from 'ethers';
import { Contracts } from '../../utils';

@Injectable()
export class PriceBalancerService implements OnModuleInit {
    private readonly logger = new Logger(PriceBalancerService.name);

    private provider: providers.JsonRpcProvider;
    private mainPool: Contract;
    private targetPool: Contract;

    //TODO: private interface, so I can get event topic

    constructor(private readonly configService: ConfigService) {}

    public async onModuleInit(): Promise<void> {
        this.logger.debug('onModuleInit');

        const web3ProviderUrl = this.configService.get<string>('WEB3');
        const mainPoolAddress = this.configService.get<string>('MAIN_POOL_ADDRESS') as string;
        const targetPoolAddress = this.configService.get<string>('TARGET_POOL_ADDRESS') as string;

        this.provider == new providers.JsonRpcProvider(web3ProviderUrl);

        this.mainPool = new Contract(mainPoolAddress, Contracts.MainPool.abi, this.provider);
        this.targetPool = new Contract(targetPoolAddress, Contracts.MainPool.abi, this.provider);
        this.provider.on(
            {
                address: this.mainPool.address,
                topics: [''],
            },
            async (event: providers.Log) => {
                this.logger.debug(`Found price change event: ${event}`);
                // TODO: initialize price change in target pools
            }
        );
    }

    private balancePrice(price: number): number {
        return 0;
    }
}
