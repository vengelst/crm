// ── Alle gemeinsamen Typen fuer die CRM-App ──────────────────

export type AppSection =
  | "dashboard"
  | "customers"
  | "projects"
  | "workers"
  | "planning"
  | "reports"
  | "tasks"
  | "settings"
  | "users"
  | "notes";

export type CrmAppProps = {
  section: AppSection;
  entityId?: string;
};

export type Summary = {
  customers: number;
  projects: number;
  workers: number;
  openTimesheets: number;
};

export type AuthState = {
  accessToken: string;
  type: "user" | "worker" | "kiosk-user" | "emergency-admin";
  sessionLang?: "de" | "en";
  /** True wenn der Login per Notfall-/Break-Glass-Pfad erfolgte. */
  emergency?: boolean;
  /** Server-seitig limitierte Token-Lebenszeit in Minuten (nur Notfall-Login). */
  emergencyTtlMinutes?: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    /** Permission codes the user holds (filled by /auth/login + /auth/me; empty for worker tokens). */
    permissions?: string[];
  };
  worker?: {
    id: string;
    workerNumber: string;
    name: string;
    languageCode?: string;
    photoPath?: string | null;
  };
  currentProjects?: AuthProject[];
  futureProjects?: AuthProject[];
  pastProjects?: AuthProject[];
};

export type AuthProject = {
  id: string;
  projectNumber: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string | null;
  siteLatitude: number | null;
  siteLongitude: number | null;
  customerName?: string | null;
};

export type CustomerBranch = {
  id?: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  notes?: string;
  active?: boolean;
};

export type CustomerContact = {
  id?: string;
  branchId?: string;
  branchName?: string;
  firstName: string;
  lastName: string;
  role?: string;
  email?: string;
  phoneMobile?: string;
  phoneLandline?: string;
  isAccountingContact?: boolean;
  isProjectContact?: boolean;
  isSignatory?: boolean;
  notes?: string;
};

export type Customer = {
  id: string;
  customerNumber: string;
  companyName: string;
  legalForm?: string | null;
  status?: string;
  billingEmail?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  vatId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  branches: CustomerBranch[];
  contacts: CustomerContact[];
};

export type ProjectAssignment = {
  id: string;
  worker: {
    id: string;
    workerNumber: string;
    firstName: string;
    lastName: string;
    internalHourlyRate?: number | null;
  };
};

export type Project = {
  id: string;
  projectNumber: string;
  title: string;
  status?: string;
  serviceType?: string;
  description?: string | null;
  customerId: string;
  branchId?: string | null;
  siteName?: string | null;
  siteAddressLine1?: string | null;
  sitePostalCode?: string | null;
  siteCity?: string | null;
  siteCountry?: string | null;
  accommodationAddress?: string | null;
  weeklyFlatRate?: number | null;
  includedHoursPerWeek?: number | null;
  hourlyRateUpTo40h?: number | null;
  overtimeRate?: number | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string | null;
  billingReady?: boolean;
  billingReadyAt?: string | null;
  billingReadyComment?: string | null;
  customer?: { id: string; companyName: string };
  branch?: { id: string; name: string } | null;
  assignments?: ProjectAssignment[];
};

/** Live-Zeiten je Monteur auf einem Projekt (API assignment-time-summary) */
export type ProjectAssignmentTimeSummary = {
  workerId: string;
  workingOnProjectNow: boolean;
  openClockInStartedAt: string | null;
  todayFirstClockInOnProjectAt: string | null;
  todayMinutesOnProject: number;
};

export type Worker = {
  id: string;
  workerNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  phoneMobile?: string | null;
  phoneOffice?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  languageCode?: string | null;
  notes?: string | null;
  active?: boolean;
  internalHourlyRate?: number | null;
  photoPath?: string | null;
  pins?: { id: string }[];
  timeEntries?: {
    id: string;
    entryType: string;
    occurredAtClient: string;
    occurredAtServer: string;
    projectId: string;
    latitude?: number | null;
    longitude?: number | null;
    locationSource?: string | null;
    project?: { id: string; title: string; projectNumber: string };
  }[];
  assignments?: {
    id: string;
    startDate: string;
    endDate?: string | null;
    project: { id: string; title: string; projectNumber: string };
  }[];
};

