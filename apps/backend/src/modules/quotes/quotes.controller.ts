import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('quotes')
@Controller('quotes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @RequirePermissions('quotes:create')
  @ApiOperation({ summary: 'Create a quote' })
  create(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.quotesService.create(dto.branchId, userId, dto);
  }

  @Get()
  @RequirePermissions('quotes:read')
  @ApiOperation({ summary: 'List quotes' })
  findAll(
    @Query('branchId') branchId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.quotesService.findAll(branchId, { ...pagination, status });
  }

  @Get('follow-up')
  @RequirePermissions('quotes:read')
  @ApiOperation({ summary: 'Get quotes requiring follow-up (48h+ no response)' })
  getFollowUp(@Query('branchId') branchId: string) {
    return this.quotesService.getFollowUpRequired(branchId);
  }

  @Get(':id')
  @RequirePermissions('quotes:read')
  @ApiOperation({ summary: 'Get quote details' })
  findOne(@Param('id') id: string) {
    return this.quotesService.findById(id);
  }

  @Patch(':id/send')
  @RequirePermissions('quotes:update')
  @ApiOperation({ summary: 'Send quote to customer' })
  send(@Param('id') id: string) {
    return this.quotesService.send(id);
  }

  @Patch(':id/accept')
  @RequirePermissions('quotes:update')
  @ApiOperation({ summary: 'Accept a quote' })
  accept(@Param('id') id: string) {
    return this.quotesService.accept(id);
  }

  @Patch(':id/reject')
  @RequirePermissions('quotes:update')
  @ApiOperation({ summary: 'Reject a quote' })
  reject(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.quotesService.reject(id, reason);
  }
}
