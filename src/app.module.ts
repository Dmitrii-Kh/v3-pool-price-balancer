import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PriceBalancerModule } from './pods';
import createConfig from './configuration/config';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [createConfig],
            isGlobal: true,
        }),
        PriceBalancerModule,
    ],
    controllers: [],
    providers: [AppService],
})
export class AppModule {}
