import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  async create(branchId: string, dto: CreateBookingDto) {
    const dateStr = dto.preferredDate || dto.scheduledDate;
    return this.prisma.booking.create({
      data: {
        branchId,
        customerName: dto.customerName || 'N/A',
        customerPhone: dto.customerPhone || '',
        customerEmail: dto.customerEmail,
        preferredDate: dateStr ? new Date(dateStr) : new Date(),
        preferredTimeSlot: dto.preferredTimeSlot,
        source: dto.source as any,
        notes: dto.notes,
        aiSummary: dto.aiSummary,
      },
    });
  }

  async findAll(branchId: string, pagination: PaginationDto & { status?: string }) {
    const { page = 1, limit = 20, status } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { branchId };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        include: { job: true },
        orderBy: { preferredDate: 'asc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { job: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async confirm(id: string) {
    return this.prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    });
  }

  async cancel(id: string) {
    return this.prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async convertToJob(id: string, jobId: string) {
    return this.prisma.booking.update({
      where: { id },
      data: { jobId, status: 'SCHEDULED' },
    });
  }

  async convertBookingToJob(bookingId: string) {
    const booking = await this.findById(bookingId);

    if (booking.jobId) {
      return booking;
    }

    const customer = await this.prisma.customer.findFirst({
      where: { phone: booking.customerPhone },
      include: { properties: true },
    });

    const jobCount = await this.prisma.job.count({ where: { branchId: booking.branchId } });
    const branch = await this.prisma.branch.findUnique({
      where: { id: booking.branchId },
      select: { code: true },
    });
    const jobNumber = `JOB-${branch?.code || 'YG'}-${String(jobCount + 1).padStart(5, '0')}`;

    const job = await this.prisma.job.create({
      data: {
        branchId: booking.branchId,
        customerId: customer?.id || '',
        propertyId: customer?.properties?.[0]?.id || '',
        createdById: '',
        jobNumber,
        type: 'REPAIR',
        title: `Job from booking - ${booking.customerName}`,
        description: booking.notes || undefined,
        scheduledStart: booking.preferredDate,
        status: 'SCHEDULED',
      },
    });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { jobId: job.id, status: 'SCHEDULED' },
    });

    return { booking: { ...booking, jobId: job.id, status: 'SCHEDULED' }, job };
  }

  async getAvailableSlots(branchId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await this.prisma.booking.count({
      where: {
        branchId,
        preferredDate: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
    });

    const timeSlots = [
      '07:00-09:00',
      '09:00-11:00',
      '11:00-13:00',
      '13:00-15:00',
      '15:00-17:00',
    ];

    return timeSlots.map((slot) => ({
      slot,
      available: existingBookings < 20,
    }));
  }
}
