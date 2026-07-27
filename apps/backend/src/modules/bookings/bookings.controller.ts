import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';

@ApiTags('bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @RequirePermissions('bookings:create')
  @ApiOperation({ summary: 'Create a new booking' })
  create(@Query('branchId') queryBranchId: string, @Body() dto: CreateBookingDto) {
    const branchId = queryBranchId || dto.branchId || '';
    return this.bookingsService.create(branchId, dto);
  }

  @Get()
  @RequirePermissions('bookings:read')
  @ApiOperation({ summary: 'List bookings' })
  findAll(
    @Query('branchId') branchId: string,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.findAll(branchId, { ...pagination, status });
  }

  @Get('slots')
  @RequirePermissions('bookings:read')
  @ApiOperation({ summary: 'Get available booking slots' })
  getSlots(@Query('branchId') branchId: string, @Query('date') date: string) {
    return this.bookingsService.getAvailableSlots(branchId, new Date(date));
  }

  @Get(':id')
  @RequirePermissions('bookings:read')
  @ApiOperation({ summary: 'Get booking by ID' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findById(id);
  }

  @Patch(':id/confirm')
  @RequirePermissions('bookings:update')
  @ApiOperation({ summary: 'Confirm a booking' })
  confirm(@Param('id') id: string) {
    return this.bookingsService.confirm(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions('bookings:update')
  @ApiOperation({ summary: 'Cancel a booking' })
  cancel(@Param('id') id: string) {
    return this.bookingsService.cancel(id);
  }

  @Post(':id/convert-to-job')
  @RequirePermissions('bookings:update')
  @ApiOperation({ summary: 'Convert a booking into a job' })
  async convertToJob(@Param('id') id: string) {
    return this.bookingsService.convertBookingToJob(id);
  }
}
