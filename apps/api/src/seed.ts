import {
  PrismaClient,
  RoleCode,
  ServiceType,
  ProjectStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur',
});

const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  const roles = [
    { code: RoleCode.SUPERADMIN, name: 'Superadmin' },
    { code: RoleCode.OFFICE, name: 'Buero / Disposition' },
    { code: RoleCode.PROJECT_MANAGER, name: 'Projektleiter' },
    { code: RoleCode.WORKER, name: 'Monteur' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  const adminPasswordHash = await hash('admin12345', 10);
  const adminKioskCodeHash = await hash('123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.local' },
    update: {
      displayName: 'System Admin',
      passwordHash: adminPasswordHash,
      kioskCodeHash: adminKioskCodeHash,
      isActive: true,
    },
    create: {
      email: 'admin@example.local',
      displayName: 'System Admin',
      passwordHash: adminPasswordHash,
      kioskCodeHash: adminKioskCodeHash,
      isActive: true,
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.SUPERADMIN },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  await prisma.setting.upsert({
    where: { key: 'security.passwordMinLength' },
    update: { valueJson: 8 },
    create: {
      key: 'security.passwordMinLength',
      valueJson: 8,
    },
  });

  await prisma.setting.upsert({
    where: { key: 'security.kioskCodeLength' },
    update: { valueJson: 6 },
    create: {
      key: 'security.kioskCodeLength',
      valueJson: 6,
    },
  });

  await prisma.setting.upsert({
    where: { key: 'appearance.defaultTheme' },
    update: { valueJson: 'dark' },
    create: {
      key: 'appearance.defaultTheme',
      valueJson: 'dark',
    },
  });

  const breakRule = await prisma.breakRule.upsert({
    where: { id: 'default-break-rule' },
    update: {},
    create: {
      id: 'default-break-rule',
      scopeType: 'GLOBAL',
      name: 'Standard 6/9 Stunden',
      autoDeductEnabled: true,
      thresholdMinutes1: 360,
      breakMinutes1: 30,
      thresholdMinutes2: 540,
      breakMinutes2: 45,
      active: true,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { customerNumber: 'K-1000' },
    update: {
      companyName: 'Beispiel Technik GmbH',
    },
    create: {
      customerNumber: 'K-1000',
      companyName: 'Beispiel Technik GmbH',
      email: 'kontakt@beispiel.local',
      phone: '+49 30 555000',
      city: 'Berlin',
      country: 'DE',
    },
  });

  const branch = await prisma.customerBranch.upsert({
    where: { id: 'sample-branch' },
    update: {
      name: 'Niederlassung Berlin',
      customerId: customer.id,
    },
    create: {
      id: 'sample-branch',
      customerId: customer.id,
      name: 'Niederlassung Berlin',
      city: 'Berlin',
      country: 'DE',
      active: true,
    },
  });

  const contact = await prisma.customerContact.upsert({
    where: { id: 'sample-contact' },
    update: {
      customerId: customer.id,
      branchId: branch.id,
    },
    create: {
      id: 'sample-contact',
      customerId: customer.id,
      branchId: branch.id,
      firstName: 'Anna',
      lastName: 'Kunde',
      email: 'anna.kunde@beispiel.local',
      isProjectContact: true,
      isSignatory: true,
    },
  });

  const project = await prisma.project.upsert({
    where: { projectNumber: 'P-2026-001' },
    update: {
      customerId: customer.id,
      branchId: branch.id,
      primaryCustomerContactId: contact.id,
      pauseRuleId: breakRule.id,
    },
    create: {
      projectNumber: 'P-2026-001',
      customerId: customer.id,
      branchId: branch.id,
      title: 'Videoanlage Lagerhalle',
      description: 'MVP-Projekt fuer Demo und Entwicklung',
      serviceType: ServiceType.VIDEO,
      status: ProjectStatus.ACTIVE,
      priority: 1,
      siteCity: 'Berlin',
      siteCountry: 'DE',
      primaryCustomerContactId: contact.id,
      internalProjectManagerUserId: admin.id,
      pauseRuleId: breakRule.id,
    },
  });

  const worker = await prisma.worker.upsert({
    where: { workerNumber: 'M-1000' },
    update: {
      firstName: 'Max',
      lastName: 'Monteur',
      phoneMobile: '+49 170 000000',
      phoneOffice: '+49 30 555111',
      active: true,
    },
    create: {
      workerNumber: 'M-1000',
      firstName: 'Max',
      lastName: 'Monteur',
      phone: '+49 170 000000',
      phoneMobile: '+49 170 000000',
      phoneOffice: '+49 30 555111',
      languageCode: 'de',
      active: true,
    },
  });

  await prisma.projectAssignment.upsert({
    where: { id: 'sample-assignment' },
    update: {
      projectId: project.id,
      workerId: worker.id,
    },
    create: {
      id: 'sample-assignment',
      projectId: project.id,
      workerId: worker.id,
      roleName: 'Lead Monteur',
      startDate: new Date(),
      active: true,
    },
  });

  const pinHash = await hash('1234', 10);

  await prisma.workerPin.updateMany({
    where: {
      workerId: worker.id,
      isActive: true,
    },
    data: {
      isActive: false,
      validTo: new Date(),
    },
  });

  await prisma.workerPin.create({
    data: {
      workerId: worker.id,
      pinHash,
      isActive: true,
    },
  });

  const monday = getMonday(new Date());

  await prisma.timeEntry.deleteMany({
    where: {
      workerId: worker.id,
      sourceDevice: 'seed',
    },
  });

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const clockIn = new Date(monday);
    clockIn.setDate(monday.getDate() + dayOffset);
    clockIn.setHours(8, 0, 0, 0);

    const clockOut = new Date(monday);
    clockOut.setDate(monday.getDate() + dayOffset);
    clockOut.setHours(17, 0, 0, 0);

    await prisma.timeEntry.create({
      data: {
        workerId: worker.id,
        projectId: project.id,
        entryType: 'CLOCK_IN',
        occurredAtClient: clockIn,
        occurredAtServer: clockIn,
        latitude: 52.52,
        longitude: 13.405,
        sourceDevice: 'seed',
      },
    });

    await prisma.timeEntry.create({
      data: {
        workerId: worker.id,
        projectId: project.id,
        entryType: 'CLOCK_OUT',
        occurredAtClient: clockOut,
        occurredAtServer: clockOut,
        latitude: 52.52,
        longitude: 13.405,
        sourceDevice: 'seed',
      },
    });
  }

  // ── Permissions ──────────────────────────────────────
  const permissions = [
    { code: 'customers.view', name: 'Kunden ansehen', category: 'Kunden' },
    { code: 'customers.create', name: 'Kunden anlegen', category: 'Kunden' },
    { code: 'customers.edit', name: 'Kunden bearbeiten', category: 'Kunden' },
    { code: 'customers.delete', name: 'Kunden loeschen', category: 'Kunden' },
    { code: 'projects.view', name: 'Projekte ansehen', category: 'Projekte' },
    { code: 'projects.create', name: 'Projekte anlegen', category: 'Projekte' },
    {
      code: 'projects.edit',
      name: 'Projekte bearbeiten',
      category: 'Projekte',
    },
    {
      code: 'projects.delete',
      name: 'Projekte loeschen',
      category: 'Projekte',
    },
    { code: 'workers.view', name: 'Monteure ansehen', category: 'Monteure' },
    { code: 'workers.create', name: 'Monteure anlegen', category: 'Monteure' },
    { code: 'workers.edit', name: 'Monteure bearbeiten', category: 'Monteure' },
    { code: 'workers.delete', name: 'Monteure loeschen', category: 'Monteure' },
    {
      code: 'documents.view',
      name: 'Dokumente ansehen',
      category: 'Dokumente',
    },
    {
      code: 'documents.upload',
      name: 'Dokumente hochladen',
      category: 'Dokumente',
    },
    {
      code: 'documents.delete',
      name: 'Dokumente loeschen',
      category: 'Dokumente',
    },
    { code: 'time.view', name: 'Zeiten ansehen', category: 'Zeiten' },
    { code: 'time.edit', name: 'Zeiten bearbeiten', category: 'Zeiten' },
    {
      code: 'timesheets.create',
      name: 'Stundenzettel erzeugen',
      category: 'Zeiten',
    },
    {
      code: 'timesheets.sign',
      name: 'Stundenzettel signieren',
      category: 'Zeiten',
    },
    {
      code: 'timesheets.send',
      name: 'Stundenzettel versenden',
      category: 'Zeiten',
    },
    {
      code: 'settings.view',
      name: 'Einstellungen ansehen',
      category: 'Einstellungen',
    },
    {
      code: 'settings.smtp',
      name: 'SMTP bearbeiten',
      category: 'Einstellungen',
    },
    {
      code: 'settings.backup',
      name: 'Backup konfigurieren',
      category: 'Einstellungen',
    },
    {
      code: 'settings.restore',
      name: 'Backup wiederherstellen',
      category: 'Einstellungen',
    },
    {
      code: 'users.manage',
      name: 'Benutzer verwalten',
      category: 'Einstellungen',
    },
    {
      code: 'roles.manage',
      name: 'Rollen/Rechte verwalten',
      category: 'Einstellungen',
    },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, category: perm.category },
      create: perm,
    });
  }

  // Superadmin bekommt alle Rechte
  const allPermissions = await prisma.permission.findMany();
  const superadminRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.SUPERADMIN },
  });
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superadminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: { roleId: superadminRole.id, permissionId: perm.id },
    });
  }

  // Office bekommt Basis-Rechte
  const officeRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.OFFICE },
  });
  const officeCodes = [
    'customers.view',
    'customers.create',
    'customers.edit',
    'projects.view',
    'projects.create',
    'projects.edit',
    'workers.view',
    'workers.create',
    'workers.edit',
    'documents.view',
    'documents.upload',
    'time.view',
    'time.edit',
    'timesheets.create',
    'timesheets.send',
    'settings.view',
  ];
  for (const code of officeCodes) {
    const perm = allPermissions.find((p) => p.code === code);
    if (perm) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: officeRole.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: officeRole.id, permissionId: perm.id },
      });
    }
  }

  console.log('Seed erfolgreich ausgefuehrt.');
  console.log('Admin Login: admin@example.local / admin12345');
  console.log('Monteur PIN: M-1000 / 1234');
}

function getMonday(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
