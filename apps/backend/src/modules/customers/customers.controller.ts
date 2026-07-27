import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions('customers:create')
  @ApiOperation({ summary: 'Create a new customer' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(orgId, dto);
  }

  @Get()
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List all customers with pagination' })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('phone') phone?: string,
  ) {
    return this.customersService.findAll(orgId, { ...pagination, phone });
  }

  @Get('top')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Get top customers by lifetime value' })
  getTopCustomers(@CurrentUser('organizationId') orgId: string) {
    return this.customersService.getTopCustomers(orgId);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Get customer by ID with full details' })
  findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }
}
