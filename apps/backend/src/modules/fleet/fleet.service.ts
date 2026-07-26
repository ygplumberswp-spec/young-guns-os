import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FleetService {
  constructor(private prisma: PrismaService) {}

  async getVehicles(branchId: string) {
    return this.prisma.vehicle.findMany({
      where: { branchId },
      include: {
        technicianProfile: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        gpsLocations: { take: 1, orderBy: { recordedAt: 'desc' } },
      },
    });
  }

  async getVehicleById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        technicianProfile: { include: { user: true } },
        gpsLocations: { take: 50, orderBy: { recordedAt: 'desc' } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async createVehicle(branchId: string, data: {
    registration: string;
    make: string;
    model: string;
    year: number;
    color?: string;
    vin?: string;
    type?: string;
  }) {
    return this.prisma.vehicle.create({
      data: { branchId, ...data } as any,
    });
  }

  async updateLocation(vehicleId: string, latitude: number, longitude: number, speed?: number, heading?: number) {
    return this.prisma.gpsLocation.create({
      data: {
        vehicleId,
        latitude,
        longitude,
        speed,
        heading,
        recordedAt: new Date(),
      },
    });
  }

  async getLiveLocations(branchId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { branchId, status: 'IN_USE' },
      include: {
        technicianProfile: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        gpsLocations: { take: 1, orderBy: { recordedAt: 'desc' } },
      },
    });

    return vehicles.map((v) => ({
      vehicleId: v.id,
      registration: v.registration,
      driver: v.technicianProfile
        ? `${v.technicianProfile.user.firstName} ${v.technicianProfile.user.lastName}`
        : null,
      location: v.gpsLocations[0] || null,
    }));
  }

  async getVehiclesNeedingService(branchId: string) {
    const now = new Date();
    return this.prisma.vehicle.findMany({
      where: {
        branchId,
        OR: [
          { nextServiceDate: { lte: now } },
          { insuranceExpiry: { lte: now } },
          { regoExpiry: { lte: now } },
        ],
      },
    });
  }
}
