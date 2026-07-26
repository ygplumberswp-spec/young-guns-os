import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  async create(organizationId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { organizationId_slug: { organizationId, slug: dto.slug } },
    });

    if (existing) {
      throw new ConflictException('Role with this slug already exists');
    }

    return this.prisma.role.create({
      data: {
        organizationId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        users: { include: { user: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findById(id);

    if (role.isSystem) {
      throw new ConflictException('Cannot modify system roles');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: { permissions: { include: { permission: true } } },
    });

    await this.invalidatePermissionCache(id);
    return updated;
  }

  async delete(id: string) {
    const role = await this.findById(id);

    if (role.isSystem) {
      throw new ConflictException('Cannot delete system roles');
    }

    await this.prisma.role.delete({ where: { id } });
    await this.invalidatePermissionCache(id);
  }

  async assignPermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.create({
      data: { roleId, permissionId },
    });
    await this.invalidatePermissionCache(roleId);
  }

  async removePermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
    await this.invalidatePermissionCache(roleId);
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async seedDefaultRoles(organizationId: string) {
    const defaultRoles = [
      { name: 'Super Admin', slug: 'super-admin', isSystem: true },
      { name: 'Branch Manager', slug: 'branch-manager', isSystem: true },
      { name: 'Office Admin', slug: 'office-admin', isSystem: true },
      { name: 'Technician', slug: 'technician', isSystem: true },
      { name: 'Apprentice', slug: 'apprentice', isSystem: true },
      { name: 'Dispatcher', slug: 'dispatcher', isSystem: true },
      { name: 'Accountant', slug: 'accountant', isSystem: true },
      { name: 'Marketing', slug: 'marketing', isSystem: true },
      { name: 'Customer Portal', slug: 'customer-portal', isSystem: true },
    ];

    for (const role of defaultRoles) {
      await this.prisma.role.upsert({
        where: { organizationId_slug: { organizationId, slug: role.slug } },
        update: {},
        create: { organizationId, ...role },
      });
    }
  }

  private async invalidatePermissionCache(roleId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });

    for (const ur of userRoles) {
      await this.redisService.del(`user:${ur.userId}:permissions`);
    }
  }
}
