import { Module } from '@nestjs/common';
import { DynamicPricingController } from './dynamic-pricing.controller';
import { DynamicPricingService } from './dynamic-pricing.service';

@Module({
  controllers: [DynamicPricingController],
  providers: [DynamicPricingService],
  exports: [DynamicPricingService],
})
export class DynamicPricingModule {}
