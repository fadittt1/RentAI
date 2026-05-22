import { Module, forwardRef } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PaymentsModule } from '../payments/payments.module';
import { QualityModule } from '../quality/quality.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    CloudinaryModule,
    forwardRef(() => PaymentsModule),
    QualityModule,
    NotificationsModule,
  ],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
