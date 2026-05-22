import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { TwilioWhatsappClient } from './twilio-whatsapp.client';
import { AiModule } from '../ai/ai.module';
import { ContactDetectorService } from '../../common/anti-leak/contact-detector.service';

@Module({
  imports: [ConfigModule, AiModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, TwilioWhatsappClient, ContactDetectorService],
  exports: [WhatsappService, TwilioWhatsappClient],
})
export class WhatsappModule {}
