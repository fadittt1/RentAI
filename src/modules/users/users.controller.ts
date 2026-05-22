import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BecomeHostDto } from './dto/become-host.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as fs from 'fs';
import * as path from 'path';

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_MIME = /^image\/(jpeg|jpg|png|webp)$/;

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req) {
    return this.usersService.findOneSafe(req.user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    await this.usersService.update(req.user.sub, updateUserDto);
    return this.usersService.findOneSafe(req.user.sub);
  }

  @Post('me/become-host')
  @ApiOperation({ summary: 'Become a host' })
  becomeHost(@Request() req, @Body() becomeHostDto: BecomeHostDto) {
    return this.usersService.becomeHost(
      req.user.sub,
      becomeHostDto.acceptTerms,
    );
  }

  /**
   * Upload (or replace) the current user's avatar.
   * Cloudinary in prod, local /uploads/avatars/<userId>/ in dev.
   */
  @Post('me/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('avatar', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload current user avatar' })
  async uploadAvatar(@Request() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!AVATAR_MIME.test(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('File too large (max 4MB)');
    }

    const userId: string = req.user.sub;
    let url: string | null = await this.cloudinary.uploadFile(
      file,
      `rentai/avatars/${userId}`,
    );

    if (!url) {
      // Local fallback for dev environments without Cloudinary creds.
      const baseDir = './uploads';
      const dir = path.join(baseDir, 'avatars', userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `avatar-${Date.now()}${ext}`;
      const filePath = path.join(dir, filename);
      if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer);
      } else if ((file as any).path && fs.existsSync((file as any).path)) {
        fs.renameSync((file as any).path, filePath);
      } else {
        throw new BadRequestException('Could not read uploaded file');
      }
      url = `/uploads/avatars/${userId}/${filename}`;
    }

    await this.usersService.update(userId, { avatarUrl: url } as any);
    return this.usersService.findOneSafe(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user public profile' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOnePublic(id);
  }
}