export type DocumentItem = {
  id: string;
  documentType: string;
  title?: string | null;
  description?: string | null;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  approvalStatus?: string;
  approvalComment?: string | null;
  links: { entityType: string; entityId: string }[];
  uploadedBy?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
  uploadedByWorker?: {
    id: string;
    firstName: string;
    lastName: string;
    workerNumber: string;
  } | null;
};

export type TeamItem = {
  id: string;
  name: string;
  notes?: string | null;
  active: boolean;
  members: {
    id: string;
    role?: string | null;
    worker: { id: string; workerNumber: string; firstName: string; lastName: string };
  }[];
};

export type TeamFormState = {
  id?: string;
  name: string;
  notes: string;
  active: boolean;
  memberWorkerIds: string[];
};

export type RoleItem = { id: string; code: string; name: string };

export type UserItem = {
  id: string;
  email: string;
  displayName: string;
  notes?: string | null;
  isActive: boolean;
  roles: { role: RoleItem }[];
};

export type ProjectFinancials = {
  projectId: string;
  totalHours: number;
  overtimeHours: number;
  baseRevenue: number;
  overtimeRevenue: number;
  totalRevenue: number;
  workerCosts: { workerId: string; name: string; hours: number; rate: number | null; cost: number }[];
  totalCosts: number;
  margin: number;
  weeklyBreakdown: { week: string; hours: number; overtimeHours: number; baseRevenue: number; overtimeRevenue: number }[];
  pricingModel: string;
};

export type CustomerFinancials = {
  customerId: string;
  totalHours: number;
  overtimeHours: number;
  baseRevenue: number;
  overtimeRevenue: number;
  totalRevenue: number;
  totalCosts: number;
  margin: number;
  projects: { projectId: string; projectNumber: string; title: string; hours: number; overtimeHours: number; revenue: number; costs: number; margin: number }[];
};

export type AppSettings = {
  passwordMinLength: number;
  kioskCodeLength: number;
  defaultTheme: "light" | "dark";
  navAsIcons: boolean;
};

export type CustomerFormState = {
  id?: string;
  customerNumber: string;
  companyName: string;
  legalForm: string;
  status: string;
  billingEmail: string;
  phone: string;
  email: string;
  website: string;
  vatId: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  notes: string;
  branches: CustomerBranch[];
  contacts: CustomerContact[];
};

export type ProjectFormState = {
  id?: string;
  projectNumber: string;
  customerId: string;
  branchId: string;
  title: string;
  description: string;
  serviceType: string;
  status: string;
  priority: number;
  siteName: string;
  siteAddressLine1: string;
  sitePostalCode: string;
  siteCity: string;
  siteCountry: string;
  accommodationAddress: string;
  weeklyFlatRate: string;
  includedHoursPerWeek: string;
  hourlyRateUpTo40h: string;
  overtimeRate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  notes: string;
};

export type WorkerFormState = {
  id?: string;
  workerNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneMobile: string;
  phoneOffice: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  languageCode: string;
  notes: string;
  active: boolean;
  internalHourlyRate: string;
  pin: string;
};

export type UserFormState = {
  id?: string;
  email: string;
  displayName: string;
  notes: string;
  password: string;
  kioskCode: string;
  roleCodes: string[];
  isActive: boolean;
};

export type DocumentFormState = {
  title: string;
  description: string;
  documentType: string;
  file: File | null;
};

export type DocumentPreviewState = {
  documentId: string;
  url: string;
  mimeType: string;
  title: string;
};

export type TimesheetItem = {
  id: string;
  weekYear: number;
  weekNumber: number;
  status: string;
  totalMinutesGross: number;
  totalMinutesNet: number;
  totalBreakMinutes: number;
  project: { id: string; title: string; projectNumber: string };
  worker?: { id: string; firstName: string; lastName: string; workerNumber: string };
  signatures: { signerType: string; signerName: string; signedAt: string }[];
  generatedAt?: string;
  approvedAt?: string | null;
  approvalComment?: string | null;
  billedAt?: string | null;
};

export type WorkerTimeStatus = {
  hasOpenWork: boolean;
  openEntry: {
    id: string;
    projectId: string;
    projectTitle: string;
    projectNumber: string;
    startedAt: string;
    latitude?: number | null;
    longitude?: number | null;
    locationSource?: string | null;
  } | null;
  todayStats?: {
    completedMinutes: number;
    openSinceMinutes: number;
    totalMinutes: number;
  };
};

export type PermissionItem = { id: string; code: string; name: string; category: string };
export type SmtpFormState = { host: string; port: string; user: string; password: string; fromEmail: string; secure: boolean };

