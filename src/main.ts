import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const config = app.get<ConfigService>(ConfigService);
    const BACKEND_PORT = config.get<string>('BACKEND_PORT') as string;
    await app.listen(BACKEND_PORT);
}
bootstrap();
