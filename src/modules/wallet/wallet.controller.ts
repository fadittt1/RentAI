import { Controller, Get, Post, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

export class TopUpDto {
  @ApiProperty({ example: 50.0, description: 'Amount to add to wallet (TND). Must be > 0.' })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;
}

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('api/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private configService: ConfigService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user wallet balance and history' })
  async getWallet(@Request() req) {
    return this.walletService.getWallet(req.user.sub);
  }

  @Post('topup')
  @ApiOperation({ summary: 'Simulate wallet top-up (MVP only)' })
  async topUp(@Body() body: TopUpDto, @Request() req) {
    if (this.configService.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Simulated top-ups are disabled in production.');
    }
    return this.walletService.topUp(req.user.sub, body.amount);
  }
}
