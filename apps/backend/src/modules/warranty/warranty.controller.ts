import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WarrantyService } from './warranty.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

@ApiTags('warranty')
@Controller('warranties')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WarrantyController {
  constructor(private readonly warrantyService: WarrantyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a warranty' })
  create(@Body() dto: {
    customerId: string;
    propertyId: string;
    jobId?: string;
    type: string;
    description: string;
    startDate: string;
    endDate: string;
    terms?: string;
  }) {
    return this.warrantyService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get active warranties' })
  findActive(@Query('customerId') customerId?: string) {
    return this.warrantyService.findActive(customerId);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Get warranties expiring soon' })
  getExpiring(@Query('daysAhead') daysAhead?: string) {
    return this.warrantyService.getExpiringSoon(daysAhead ? parseInt(daysAhead) : 30);
  }

  @Patch(':id/claim')
  @ApiOperation({ summary: 'Lodge a warranty claim' })
  claim(@Param('id') id: string) {
    return this.warrantyService.claim(id);
  }
}
