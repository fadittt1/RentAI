import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

let cachedApp: any;

async function bootstrap() {
    if (!cachedApp) {
        const expressApp = express();
        try {
            const app = await NestFactory.create<NestExpressApplication>(
                AppModule,
                new (require('@nestjs/platform-express').ExpressAdapter)(expressApp),
            );

            // Global Settings
            app.enableCors();
            app.useGlobalFilters(new HttpExceptionFilter());
            app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());
            app.useGlobalPipes(
                new ValidationPipe({
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    transform: true,
                }),
            );

            await app.init();
            cachedApp = expressApp;
        } catch (err) {
            console.error('NestJS Bootstrap Error:', err);
            throw err;
        }
    }
    return cachedApp;
}

export default async (req: any, res: any) => {
    try {
        const app = await bootstrap();
        app(req, res);
    } catch (err: any) {
        res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error',
            error: err.message,
        });
    }
};
