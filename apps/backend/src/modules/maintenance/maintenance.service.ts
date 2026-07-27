import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService) {}

  async createSchedule(data: {
    propertyId: string;
    type: string;
    description: string;
    intervalMonths: number;
    lastServiceDate?: string;
  }) {
    const nextDueDate = new Date();
    if (data.lastServiceDate) {
      nextDueDate.setTime(new Date(data.lastServiceDate).getTime());
    }
    nextDueDate.setMonth(nextDueDate.getMonth() + data.intervalMonths);

    return this.prisma.maintenanceSchedule.create({
      data: {
        propertyId: data.propertyId,
        type: data.type,
        description: data.description,
        intervalMonths: data.intervalMonths,
        lastServiceDate: data.lastServiceDate ? new Date(data.lastServiceDate) : null,
        nextDueDate,
      },
    });
  }

  async getDueReminders() {
    const upcoming = new Date();
    upcoming.setDate(upcoming.getDate() + 14);

    return this.prisma.maintenanceSchedule.findMany({
      where: {
        isActive: true,
        reminderSent: false,
        nextDueDate: { lte: upcoming },
      },
      include: { property: { include: { customer: true } } },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async processReminders() {
    const reminders = await this.getDueReminders();

    for (const reminder of reminders) {
      await this.prisma.maintenanceSchedule.update({
        where: { id: reminder.id },
        data: { reminderSent: true },
      });
    }

    return { processed: reminders.length };
  }

  async markReminded(id: string) {
    return this.prisma.maintenanceSchedule.update({
      where: { id },
      data: { reminderSent: true },
    });
  }

  async completeService(id: string) {
    const schedule = await this.prisma.maintenanceSchedule.findUnique({ where: { id } });
    if (!schedule) return;

    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + schedule.intervalMonths);

    return this.prisma.maintenanceSchedule.update({
      where: { id },
      data: {
        lastServiceDate: new Date(),
        nextDueDate,
        reminderSent: false,
      },
    });
  }
}
