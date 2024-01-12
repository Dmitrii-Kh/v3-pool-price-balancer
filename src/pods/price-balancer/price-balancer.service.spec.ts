import { Test, TestingModule } from '@nestjs/testing';
import { PriceBalancerService } from './price-balancer.service';

describe('PriceBalancerService', () => {
    let service: PriceBalancerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [PriceBalancerService],
        }).compile();

        service = module.get<PriceBalancerService>(PriceBalancerService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
