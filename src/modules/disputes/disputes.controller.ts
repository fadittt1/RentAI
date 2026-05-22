import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { DisputesService } from './disputes.service';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { PostDisputeMessageDto } from './dto/post-message.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import type { DisputeStatus } from '@prisma/client';

@ApiTags('disputes')
@ApiBearerAuth()
@Controller('api/disputes')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open a dispute on a paid/completed booking' })
  open(@Body() dto: OpenDisputeDto, @Request() req: any) {
    return this.disputes.open(req.user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'My disputes (as renter or host)' })
  myDisputes(@Request() req: any) {
    return this.disputes.listForUser(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dispute timeline + booking context' })
  getOne(@Param('id') id: string, @Request() req: any) {
    const isAdmin =
      Array.isArray(req.user?.roles) &&
      req.user.roles.map((r: string) => String(r).toUpperCase()).includes('ADMIN');
    return this.disputes.getOne(id, req.user.sub, !!isAdmin);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor('attachments', 5, { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        attachments: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiOperation({ summary: 'Add a message + optional image evidence' })
  postMessage(
    @Param('id') id: string,
    @Body() dto: PostDisputeMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    const isAdmin =
      Array.isArray(req.user?.roles) &&
      req.user.roles.map((r: string) => String(r).toUpperCase()).includes('ADMIN');
    return this.disputes.postMessage(
      id,
      req.user.sub,
      !!isAdmin,
      dto.body ?? '',
      files,
    );
  }

  // ─── Admin ────────────────────────────────────────────────────────────

  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin queue. Defaults to OPEN disputes.' })
  adminQueue(@Query('status') status?: DisputeStatus) {
    return this.disputes.adminQueue({ status });
  }

  @Post(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin: close the dispute with a resolution' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @Request() req: any,
  ) {
    return this.disputes.resolve(id, req.user.sub, dto);
  }
}
