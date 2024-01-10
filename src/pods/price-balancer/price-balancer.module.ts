import { Module } from '@nestjs/common';
import { PriceBalancerService } from './price-balancer.service';

@Module({
    providers: [PriceBalancerService],
    exports: [PriceBalancerService],
})
export class PriceBalancerModule {}
