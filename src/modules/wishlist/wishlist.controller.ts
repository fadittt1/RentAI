import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('api/wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's saved listings" })
  list(@Request() req: any) {
    return this.wishlist.list(req.user.sub);
  }

  @Post(':listingId')
  @ApiOperation({ summary: 'Add a listing to the wishlist (idempotent)' })
  add(@Request() req: any, @Param('listingId') listingId: string) {
    return this.wishlist.add(req.user.sub, listingId);
  }

  @Delete(':listingId')
  @ApiOperation({ summary: 'Remove a listing from the wishlist (idempotent)' })
  remove(@Request() req: any, @Param('listingId') listingId: string) {
    return this.wishlist.remove(req.user.sub, listingId);
  }

  @Get(':listingId/has')
  @ApiOperation({ summary: 'Check if a listing is in the wishlist' })
  async has(@Request() req: any, @Param('listingId') listingId: string) {
    return { has: await this.wishlist.has(req.user.sub, listingId) };
  }
}
