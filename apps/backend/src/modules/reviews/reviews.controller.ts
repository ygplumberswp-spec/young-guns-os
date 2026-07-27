import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @RequirePermissions('reviews:create')
  @ApiOperation({ summary: 'Create a review' })
  create(@Body() dto: {
    customerId: string;
    jobId?: string;
    rating: number;
    comment?: string;
    source?: string;
    platform?: string;
  }) {
    return this.reviewsService.create({
      customerId: dto.customerId,
      rating: dto.rating,
      comment: dto.comment,
      platform: dto.source || dto.platform || 'GOOGLE',
    });
  }

  @Get()
  @RequirePermissions('reviews:read')
  @ApiOperation({ summary: 'List reviews' })
  findAll(@Query('minRating') minRating?: string, @Query('platform') platform?: string) {
    return this.reviewsService.getAll({
      minRating: minRating ? parseInt(minRating) : undefined,
      platform,
    });
  }

  @Get('stats')
  @RequirePermissions('reviews:read')
  @ApiOperation({ summary: 'Get review statistics' })
  getStats() {
    return this.reviewsService.getAverageRating();
  }

  @Patch(':id/respond')
  @RequirePermissions('reviews:update')
  @ApiOperation({ summary: 'Respond to a review' })
  respond(@Param('id') id: string, @Body() dto: { response: string }) {
    return this.reviewsService.respondToReview(id, dto.response);
  }
}
