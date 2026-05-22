import { IsOptional, IsString } from 'class-validator';

/**
 * Twilio posts WhatsApp messages as form-urlencoded with these fields
 * (a few more are sent but we don't need them).
 */
export class TwilioInboundDto {
  @IsString()
  From: string;

  @IsString()
  To: string;

  @IsOptional()
  @IsString()
  Body?: string;

  @IsOptional()
  @IsString()
  MessageSid?: string;

  @IsOptional()
  @IsString()
  WaId?: string;

  @IsOptional()
  @IsString()
  ProfileName?: string;
}
