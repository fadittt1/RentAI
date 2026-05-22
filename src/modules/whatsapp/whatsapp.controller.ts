import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { WhatsappService } from './whatsapp.service';
import { TwilioInboundDto } from './dto/twilio-webhook.dto';

@ApiTags('whatsapp')
@Controller('api/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * Twilio inbound webhook. Twilio POSTs form-urlencoded; NestJS's default
   * body parser handles that. We use `@Res()` to write the raw TwiML
   * envelope — the global TransformInterceptor would otherwise wrap it in
   * JSON and Twilio would reject the payload.
   *
   * The bot's reply goes out via Twilio's REST API (in handleIncoming),
   * not in this response — we ack Twilio quickly and process async.
   */
  @Public()
  @Post('webhook')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Twilio WhatsApp inbound message webhook' })
  webhook(@Body() body: TwilioInboundDto, @Res() res: Response): void {
    this.whatsappService
      .handleIncoming(body.From, body.Body ?? '')
      .catch(() => {
        /* errors are logged inside the service; never propagate to Twilio */
      });
    res
      .status(200)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Webhook health check (Twilio sandbox setup)' })
  health() {
    return { ok: true, service: 'whatsapp-webhook' };
  }
}
