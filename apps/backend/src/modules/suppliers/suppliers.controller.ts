import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a supplier' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: {
      name: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      accountNumber?: string;
      paymentTerms?: number;
    },
  ) {
    return this.suppliersService.create(orgId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List suppliers' })
  findAll(@CurrentUser('organizationId') orgId: string) {
    return this.suppliersService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier by ID' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a supplier' })
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.suppliersService.update(id, dto);
  }
}
