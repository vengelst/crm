import {
  PrismaClient,
  RoleCode,
  ServiceType,
  ProjectStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur',
});
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

  await prisma.setting.upsert({
    where: { key: 'appearance.navAsIcons' },
    update: { valueJson: false },
    create: {
      key: 'appearance.navAsIcons',
      valueJson: false,
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

  // ══ ERWEITERTE TESTDATEN ══════════════════════════════════
  const pinHash2 = await hash('2345', 10);
  const pinHash3 = await hash('3456', 10);
  const pinHash4 = await hash('4567', 10);
  const pinHash5 = await hash('5678', 10);
  const pinHash6 = await hash('6789', 10);

  const testWorkers = [
    {
      number: 'M-1001',
      first: 'Stefan',
      last: 'Berger',
      pin: pinHash2,
      lang: 'de',
    },
    {
      number: 'M-1002',
      first: 'Thomas',
      last: 'Wagner',
      pin: pinHash3,
      lang: 'de',
    },
    {
      number: 'M-1003',
      first: 'Andreas',
      last: 'Richter',
      pin: pinHash4,
      lang: 'en',
    },
    {
      number: 'M-1004',
      first: 'Michael',
      last: 'Koch',
      pin: pinHash5,
      lang: 'de',
    },
    {
      number: 'M-1005',
      first: 'Peter',
      last: 'Fischer',
      pin: pinHash6,
      lang: 'en',
    },
  ];

  const createdWorkers = [worker]; // M-1000 already exists
  for (const tw of testWorkers) {
    const w = await prisma.worker.upsert({
      where: { workerNumber: tw.number },
      update: {
        firstName: tw.first,
        lastName: tw.last,
        active: true,
        languageCode: tw.lang,
      },
      create: {
        workerNumber: tw.number,
        firstName: tw.first,
        lastName: tw.last,
        active: true,
        languageCode: tw.lang,
        internalHourlyRate: 30 + Math.floor(Math.random() * 20),
      },
    });
    await prisma.workerPin.updateMany({
      where: { workerId: w.id, isActive: true },
      data: { isActive: false, validTo: new Date() },
    });
    await prisma.workerPin.create({
      data: { workerId: w.id, pinHash: tw.pin, isActive: true },
    });
    createdWorkers.push(w);
  }

  const testCustomers = [
    {
      number: 'K-2001',
      name: 'Elektro Schulz GmbH',
      city: 'Hamburg',
      contacts: [
        { first: 'Jens', last: 'Schulz', role: 'Geschaeftsfuehrer' },
        { first: 'Sabine', last: 'Meier', role: 'Projektleiterin' },
      ],
    },
    {
      number: 'K-2002',
      name: 'Bau & Sicherheit AG',
      city: 'Muenchen',
      contacts: [
        { first: 'Robert', last: 'Hartmann', role: 'Bauleitung' },
        { first: 'Lisa', last: 'Becker', role: 'Disposition' },
        { first: 'Klaus', last: 'Weber', role: 'Projektleiter' },
      ],
    },
    {
      number: 'K-2003',
      name: 'TechVision Systems',
      city: 'Frankfurt',
      contacts: [{ first: 'Martin', last: 'Klein', role: 'Projektleiter' }],
    },
    {
      number: 'K-2004',
      name: 'Industriewerk Nord KG',
      city: 'Hannover',
      contacts: [
        { first: 'Frank', last: 'Mueller', role: 'Bauleitung' },
        { first: 'Petra', last: 'Schmidt', role: 'Disposition' },
      ],
    },
    {
      number: 'K-2005',
      name: 'Gebaeude Service Sued',
      city: 'Stuttgart',
      contacts: [
        { first: 'Uwe', last: 'Hoffmann', role: 'Projektleiter' },
        { first: 'Claudia', last: 'Neumann', role: 'Buchhaltung' },
      ],
    },
  ];

  const statuses = [
    ProjectStatus.PLANNED,
    ProjectStatus.ACTIVE,
    ProjectStatus.ACTIVE,
    ProjectStatus.COMPLETED,
  ];
  const serviceTypes = [
    ServiceType.VIDEO,
    ServiceType.ELECTRICAL,
    ServiceType.SERVICE,
    ServiceType.OTHER,
  ];
  let projIdx = 0;

  for (const tc of testCustomers) {
    const cust = await prisma.customer.upsert({
      where: { customerNumber: tc.number },
      update: { companyName: tc.name },
      create: {
        customerNumber: tc.number,
        companyName: tc.name,
        city: tc.city,
        country: 'DE',
        email: `info@${tc.name.toLowerCase().replace(/[^a-z]/g, '')}.local`,
      },
    });

    for (const cc of tc.contacts) {
      await prisma.customerContact
        .create({
          data: {
            customerId: cust.id,
            firstName: cc.first,
            lastName: cc.last,
            role: cc.role,
            email: `${cc.first.toLowerCase()}.${cc.last.toLowerCase()}@${tc.name.toLowerCase().replace(/[^a-z]/g, '')}.local`,
          },
        })
        .catch(() => {}); // ignore if exists
    }

    // 1-3 Projekte je Kunde
    const projectCount = 1 + (projIdx % 3);
    for (let pi = 0; pi < projectCount; pi++) {
      const startDay = 1 + projIdx * 7;
      const startMonth = startDay > 60 ? 4 : startDay > 31 ? 3 : 2; // Mar-May 2026
      const dayInMonth =
        startDay > 60
          ? startDay - 60
          : startDay > 31
            ? startDay - 31
            : startDay;
      const start = new Date(2026, startMonth, Math.min(dayInMonth, 28));
      const end = new Date(start);
      end.setDate(end.getDate() + 21 + projIdx * 3);

      const proj = await prisma.project.upsert({
        where: {
          projectNumber: `P-2026-T${String(projIdx + 10).padStart(2, '0')}`,
        },
        update: { customerId: cust.id },
        create: {
          projectNumber: `P-2026-T${String(projIdx + 10).padStart(2, '0')}`,
          customerId: cust.id,
          title: `${serviceTypes[projIdx % serviceTypes.length]} ${tc.name.split(' ')[0]}`,
          serviceType: serviceTypes[projIdx % serviceTypes.length],
          status: statuses[projIdx % statuses.length],
          siteCity: tc.city,
          siteCountry: 'DE',
          weeklyFlatRate: 2000 + projIdx * 200,
          includedHoursPerWeek: 40,
          overtimeRate: 45,
          plannedStartDate: start,
          plannedEndDate: end,
          internalProjectManagerUserId: admin.id,
        },
      });

      // Assign 2 workers
      const w1 = createdWorkers[projIdx % createdWorkers.length];
      const w2 = createdWorkers[(projIdx + 1) % createdWorkers.length];
      for (const w of [w1, w2]) {
        await prisma.projectAssignment
          .create({
            data: {
              projectId: proj.id,
              workerId: w.id,
              startDate: start,
              endDate: end,
              active: true,
            },
          })
          .catch(() => {});
      }

      projIdx++;
    }
  }

  // ── Checklisten-Vorlage mit Notices ──────────────────
  const tpl = await prisma.checklistTemplate.upsert({
    where: { id: 'seed-template-safety' },
    update: { name: 'Sicherheitsunterweisung Baustelle' },
    create: {
      id: 'seed-template-safety',
      name: 'Sicherheitsunterweisung Baustelle',
      description: 'Standard-Sicherheitshinweise fuer Baustellen',
    },
  });

  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: tpl.id },
  });
  await prisma.checklistTemplateItem.createMany({
    data: [
      { templateId: tpl.id, title: 'PSA pruefen', sortOrder: 1 },
      { templateId: tpl.id, title: 'Werkzeug kontrollieren', sortOrder: 2 },
      { templateId: tpl.id, title: 'Arbeitsbereich sichern', sortOrder: 3 },
    ],
  });

  await prisma.checklistTemplateNotice.deleteMany({
    where: { templateId: tpl.id },
  });
  await prisma.checklistTemplateNotice.createMany({
    data: [
      {
        templateId: tpl.id,
        title: 'Sicherheitsregeln Baustelle',
        body: 'Auf dieser Baustelle gelten besondere Sicherheitsvorschriften. Schutzhelm und Sicherheitsschuhe sind Pflicht. Rauchen ist nur in ausgewiesenen Bereichen erlaubt.',
        sortOrder: 1,
        required: true,
        requireSignature: true,
      },
      {
        templateId: tpl.id,
        title: 'Zugangsregelung',
        body: 'Der Zutritt zur Baustelle ist nur mit gueltigem Baustellenausweis gestattet. Bitte melden Sie sich taeglich am Baubuero an.',
        sortOrder: 2,
        required: true,
        requireSignature: false,
      },
      {
        templateId: tpl.id,
        title: 'Notfallplan',
        body: 'Im Notfall: Sammelplatz auf dem Parkplatz vor dem Haupteingang. Ersthelfer: siehe Aushang im Baubuero.',
        sortOrder: 3,
        required: false,
        requireSignature: false,
      },
    ],
  });

  // Apply template to first test project
  const firstTestProject = await prisma.project.findFirst({
    where: { projectNumber: 'P-2026-T10' },
  });
  if (firstTestProject) {
    // Create notices as project copies
    const templateNotices = await prisma.checklistTemplateNotice.findMany({
      where: { templateId: tpl.id },
      orderBy: { sortOrder: 'asc' },
    });
    for (const tn of templateNotices) {
      await prisma.projectNotice
        .create({
          data: {
            projectId: firstTestProject.id,
            sourceTemplateId: tpl.id,
            sourceTemplateNoticeId: tn.id,
            title: tn.title,
            body: tn.body,
            sortOrder: tn.sortOrder,
            required: tn.required,
            requireSignature: tn.requireSignature,
          },
        })
        .catch(() => {});
    }

    // Create some acknowledgements
    const projectNotices = await prisma.projectNotice.findMany({
      where: { projectId: firstTestProject.id },
    });
    const assignments = await prisma.projectAssignment.findMany({
      where: { projectId: firstTestProject.id },
      select: { workerId: true },
    });

    if (projectNotices.length > 0 && assignments.length > 0) {
      // First worker acknowledges first notice (with signature)
      await prisma.projectNoticeAcknowledgement
        .create({
          data: {
            projectNoticeId: projectNotices[0].id,
            projectId: firstTestProject.id,
            workerId: assignments[0].workerId,
            acknowledged: true,
            acknowledgedAt: new Date(),
            signatureImagePath:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        })
        .catch(() => {});

      // First worker acknowledges second notice (without signature)
      if (projectNotices.length > 1) {
        await prisma.projectNoticeAcknowledgement
          .create({
            data: {
              projectNoticeId: projectNotices[1].id,
              projectId: firstTestProject.id,
              workerId: assignments[0].workerId,
              acknowledged: true,
              acknowledgedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    }
  }

  console.log('Seed erfolgreich ausgefuehrt.');
  console.log('Admin Login: admin@example.local / admin12345');
  console.log(
    'Monteur PINs: M-1000/1234, M-1001/2345, M-1002/3456, M-1003/4567, M-1004/5678, M-1005/6789',
  );
  console.log(
    `Testdaten: ${testCustomers.length} Kunden, ${projIdx} Projekte, ${createdWorkers.length} Monteure`,
  );
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
