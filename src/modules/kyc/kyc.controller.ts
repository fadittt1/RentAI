import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { KycService } from './kyc.service';
import { RejectKycDto } from './dto/reject-kyc.dto';

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('api/kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current KYC status for the logged-in user' })
  myStatus(@Request() req: any) {
    return this.kyc.status(req.user.sub);
  }

  @Post('me/submit')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload (or re-upload) an ID document' })
  submit(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.kyc.submit(req.user.sub, file);
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List pending KYC submissions (admin)' })
  pendingQueue() {
    return this.kyc.pendingQueue();
  }

  @Post('admin/:userId/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve a host KYC submission' })
  approve(@Param('userId') userId: string, @Request() req: any) {
    return this.kyc.approve(userId, req.user.sub);
  }

  @Post('admin/:userId/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reject a host KYC submission' })
  reject(
    @Param('userId') userId: string,
    @Body() dto: RejectKycDto,
    @Request() req: any,
  ) {
    return this.kyc.reject(userId, req.user.sub, dto.reason);
  }

  @Post('admin/:userId/revoke')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Revoke a previously-verified host' })
  revoke(
    @Param('userId') userId: string,
    @Body() dto: RejectKycDto,
    @Request() req: any,
  ) {
    return this.kyc.revoke(userId, req.user.sub, dto.reason);
  }
}
