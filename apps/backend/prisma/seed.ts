import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create organization
  const org = await prisma.organization.upsert({
    where: { slug: 'young-guns-plumbing' },
    update: {},
    create: {
      name: 'Young Guns Plumbing',
      slug: 'young-guns-plumbing',
      abn: '12345678901',
      phone: '1300 000 000',
      email: 'info@younggunsplumbing.com.au',
      timezone: 'Australia/Sydney',
    },
  });

  // Create branch
  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'SYD' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Sydney Head Office',
      code: 'SYD',
      address: '123 Plumbing St',
      suburb: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
      phone: '02 9000 0000',
      email: 'sydney@younggunsplumbing.com.au',
      latitude: -33.8148,
      longitude: 151.0017,
    },
  });

  // Create permissions
  const resources = [
    'users', 'roles', 'customers', 'properties', 'jobs', 'bookings',
    'dispatch', 'fleet', 'inventory', 'quotes', 'invoices', 'notifications',
    'audit', 'webhooks', 'ai', 'marketing', 'reviews', 'referrals',
    'warranty', 'maintenance', 'reporting', 'branches',
  ];
  const actions = ['create', 'read', 'update', 'delete'];

  for (const resource of resources) {
    for (const action of actions) {
      await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action, description: `${action} ${resource}` },
      });
    }
  }
  // AI-specific permission
  await prisma.permission.upsert({
    where: { resource_action: { resource: 'ai', action: 'execute' } },
    update: {},
    create: { resource: 'ai', action: 'execute', description: 'Execute AI agents' },
  });

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'super-admin' } },
    update: {},
    create: { organizationId: org.id, name: 'Super Admin', slug: 'super-admin', isSystem: true },
  });

  await prisma.role.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'technician' } },
    update: {},
    create: { organizationId: org.id, name: 'Technician', slug: 'technician', isSystem: true },
  });

  await prisma.role.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'office-admin' } },
    update: {},
    create: { organizationId: org.id, name: 'Office Admin', slug: 'office-admin', isSystem: true },
  });

  // Assign all permissions to super admin
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Create admin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@younggunsplumbing.com.au' },
    update: {},
    create: {
      organizationId: org.id,
      email: 'admin@younggunsplumbing.com.au',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      phone: '0400000000',
      isEmailVerified: true,
    },
  });

  // Assign admin role
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  // Assign to branch
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: adminUser.id, branchId: branch.id } },
    update: {},
    create: { userId: adminUser.id, branchId: branch.id, isPrimary: true },
  });

  // Create warehouse
  await prisma.warehouse.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MAIN-SYD' } },
    update: {},
    create: {
      organizationId: org.id,
      branchId: branch.id,
      name: 'Sydney Main Warehouse',
      code: 'MAIN-SYD',
      type: 'MAIN',
    },
  });

  console.log('Seed completed successfully');
  console.log(`Organization: ${org.name} (${org.id})`);
  console.log(`Branch: ${branch.name} (${branch.id})`);
  console.log(`Admin: ${adminUser.email}`);
  console.log('Default password: Admin123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
