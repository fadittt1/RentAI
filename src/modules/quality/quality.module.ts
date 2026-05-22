import { Module } from '@nestjs/common';
import { QualityScoreService } from './quality-score.service';
import { QualityController } from './quality.controller';

@Module({
  controllers: [QualityController],
  providers: [QualityScoreService],
  exports: [QualityScoreService],
})
export class QualityModule {}