export type KioskDevice = {
  id: string;
  deviceUuid: string;
  displayName: string | null;
  platform: string | null;
  browser: string | null;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
  notes: string | null;
  assignedWorkerId: string | null;
  assignedUserId: string | null;
  assignedWorker?: { id: string; workerNumber: string; firstName: string; lastName: string } | null;
  assignedUser?: { id: string; displayName: string; email: string } | null;
};

export type DeviceBindingConfig = {
  mode: 'off' | 'warn' | 'enforce';
  appliesTo: 'login' | 'time' | 'both';
};

export type ChecklistItem = {
  id: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  completed: boolean;
  completedAt?: string | null;
  completedByName?: string | null;
  comment?: string | null;
};

export type Checklist = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  items: ChecklistItem[];
};

export type ChecklistTemplateItem = {
  id: string;
  title: string;
  description?: string | null;
  sortOrder: number;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  description?: string | null;
  items: ChecklistTemplateItem[];
};

export type ProjectNotice = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  sortOrder: number;
  required: boolean;
  requireSignature: boolean;
  active: boolean;
  acknowledgements: ProjectNoticeAck[];
};

export type ProjectNoticeAck = {
  id: string;
  workerId: string;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  signatureImagePath?: string | null;
  comment?: string | null;
  worker?: { id: string; firstName: string; lastName: string; workerNumber: string };
};

export type NoteItem = {
  id: string;
  entityType: string;
  customerId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  title?: string | null;
  content: string;
  isPhoneNote?: boolean;
  createdAt: string;
  createdBy?: { id: string; displayName: string; email: string } | null;
  customer?: { id: string; companyName: string; customerNumber: string } | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    customer?: { id: string; companyName: string; customerNumber: string } | null;
  } | null;
  project?: {
    id: string;
    title: string;
    projectNumber: string;
    customerId: string;
  } | null;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  linkType?: string | null;
  linkId?: string | null;
  read: boolean;
  createdAt: string;
};

export type ReminderConfig = {
  enabled: boolean;
  missingTime: boolean;
  openSignatures: boolean;
  openApprovals: boolean;
  projectStart: boolean;
  emailEnabled: boolean;
  intervalHours: number;
};

export type OfficeReminderItem = {
  id: string;
  title: string;
  description?: string | null;
  kind: "TODO" | "CALLBACK" | "FOLLOW_UP";
  status: "OPEN" | "COMPLETED" | "CANCELED";
  dueAt?: string | null;
  remindAt: string;
  channels: string[];
  smsNumber?: string | null;
  assignedUserId: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUser: { id: string; displayName: string; email: string };
  createdBy: { id: string; displayName: string; email: string };
  completedBy?: { id: string; displayName: string; email: string } | null;
  customer?: { id: string; companyName: string; customerNumber: string } | null;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    customer?: { id: string; companyName: string; customerNumber: string } | null;
  } | null;
  project?: {
    id: string;
    title: string;
    projectNumber: string;
    customerId: string;
    customer?: { id: string; companyName: string; customerNumber: string } | null;
  } | null;
  note?: {
    id: string;
    title?: string | null;
    content: string;
    customerId?: string | null;
    contactId?: string | null;
    projectId?: string | null;
  } | null;
};

export type ReminderReferenceData = {
  users: Array<{ id: string; displayName: string; email: string }>;
  customers: Array<{ id: string; companyName: string; customerNumber: string }>;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    customerId: string;
    customer: { id: string; companyName: string; customerNumber: string };
  }>;
  projects: Array<{
    id: string;
    title: string;
    projectNumber: string;
    customerId: string;
    customer: { id: string; companyName: string; customerNumber: string };
  }>;
  notes: Array<{
    id: string;
    title?: string | null;
    content: string;
    customerId?: string | null;
    contactId?: string | null;
    projectId?: string | null;
  }>;
};

export const API_ROOT = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

/**
 * Volle URL zu einem Nest-Pfad (z. B. "/auth/login"). Nest nutzt Global-Prefix "api".
 * Endet NEXT_PUBLIC_API_URL bereits mit "/api" (z. B. "/api" hinter Reverse-Proxy),
 * wird kein zweites Segment eingefügt — vermeidet /api/api/...
 */
export function apiUrl(path: string): string {
  const base = API_ROOT;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) {
    return `${base}${p}`;
  }
  return `${base}/api${p}`;
}

export const AUTH_STORAGE_KEY = "crm-admin-auth";
