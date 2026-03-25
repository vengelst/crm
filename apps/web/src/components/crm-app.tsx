"use client";

import { MapPinned, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type FormEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ThemeToggle } from "./theme-toggle";

type AppSection =
  | "dashboard"
  | "customers"
  | "projects"
  | "workers"
  | "reports"
  | "settings"
  | "users";

type CrmAppProps = {
  section: AppSection;
  entityId?: string;
};

type Summary = {
  customers: number;
  projects: number;
  workers: number;
  openTimesheets: number;
};

type AuthState = {
  accessToken: string;
  type: "user" | "worker";
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
  };
  worker?: {
    id: string;
    workerNumber: string;
    name: string;
  };
  currentProjects?: {
    id: string;
    projectNumber: string;
    title: string;
    status: string;
    startDate: string;
    endDate: string | null;
    siteLatitude: number | null;
    siteLongitude: number | null;
  }[];
  futureProjects?: {
    id: string;
    projectNumber: string;
    title: string;
    status: string;
    startDate: string;
    endDate: string | null;
    siteLatitude: number | null;
    siteLongitude: number | null;
  }[];
};

type CustomerBranch = {
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

type CustomerContact = {
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

type Customer = {
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

type ProjectAssignment = {
  id: string;
  worker: {
    id: string;
    workerNumber: string;
    firstName: string;
    lastName: string;
    internalHourlyRate?: number | null;
  };
};

type Project = {
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
  customer?: {
    id: string;
    companyName: string;
  };
  branch?: {
    id: string;
    name: string;
  } | null;
  assignments?: ProjectAssignment[];
};

type Worker = {
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
  timeEntries?: {
    id: string;
    entryType: string;
    occurredAtServer: string;
    projectId: string;
  }[];
  assignments?: {
    id: string;
    startDate: string;
    endDate?: string | null;
    project: {
      id: string;
      title: string;
      projectNumber: string;
    };
  }[];
};

type DocumentItem = {
  id: string;
  documentType: string;
  title?: string | null;
  description?: string | null;
  originalFilename: string;
  mimeType: string;
  createdAt: string;
  links: {
    entityType: string;
    entityId: string;
  }[];
};

type TeamItem = {
  id: string;
  name: string;
  notes?: string | null;
  active: boolean;
  members: {
    id: string;
    role?: string | null;
    worker: {
      id: string;
      workerNumber: string;
      firstName: string;
      lastName: string;
    };
  }[];
};

type TeamFormState = {
  id?: string;
  name: string;
  notes: string;
  active: boolean;
  memberWorkerIds: string[];
};

type RoleItem = {
  id: string;
  code: string;
  name: string;
};

type UserItem = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: {
    role: RoleItem;
  }[];
};

type ProjectFinancials = {
  projectId: string;
  totalHours: number;
  overtimeHours: number;
  baseRevenue: number;
  overtimeRevenue: number;
  totalRevenue: number;
  workerCosts: {
    workerId: string;
    name: string;
    hours: number;
    rate: number | null;
    cost: number;
  }[];
  totalCosts: number;
  margin: number;
  weeklyBreakdown: {
    week: string;
    hours: number;
    overtimeHours: number;
    baseRevenue: number;
    overtimeRevenue: number;
  }[];
  pricingModel: string;
};

type CustomerFinancials = {
  customerId: string;
  totalHours: number;
  overtimeHours: number;
  baseRevenue: number;
  overtimeRevenue: number;
  totalRevenue: number;
  totalCosts: number;
  margin: number;
  projects: {
    projectId: string;
    projectNumber: string;
    title: string;
    hours: number;
    overtimeHours: number;
    revenue: number;
    costs: number;
    margin: number;
  }[];
};

type AppSettings = {
  passwordMinLength: number;
  kioskCodeLength: number;
  defaultTheme: "light" | "dark";
};

type CustomerFormState = {
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

type ProjectFormState = {
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

type WorkerFormState = {
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

type UserFormState = {
  id?: string;
  email: string;
  displayName: string;
  password: string;
  kioskCode: string;
  roleCodes: string[];
  isActive: boolean;
};

type DocumentFormState = {
  title: string;
  description: string;
  documentType: string;
  file: File | null;
};

type DocumentPreviewState = {
  documentId: string;
  url: string;
  mimeType: string;
  title: string;
};

const API_ROOT = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(
  /\/$/,
  "",
);

const AUTH_STORAGE_KEY = "crm-admin-auth";

const emptyCustomerForm = (): CustomerFormState => ({
  customerNumber: "",
  companyName: "",
  legalForm: "",
  status: "ACTIVE",
  billingEmail: "",
  phone: "",
  email: "",
  website: "",
  vatId: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "DE",
  notes: "",
  branches: [],
  contacts: [],
});

const emptyProjectForm = (): ProjectFormState => ({
  projectNumber: "",
  customerId: "",
  branchId: "",
  title: "",
  description: "",
  serviceType: "OTHER",
  status: "DRAFT",
  priority: 0,
  siteName: "",
  siteAddressLine1: "",
  sitePostalCode: "",
  siteCity: "",
  siteCountry: "DE",
  accommodationAddress: "",
  weeklyFlatRate: "",
  includedHoursPerWeek: "",
  hourlyRateUpTo40h: "",
  overtimeRate: "",
  plannedStartDate: "",
  plannedEndDate: "",
  notes: "",
});

const emptyWorkerForm = (): WorkerFormState => ({
  workerNumber: "",
  firstName: "",
  lastName: "",
  email: "",
  phoneMobile: "",
  phoneOffice: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "DE",
  languageCode: "de",
  notes: "",
  active: true,
  internalHourlyRate: "",
  pin: "",
});

const emptyUserForm = (): UserFormState => ({
  email: "",
  displayName: "",
  password: "",
  kioskCode: "",
  roleCodes: [],
  isActive: true,
});

const emptyDocumentForm = (): DocumentFormState => ({
  title: "",
  description: "",
  documentType: "ALLGEMEIN",
  file: null,
});

function sanitizeForApi<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeForApi(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const nextEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, sanitizeForApi(entry)] as const)
      .filter(([, entry]) => entry !== undefined);

    return Object.fromEntries(nextEntries) as T;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed === "" ? undefined : trimmed) as T;
  }

  return value;
}

export function CrmApp({ section, entityId }: CrmAppProps) {
  const { setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loginTab, setLoginTab] = useState<"admin" | "worker" | "kiosk">("admin");
  const [loginEmail, setLoginEmail] = useState("admin@example.local");
  const [loginPassword, setLoginPassword] = useState("admin12345");
  const [loginWorkerNumber, setLoginWorkerNumber] = useState("");
  const [loginPin, setLoginPin] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [workerForm, setWorkerForm] = useState<WorkerFormState>(emptyWorkerForm);
  const [teamForm, setTeamForm] = useState<TeamFormState>({ name: "", notes: "", active: true, memberWorkerIds: [] });
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [settingsForm, setSettingsForm] = useState<AppSettings>({
    passwordMinLength: 8,
    kioskCodeLength: 6,
    defaultTheme: "dark",
  });
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [projectFinancials, setProjectFinancials] = useState<ProjectFinancials | null>(null);
  const [customerFinancials, setCustomerFinancials] = useState<CustomerFinancials | null>(null);

  const canManageSettings = hasRole(auth, ["SUPERADMIN", "OFFICE"]);
  const canManageUsers = hasRole(auth, ["SUPERADMIN"]);

  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === entityId) ?? null,
    [customers, entityId],
  );
  const selectedProject = useMemo(
    () => projects.find((item) => item.id === entityId) ?? null,
    [projects, entityId],
  );
  const selectedWorker = useMemo(
    () => workers.find((item) => item.id === entityId) ?? null,
    [workers, entityId],
  );

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${API_ROOT}/api${path}`, {
        ...init,
        headers: {
          ...(auth?.accessToken
            ? {
                Authorization: `Bearer ${auth.accessToken}`,
              }
            : {}),
          ...(init?.body instanceof FormData
            ? {}
            : {
                "Content-Type": "application/json",
              }),
          ...init?.headers,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const fallback = `API-Fehler ${response.status}`;
        let message = fallback;
        const rawBody = await response.text();

        if (rawBody.trim()) {
          try {
            const body = JSON.parse(rawBody) as { message?: string | string[] };
            const parsed = Array.isArray(body.message)
              ? body.message.join(", ")
              : body.message;
            if (parsed) {
              message = parsed;
            }
          } catch {
            message = rawBody;
          }
        }

        throw new Error(message);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    },
    [auth?.accessToken],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthState;
        // Alte Daten ohne type-Feld als user behandeln
        if (!parsed.type) parsed.type = "user";
        setAuth(parsed);
      }
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuth(null);
    } finally {
      setReady(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!auth || auth.type === "worker") {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requests: Promise<unknown>[] = [
        apiFetch<Summary>("/dashboard/summary").then(setSummary),
        apiFetch<Customer[]>("/customers").then(setCustomers),
        apiFetch<Project[]>("/projects").then(setProjects),
        apiFetch<Worker[]>("/workers").then(setWorkers),
        apiFetch<DocumentItem[]>("/documents").then(setDocuments),
        apiFetch<TeamItem[]>("/teams").then(setTeams),
      ];

      if (canManageSettings) {
        requests.push(apiFetch<AppSettings>("/settings").then(setSettings));
      }

      if (canManageUsers) {
        requests.push(apiFetch<UserItem[]>("/users").then(setUsers));
        requests.push(apiFetch<RoleItem[]>("/users/roles").then(setRoles));
      }

      await Promise.all(requests);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Daten konnten nicht geladen werden.";
      if (message.includes("401") || message.includes("403")) {
        logout();
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, auth, canManageSettings, canManageUsers]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    void loadData();
  }, [auth, loadData]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setSettingsForm(settings);

    if (typeof window !== "undefined" && !window.localStorage.getItem("theme")) {
      setTheme(settings.defaultTheme);
    }
  }, [setTheme, settings]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerForm(mapCustomerToForm(selectedCustomer));
      setDocumentForm(emptyDocumentForm());
      void apiFetch<CustomerFinancials>(`/customers/${selectedCustomer.id}/financials`).then(setCustomerFinancials).catch(() => setCustomerFinancials(null));
    } else if (section === "customers") {
      setCustomerForm(emptyCustomerForm());
      setCustomerFinancials(null);
    }
  }, [section, selectedCustomer, apiFetch]);

  useEffect(() => {
    if (selectedProject) {
      setProjectForm(mapProjectToForm(selectedProject));
      setDocumentForm(emptyDocumentForm());
      void apiFetch<ProjectFinancials>(`/projects/${selectedProject.id}/financials`).then(setProjectFinancials).catch(() => setProjectFinancials(null));
    } else if (section === "projects") {
      setProjectForm(emptyProjectForm());
      setProjectFinancials(null);
    }
  }, [section, selectedProject, apiFetch]);

  useEffect(() => {
    if (selectedWorker) {
      setWorkerForm(mapWorkerToForm(selectedWorker));
      setDocumentForm(emptyDocumentForm());
    } else if (section === "workers") {
      setWorkerForm(emptyWorkerForm());
    }
  }, [section, selectedWorker]);

  useEffect(() => {
    return () => {
      if (documentPreview?.url) {
        window.URL.revokeObjectURL(documentPreview.url);
      }
    };
  }, [documentPreview]);

  async function apiUpload(path: string, body: FormData) {
    return apiFetch<DocumentItem>(path, {
      method: "POST",
      body,
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<AuthState>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      const nextAuth: AuthState = { ...response, type: "user" };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      }

      setAuth(nextAuth);
      setSuccess("Anmeldung erfolgreich.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<{
        accessToken: string;
        worker: { id: string; workerNumber: string; name: string };
        currentProjects: AuthState["currentProjects"];
        futureProjects: AuthState["futureProjects"];
      }>("/auth/pin-login", {
        method: "POST",
        body: JSON.stringify({
          workerNumber: loginWorkerNumber,
          pin: loginPin,
        }),
      });

      const nextAuth: AuthState = {
        accessToken: response.accessToken,
        type: "worker",
        user: {
          id: response.worker.id,
          email: "",
          displayName: response.worker.name,
          roles: ["WORKER"],
        },
        worker: response.worker,
        currentProjects: response.currentProjects,
        futureProjects: response.futureProjects,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      }

      setAuth(nextAuth);
      setSuccess("Anmeldung erfolgreich.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleKioskLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<{
        accessToken: string;
        worker: { id: string; workerNumber: string; name: string };
        currentProjects: AuthState["currentProjects"];
        futureProjects: AuthState["futureProjects"];
      }>("/auth/kiosk-login", {
        method: "POST",
        body: JSON.stringify({
          pin: loginPin,
        }),
      });

      const nextAuth: AuthState = {
        accessToken: response.accessToken,
        type: "worker",
        user: {
          id: response.worker.id,
          email: "",
          displayName: response.worker.name,
          roles: ["WORKER"],
        },
        worker: response.worker,
        currentProjects: response.currentProjects,
        futureProjects: response.futureProjects,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      }

      setAuth(nextAuth);
      setSuccess("Anmeldung erfolgreich.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    setAuth(null);
    setUsers([]);
    setRoles([]);
    setSettings(null);
    setSummary(null);
    setSuccess(null);
    setError("Sitzung beendet.");
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const { id: _id, branches: _b, contacts: _c, ...formBase } = customerForm;
      const payload = sanitizeForApi({
        ...formBase,
        branches: customerForm.branches.map((b) => ({
          name: b.name,
          addressLine1: b.addressLine1,
          addressLine2: b.addressLine2,
          postalCode: b.postalCode,
          city: b.city,
          country: b.country,
          phone: b.phone,
          email: b.email,
          notes: b.notes,
          active: b.active ?? true,
        })),
        contacts: customerForm.contacts.map((c) => ({
          branchId: c.branchId,
          branchName: c.branchName,
          firstName: c.firstName,
          lastName: c.lastName,
          role: c.role,
          email: c.email,
          phoneMobile: c.phoneMobile,
          phoneLandline: c.phoneLandline,
          isAccountingContact: c.isAccountingContact,
          isProjectContact: c.isProjectContact,
          isSignatory: c.isSignatory,
          notes: c.notes,
        })),
      });

      if (customerForm.id) {
        await apiFetch(`/customers/${customerForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setCustomerForm(emptyCustomerForm());
      await loadData();
      setSuccess("Kunde gespeichert.");
    });
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const { id: _id, ...formWithoutId } = projectForm;
      const payload = sanitizeForApi({
        ...formWithoutId,
        priority: Number(projectForm.priority) || 0,
        branchId: projectForm.branchId || undefined,
        weeklyFlatRate: projectForm.weeklyFlatRate ? Number(projectForm.weeklyFlatRate) : undefined,
        includedHoursPerWeek: projectForm.includedHoursPerWeek ? Number(projectForm.includedHoursPerWeek) : undefined,
        hourlyRateUpTo40h: projectForm.hourlyRateUpTo40h ? Number(projectForm.hourlyRateUpTo40h) : undefined,
        overtimeRate: projectForm.overtimeRate ? Number(projectForm.overtimeRate) : undefined,
        plannedStartDate: projectForm.plannedStartDate || undefined,
        plannedEndDate: projectForm.plannedEndDate || undefined,
      });

      if (projectForm.id) {
        await apiFetch(`/projects/${projectForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/projects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setProjectForm(emptyProjectForm());
      await loadData();
      setSuccess("Projekt gespeichert.");
    });
  }

  async function handleWorkerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const { id: _id, ...formWithoutId } = workerForm;
      const payload = sanitizeForApi({
        ...formWithoutId,
        phone: workerForm.phoneMobile || undefined,
        internalHourlyRate: workerForm.internalHourlyRate ? Number(workerForm.internalHourlyRate) : undefined,
        pin: workerForm.pin || undefined,
      });

      if (workerForm.id) {
        await apiFetch(`/workers/${workerForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/workers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setWorkerForm(emptyWorkerForm());
      await loadData();
      setSuccess("Monteur gespeichert.");
    });
  }

  async function handleTeamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const payload = sanitizeForApi({
        name: teamForm.name,
        notes: teamForm.notes,
        active: teamForm.active,
        members: teamForm.memberWorkerIds.map((wid) => ({ workerId: wid })),
      });

      if (teamForm.id) {
        await apiFetch(`/teams/${teamForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/teams", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] });
      await loadData();
      setSuccess("Team gespeichert.");
    });
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const nextSettings = await apiFetch<AppSettings>("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...settingsForm,
          passwordMinLength: Number(settingsForm.passwordMinLength),
          kioskCodeLength: Number(settingsForm.kioskCodeLength),
        }),
      });

      setSettings(nextSettings);
      setTheme(nextSettings.defaultTheme);
      setSuccess("Einstellungen gespeichert.");
    });
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const payload = sanitizeForApi({
        ...userForm,
        password: userForm.password || undefined,
        kioskCode: userForm.kioskCode || undefined,
      });

      if (userForm.id) {
        await apiFetch(`/users/${userForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setUserForm(emptyUserForm());
      await loadData();
      setSuccess("Benutzer gespeichert.");
    });
  }

  async function handleDelete(path: string, label: string, confirm = false) {
    if (confirm) {
      const ok = window.confirm(
        `Soll ${label === "Kunde" ? "dieser Kunde" : label === "Monteur" ? "dieser Monteur" : label} wirklich endgueltig geloescht werden?\n\nDieser Vorgang kann nicht rueckgaengig gemacht werden.`,
      );
      if (!ok) return;
    }

    await runMutation(async () => {
      await apiFetch(path, {
        method: "DELETE",
      });
      await loadData();
      setSuccess(`${label} geloescht.`);
    });
  }

  async function handleDocumentUpload(entityType: string, targetId: string) {
    if (!documentForm.file) {
      setError("Bitte zuerst eine Datei waehlen.");
      return;
    }

    const file = documentForm.file;

    await runMutation(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("documentType", documentForm.documentType);
      formData.set("title", documentForm.title);
      formData.set("description", documentForm.description);
      formData.set("entityType", entityType);
      formData.set("entityId", targetId);

      await apiUpload("/documents/upload", formData);
      setDocumentForm(emptyDocumentForm());
      await loadData();
      setSuccess("Dokument hochgeladen.");
    });
  }

  async function handleDownloadDocument(documentId: string, filename: string) {
    try {
      const blob = await fetchDocumentBlob(documentId);
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download fehlgeschlagen.");
    }
  }

  async function handleOpenDocument(document: DocumentItem) {
    try {
      const blob = await fetchDocumentBlob(document.id);
      const url = window.URL.createObjectURL(blob);

      setDocumentPreview((current) => {
        if (current?.url) {
          window.URL.revokeObjectURL(current.url);
        }

        return {
          documentId: document.id,
          url,
          mimeType: document.mimeType,
          title: document.title || document.originalFilename,
        };
      });
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Dokument konnte nicht geladen werden.",
      );
    }
  }

  async function handlePrintDocument(document: DocumentItem) {
    await handlePrintDocumentById(document.id);
  }

  async function handlePrintDocumentById(documentId: string) {
    try {
      const blob = await fetchDocumentBlob(documentId);
      const url = window.URL.createObjectURL(blob);
      const iframe = window.document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(() => {
          window.URL.revokeObjectURL(url);
          iframe.remove();
        }, 2000);
      };
      window.document.body.appendChild(iframe);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "Druck fehlgeschlagen.");
    }
  }

  async function fetchDocumentBlob(documentId: string) {
    const response = await fetch(`${API_ROOT}/api/documents/${documentId}/download`, {
      headers: auth?.accessToken
        ? {
            Authorization: `Bearer ${auth.accessToken}`,
          }
        : undefined,
    });

    if (!response.ok) {
      let message = "Dokument konnte nicht geladen werden.";
      const rawBody = await response.text();
      if (rawBody.trim()) {
        try {
          const body = JSON.parse(rawBody) as { message?: string | string[] };
          const parsed = Array.isArray(body.message) ? body.message.join(", ") : body.message;
          if (parsed) {
            message = parsed;
          }
        } catch {
          message = rawBody;
        }
      }
      throw new Error(message);
    }

    return response.blob();
  }

  async function runMutation(work: () => Promise<void>) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await work();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Aktion konnte nicht gespeichert werden.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Lade Anwendung ...</div>;
  }

  if (!auth) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-center justify-between rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">CRM Monteur Plattform</p>
              <h1 className="text-3xl font-semibold">Anmeldung</h1>
            </div>
            <ThemeToggle />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setLoginTab("admin"); setError(null); setSuccess(null); }}
              className={cx(
                "rounded-xl border px-4 py-2 text-sm font-medium transition",
                loginTab === "admin"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
              )}
            >
              Admin Login
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab("worker"); setError(null); setSuccess(null); }}
              className={cx(
                "rounded-xl border px-4 py-2 text-sm font-medium transition",
                loginTab === "worker"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
              )}
            >
              Monteur
            </button>
            <button
              type="button"
              onClick={() => { setLoginTab("kiosk"); setError(null); setSuccess(null); }}
              className={cx(
                "rounded-xl border px-4 py-2 text-sm font-medium transition",
                loginTab === "kiosk"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
              )}
            >
              Kiosk
            </button>
          </div>

          {loginTab === "admin" ? (
            <form
              onSubmit={handleLogin}
              className="grid gap-4 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80"
            >
              <FormRow>
                <Field
                  label="E-Mail"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
                <Field
                  label="Passwort"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </FormRow>
              <PrimaryButton disabled={submitting}>
                {submitting ? "Anmeldung laeuft ..." : "Admin anmelden"}
              </PrimaryButton>
              <MessageBar error={error} success={success} />
            </form>
          ) : loginTab === "worker" ? (
            <form
              onSubmit={handlePinLogin}
              className="grid gap-4 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80"
            >
              <FormRow>
                <Field
                  label="Monteurnummer"
                  value={loginWorkerNumber}
                  onChange={(event) => setLoginWorkerNumber(event.target.value)}
                />
                <Field
                  label="PIN"
                  type="password"
                  value={loginPin}
                  onChange={(event) => setLoginPin(event.target.value)}
                />
              </FormRow>
              <PrimaryButton disabled={submitting}>
                {submitting ? "Anmeldung laeuft ..." : "Monteur anmelden"}
              </PrimaryButton>
              <MessageBar error={error} success={success} />
            </form>
          ) : (
            <form
              onSubmit={handleKioskLogin}
              className="grid gap-4 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80"
            >
              <Field
                label="PIN"
                type="password"
                value={loginPin}
                onChange={(event) => setLoginPin(event.target.value)}
              />
              <p className="text-sm text-slate-500">
                Kioskmodus: Anmeldung nur mit PIN. Das funktioniert nur mit eindeutig vergebenen aktiven Monteur-PINs.
              </p>
              <PrimaryButton disabled={submitting}>
                {submitting ? "Anmeldung laeuft ..." : "Per PIN anmelden"}
              </PrimaryButton>
              <MessageBar error={error} success={success} />
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Monteur-Sicht (nach PIN-Login) ──────────────────────────
  if (auth.type === "worker") {
    return (
      <WorkerTimeView
        auth={auth}
        apiFetch={apiFetch}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">CRM Monteur Plattform</p>
            <h1 className="text-2xl font-semibold">{sectionTitle(section)}</h1>
            <p className="text-sm text-slate-500">
              {auth.user.displayName} · {auth.user.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NavLink href="/dashboard" active={section === "dashboard"}>
              Dashboard
            </NavLink>
            <NavLink href="/customers" active={section === "customers"}>
              Kunden
            </NavLink>
            <NavLink href="/projects" active={section === "projects"}>
              Projekte
            </NavLink>
            <NavLink href="/workers" active={section === "workers"}>
              Monteure
            </NavLink>
            <NavLink href="/reports" active={section === "reports"}>
              Auswertung
            </NavLink>
            {canManageSettings ? (
              <IconNavLink
                href="/settings"
                active={section === "settings" || section === "users"}
                label="Einstellungen"
              >
                <SettingsIcon className="h-4 w-4" />
              </IconNavLink>
            ) : null}
            <ThemeToggle />
            <SecondaryButton onClick={logout}>Abmelden</SecondaryButton>
          </div>
        </div>

        <MessageBar error={error} success={success} />

        {loading ? <InfoCard title="Lade Daten">Die aktuellen Daten werden geladen.</InfoCard> : null}

        {section === "dashboard" ? (
          <DashboardSection
            summary={summary}
            customers={customers}
            projects={projects}
            workers={workers}
            teams={teams}
          />
        ) : null}

        {section === "customers" ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6">
              {selectedCustomer ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/customers" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      Zurueck zur Liste
                    </Link>
                    <h2 className="text-xl font-semibold">Kunde Detail</h2>
                  </div>
                  <CustomerDetailCard
                    customer={selectedCustomer}
                    customerProjects={projects.filter((p) => p.customerId === selectedCustomer.id)}
                    financials={customerFinancials}
                    documents={filterDocuments(documents, "CUSTOMER", selectedCustomer.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={handlePrintDocument}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => void handleDocumentUpload("CUSTOMER", selectedCustomer.id)}
                  />
                </>
              ) : (
                <SectionCard title="Kundenliste" subtitle="Klick auf den Kundentitel oeffnet die Kundenseite." bordered={false}>
                  <EntityList
                    items={customers}
                    title={(item) => item.companyName}
                    subtitle={(item) => item.customerNumber}
                    href={(item) => `/customers/${item.id}`}
                    editLabel="Bearbeiten"
                    deleteLabel="Loeschen"
                    onEdit={(item) => setCustomerForm(mapCustomerToForm(item))}
                    onDelete={(item) => void handleDelete(`/customers/${item.id}`, "Kunde", true)}
                  />
                </SectionCard>
              )}
            </div>
            <form className="grid gap-5" onSubmit={handleCustomerSubmit}>
              {/* ── Stammdaten-Karte ─────────────────────────── */}
              <section className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold">
                    {customerForm.id ? "Kunde bearbeiten" : "Neuen Kunden anlegen"}
                  </h2>
                  <p className="text-sm text-slate-500">Stammdaten und Adresse</p>
                </div>
                <div className="grid gap-4">
                  <FormRow>
                    <Field
                      label="Kundennummer"
                      value={customerForm.customerNumber}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          customerNumber: event.target.value,
                        }))
                      }
                    />
                    <Field
                      label="Firmenname"
                      value={customerForm.companyName}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          companyName: event.target.value,
                        }))
                      }
                    />
                  </FormRow>
                  <FormRow>
                    <Field
                      label="E-Mail"
                      value={customerForm.email}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                    <Field
                      label="Telefon"
                      value={customerForm.phone}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </FormRow>
                  <FormRow>
                    <Field
                      label="Strasse und Hausnummer"
                      value={customerForm.addressLine1}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          addressLine1: event.target.value,
                        }))
                      }
                    />
                    <Field
                      label="Adresszusatz"
                      value={customerForm.addressLine2}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          addressLine2: event.target.value,
                        }))
                      }
                    />
                  </FormRow>
                  <FormRow>
                    <Field
                      label="PLZ"
                      value={customerForm.postalCode}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          postalCode: event.target.value,
                        }))
                      }
                    />
                    <Field
                      label="Ort"
                      value={customerForm.city}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          city: event.target.value,
                        }))
                      }
                    />
                  </FormRow>
                  <FormRow>
                    <Field
                      label="Land"
                      value={customerForm.country}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          country: event.target.value,
                        }))
                      }
                    />
                    <SelectField
                      label="Status"
                      value={customerForm.status}
                      onChange={(event) =>
                        setCustomerForm((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                      options={[
                        { value: "ACTIVE", label: "Aktiv" },
                        { value: "INACTIVE", label: "Inaktiv" },
                      ]}
                    />
                  </FormRow>
                  <TextArea
                    label="Notizen"
                    value={customerForm.notes}
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
              </section>

              {/* ── Niederlassungen-Karte ────────────────────── */}
              <section className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Niederlassungen</h2>
                    <p className="text-sm text-slate-500">Standorte und Filialen des Kunden</p>
                  </div>
                  <SecondaryButton
                    onClick={() =>
                      setCustomerForm((current) => ({
                        ...current,
                        branches: [
                          ...current.branches,
                          { name: "", city: "", country: "DE", active: true },
                        ],
                      }))
                    }
                  >
                    Hinzufuegen
                  </SecondaryButton>
                </div>
                <div className="grid gap-3">
                  {customerForm.branches.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine Niederlassungen angelegt.</p>
                  ) : (
                    customerForm.branches.map((branch, index) => (
                      <div
                        key={`${branch.id ?? "new"}-${index}`}
                        className="grid gap-3 rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40"
                      >
                        <FormRow>
                          <Field
                            label="Name"
                            value={branch.name}
                            onChange={(event) =>
                              updateBranch(index, { name: event.target.value })
                            }
                          />
                          <Field
                            label="Ort"
                            value={branch.city ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { city: event.target.value })
                            }
                          />
                        </FormRow>
                        <FormRow>
                          <Field
                            label="Strasse und Hausnummer"
                            value={branch.addressLine1 ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { addressLine1: event.target.value })
                            }
                          />
                          <Field
                            label="Adresszusatz"
                            value={branch.addressLine2 ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { addressLine2: event.target.value })
                            }
                          />
                        </FormRow>
                        <FormRow>
                          <Field
                            label="PLZ"
                            value={branch.postalCode ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { postalCode: event.target.value })
                            }
                          />
                          <Field
                            label="Land"
                            value={branch.country ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { country: event.target.value })
                            }
                          />
                        </FormRow>
                        <FormRow>
                          <Field
                            label="Telefon"
                            value={branch.phone ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { phone: event.target.value })
                            }
                          />
                          <Field
                            label="E-Mail"
                            value={branch.email ?? ""}
                            onChange={(event) =>
                              updateBranch(index, { email: event.target.value })
                            }
                          />
                        </FormRow>
                        <div className="flex justify-end">
                          <SecondaryButton onClick={() => removeBranch(index)}>
                            Entfernen
                          </SecondaryButton>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* ── Ansprechpartner-Karte ────────────────────── */}
              <section className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Ansprechpartner</h2>
                    <p className="text-sm text-slate-500">Kontaktpersonen des Kunden</p>
                  </div>
                  <SecondaryButton
                    onClick={() =>
                      setCustomerForm((current) => ({
                        ...current,
                        contacts: [
                          ...current.contacts,
                          { firstName: "", lastName: "", branchId: "", branchName: "" },
                        ],
                      }))
                    }
                  >
                    Hinzufuegen
                  </SecondaryButton>
                </div>
                <div className="grid gap-3">
                  {customerForm.contacts.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine Ansprechpartner angelegt.</p>
                  ) : (
                    customerForm.contacts.map((contact, index) => (
                      <div
                        key={`${contact.id ?? "new"}-${index}`}
                        className="grid gap-3 rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40"
                      >
                        <FormRow>
                          <Field
                            label="Vorname"
                            value={contact.firstName}
                            onChange={(event) =>
                              updateContact(index, { firstName: event.target.value })
                            }
                          />
                          <Field
                            label="Nachname"
                            value={contact.lastName}
                            onChange={(event) =>
                              updateContact(index, { lastName: event.target.value })
                            }
                          />
                        </FormRow>
                        <FormRow>
                          <Field
                            label="E-Mail"
                            value={contact.email ?? ""}
                            onChange={(event) =>
                              updateContact(index, { email: event.target.value })
                            }
                          />
                          <SelectField
                            label="Niederlassung"
                            value={
                              contact.branchId
                                ? `id:${contact.branchId}`
                                : contact.branchName
                                  ? `name:${contact.branchName}`
                                  : ""
                            }
                            onChange={(event) => {
                              const value = event.target.value;

                              if (!value) {
                                updateContact(index, {
                                  branchId: undefined,
                                  branchName: undefined,
                                });
                                return;
                              }

                              if (value.startsWith("id:")) {
                                updateContact(index, {
                                  branchId: value.slice(3),
                                  branchName: undefined,
                                });
                                return;
                              }

                              updateContact(index, {
                                branchId: undefined,
                                branchName: value.slice(5),
                              });
                            }}
                            options={[
                              { value: "", label: "Hauptfirma" },
                              ...customerForm.branches.map((branch) => ({
                                value: branch.id ? `id:${branch.id}` : `name:${branch.name}`,
                                label: branch.name,
                              })),
                            ]}
                          />
                        </FormRow>
                        <FormRow>
                          <Field
                            label="Mobil"
                            value={contact.phoneMobile ?? ""}
                            onChange={(event) =>
                              updateContact(index, { phoneMobile: event.target.value })
                            }
                          />
                          <Field
                            label="Buero"
                            value={contact.phoneLandline ?? ""}
                            onChange={(event) =>
                              updateContact(index, { phoneLandline: event.target.value })
                            }
                          />
                        </FormRow>
                        <div className="flex justify-end">
                          <SecondaryButton onClick={() => removeContact(index)}>
                            Entfernen
                          </SecondaryButton>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <div className="flex gap-3">
                <PrimaryButton disabled={submitting}>
                  {submitting ? "Speichert ..." : "Kunde speichern"}
                </PrimaryButton>
                <SecondaryButton onClick={() => setCustomerForm(emptyCustomerForm())}>
                  Zuruecksetzen
                </SecondaryButton>
              </div>
            </form>
          </div>
        ) : null}

        {section === "projects" ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6">
              {selectedProject ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/projects" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      Zurueck zur Liste
                    </Link>
                    <h2 className="text-xl font-semibold">Projekt Detail</h2>
                  </div>
                  <ProjectDetailCard
                    project={selectedProject}
                    financials={projectFinancials}
                    documents={filterDocuments(documents, "PROJECT", selectedProject.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={handlePrintDocument}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => void handleDocumentUpload("PROJECT", selectedProject.id)}
                  />
                </>
              ) : (
                <SectionCard title="Projektliste" subtitle="Klick auf den Projekttitel oeffnet die Projektseite.">
                  <EntityList
                    items={projects}
                    title={(item) => item.title}
                    subtitle={(item) => item.projectNumber}
                    href={(item) => `/projects/${item.id}`}
                    editLabel="Bearbeiten"
                    deleteLabel="Loeschen"
                    onEdit={(item) => setProjectForm(mapProjectToForm(item))}
                    onDelete={(item) => void handleDelete(`/projects/${item.id}`, "Projekt")}
                  />
                </SectionCard>
              )}
            </div>

            <SectionCard
              title={projectForm.id ? "Projekt bearbeiten" : "Neues Projekt anlegen"}
              subtitle="Der Kunde wird direkt dem Projekt zugeordnet."
            >
              <form className="grid gap-4" onSubmit={handleProjectSubmit}>
                <FormRow>
                  <Field
                    label="Projektnummer"
                    value={projectForm.projectNumber}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        projectNumber: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Titel"
                    value={projectForm.title}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <SelectField
                    label="Kunde"
                    value={projectForm.customerId}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        customerId: event.target.value,
                        branchId: "",
                      }))
                    }
                    options={customers.map((customer) => ({
                      value: customer.id,
                      label: `${customer.companyName} (${customer.customerNumber})`,
                    }))}
                  />
                  <SelectField
                    label="Niederlassung"
                    value={projectForm.branchId}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        branchId: event.target.value,
                      }))
                    }
                    options={[
                      { value: "", label: "Keine Niederlassung" },
                      ...availableBranches(customers, projectForm.customerId).map((branch) => ({
                        value: branch.id ?? branch.name,
                        label: branch.name,
                      })),
                    ]}
                  />
                </FormRow>
                <FormRow>
                  <SelectField
                    label="Status"
                    value={projectForm.status}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    options={[
                      { value: "DRAFT", label: "Entwurf" },
                      { value: "PLANNED", label: "Geplant" },
                      { value: "ACTIVE", label: "Aktiv" },
                      { value: "PAUSED", label: "Pausiert" },
                      { value: "COMPLETED", label: "Abgeschlossen" },
                      { value: "CANCELED", label: "Abgebrochen" },
                    ]}
                  />
                  <SelectField
                    label="Leistung"
                    value={projectForm.serviceType}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        serviceType: event.target.value,
                      }))
                    }
                    options={[
                      { value: "VIDEO", label: "Video" },
                      { value: "ELECTRICAL", label: "Elektrik" },
                      { value: "SERVICE", label: "Service" },
                      { value: "OTHER", label: "Sonstiges" },
                    ]}
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Standort"
                    value={projectForm.siteName}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        siteName: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Strasse und Hausnummer"
                    value={projectForm.siteAddressLine1}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        siteAddressLine1: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="PLZ"
                    value={projectForm.sitePostalCode}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        sitePostalCode: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Ort"
                    value={projectForm.siteCity}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        siteCity: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Land"
                    value={projectForm.siteCountry}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        siteCountry: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Unterkunft / Zusatzadresse"
                    value={projectForm.accommodationAddress}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        accommodationAddress: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <div className="rounded-2xl border border-black/10 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-slate-950/30">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Projektpreise</h4>
                  <div className="grid gap-4">
                    <FormRow>
                      <Field
                        label="Wochenpauschale (EUR)"
                        value={projectForm.weeklyFlatRate}
                        onChange={(event) =>
                          setProjectForm((current) => ({
                            ...current,
                            weeklyFlatRate: event.target.value,
                          }))
                        }
                      />
                      <Field
                        label="Inklusivstunden pro Woche"
                        value={projectForm.includedHoursPerWeek}
                        onChange={(event) =>
                          setProjectForm((current) => ({
                            ...current,
                            includedHoursPerWeek: event.target.value,
                          }))
                        }
                      />
                    </FormRow>
                    <FormRow>
                      <Field
                        label="Stundensatz bis 40h (EUR)"
                        value={projectForm.hourlyRateUpTo40h}
                        onChange={(event) =>
                          setProjectForm((current) => ({
                            ...current,
                            hourlyRateUpTo40h: event.target.value,
                          }))
                        }
                      />
                      <Field
                        label="Ueberstundensatz (EUR)"
                        value={projectForm.overtimeRate}
                        onChange={(event) =>
                          setProjectForm((current) => ({
                            ...current,
                            overtimeRate: event.target.value,
                          }))
                        }
                      />
                    </FormRow>
                  </div>
                </div>
                <TextArea
                  label="Beschreibung"
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <div className="flex gap-3">
                  <PrimaryButton disabled={submitting}>
                    {submitting ? "Speichert ..." : "Projekt speichern"}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setProjectForm(emptyProjectForm())}>
                    Zuruecksetzen
                  </SecondaryButton>
                </div>
              </form>
            </SectionCard>
          </div>
        ) : null}

        {section === "workers" ? (
          <>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6">
              {selectedWorker ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/workers" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      Zurueck zur Liste
                    </Link>
                    <h2 className="text-xl font-semibold">Monteur Detail</h2>
                  </div>
                  <WorkerDetailCard
                    worker={selectedWorker}
                    documents={filterDocuments(documents, "WORKER", selectedWorker.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={handlePrintDocument}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => void handleDocumentUpload("WORKER", selectedWorker.id)}
                  />
                </>
              ) : (
                <SectionCard title="Monteursliste" subtitle="Klick auf den Monteurtitel oeffnet die Monteurseite.">
                  <EntityList
                    items={workers}
                    title={(item) => `${item.firstName} ${item.lastName}${item.active === false ? " (deaktiviert)" : ""}`}
                    subtitle={(item) => item.workerNumber}
                    href={(item) => `/workers/${item.id}`}
                    editLabel="Bearbeiten"
                    deleteLabel="Loeschen"
                    onEdit={(item) => setWorkerForm(mapWorkerToForm(item))}
                    onDelete={(item) => void handleDelete(`/workers/${item.id}`, "Monteur", true)}
                  />
                </SectionCard>
              )}
            </div>

            <SectionCard
              title={workerForm.id ? "Monteur bearbeiten" : "Neuen Monteur anlegen"}
              subtitle="Beim Anlegen ist ein PIN Pflicht. Beim Bearbeiten setzt ein neuer Wert den PIN zurueck."
            >
              <form className="grid gap-4" onSubmit={handleWorkerSubmit}>
                <FormRow>
                  <Field
                    label="Nummer"
                    value={workerForm.workerNumber}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        workerNumber: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Vorname"
                    value={workerForm.firstName}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Nachname"
                    value={workerForm.lastName}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="PIN"
                    type="password"
                    value={workerForm.pin}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        pin: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="E-Mail"
                    value={workerForm.email}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Mobil"
                    value={workerForm.phoneMobile}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        phoneMobile: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Buero"
                    value={workerForm.phoneOffice}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        phoneOffice: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Strasse und Hausnummer"
                    value={workerForm.addressLine1}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        addressLine1: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Adresszusatz"
                    value={workerForm.addressLine2}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        addressLine2: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="PLZ"
                    value={workerForm.postalCode}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        postalCode: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <FormRow>
                  <Field
                    label="Ort"
                    value={workerForm.city}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label="Land"
                    value={workerForm.country}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        country: event.target.value,
                      }))
                    }
                  />
                </FormRow>
                <Field
                  label="Interner Stundensatz (EUR)"
                  value={workerForm.internalHourlyRate}
                  onChange={(event) =>
                    setWorkerForm((current) => ({
                      ...current,
                      internalHourlyRate: event.target.value,
                    }))
                  }
                />
                <TextArea
                  label="Notizen"
                  value={workerForm.notes}
                  onChange={(event) =>
                    setWorkerForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
                <div className="flex gap-3">
                  <PrimaryButton disabled={submitting}>
                    {submitting ? "Speichert ..." : "Monteur speichern"}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setWorkerForm(emptyWorkerForm())}>
                    Zuruecksetzen
                  </SecondaryButton>
                </div>
              </form>
            </SectionCard>
          </div>

          {/* ── Teams ────────────────────────────────────── */}
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard title="Monteur-Teams" subtitle="Teams fuer die Projektplanung.">
              {teams.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine Teams angelegt.</p>
              ) : (
                <div className="grid gap-3">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <div className="text-lg font-semibold">{team.name}</div>
                        <p className="text-sm text-slate-500">
                          {team.members.length === 0
                            ? "Keine Mitglieder"
                            : team.members.map((m) => `${m.worker.firstName} ${m.worker.lastName}`).join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <SecondaryButton
                          onClick={() =>
                            setTeamForm({
                              id: team.id,
                              name: team.name,
                              notes: team.notes ?? "",
                              active: team.active,
                              memberWorkerIds: team.members.map((m) => m.worker.id),
                            })
                          }
                        >
                          Bearbeiten
                        </SecondaryButton>
                        <SecondaryButton onClick={() => void handleDelete(`/teams/${team.id}`, "Team")}>
                          Loeschen
                        </SecondaryButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={teamForm.id ? "Team bearbeiten" : "Neues Team anlegen"}
              subtitle="Monteure koennen einem oder mehreren Teams zugeordnet werden."
            >
              <form className="grid gap-4" onSubmit={handleTeamSubmit}>
                <Field
                  label="Teamname"
                  value={teamForm.name}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <TextArea
                  label="Notizen"
                  value={teamForm.notes}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Mitglieder</label>
                  <div className="flex flex-wrap gap-2">
                    {workers.filter((w) => w.active !== false).map((w) => {
                      const checked = teamForm.memberWorkerIds.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setTeamForm((current) => ({
                                ...current,
                                memberWorkerIds: event.target.checked
                                  ? [...current.memberWorkerIds, w.id]
                                  : current.memberWorkerIds.filter((id) => id !== w.id),
                              }));
                            }}
                          />
                          {w.firstName} {w.lastName} ({w.workerNumber})
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-3">
                  <PrimaryButton disabled={submitting}>
                    {submitting ? "Speichert ..." : "Team speichern"}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] })}
                  >
                    Zuruecksetzen
                  </SecondaryButton>
                </div>
              </form>
            </SectionCard>
          </div>
          </>
        ) : null}

        {section === "reports" ? (
          <ReportsSection
            customers={customers}
            projects={projects}
            workers={workers}
            apiFetch={apiFetch}
          />
        ) : null}

        {section === "settings" ? (
          canManageSettings ? (
            <div className="grid gap-6">
              <SectionCard
                title="Admin Einstellungen"
                subtitle="Hier werden die globalen Vorgaben fuer Passwort, Kiosk-Code und Standard-Theme gepflegt."
              >
                <form className="grid gap-4 md:max-w-2xl" onSubmit={handleSettingsSubmit}>
                  <FormRow>
                    <Field
                      label="Minimale Passwortlaenge"
                      type="number"
                      value={String(settingsForm.passwordMinLength)}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          passwordMinLength: Number(event.target.value || 0),
                        }))
                      }
                    />
                    <Field
                      label="Kiosk-Code Laenge"
                      type="number"
                      value={String(settingsForm.kioskCodeLength)}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          kioskCodeLength: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </FormRow>
                  <SelectField
                    label="Standard Theme"
                    value={settingsForm.defaultTheme}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        defaultTheme: event.target.value as AppSettings["defaultTheme"],
                      }))
                    }
                    options={[
                      { value: "dark", label: "Dunkel" },
                      { value: "light", label: "Hell" },
                    ]}
                  />
                  <PrimaryButton disabled={submitting}>
                    {submitting ? "Speichert ..." : "Einstellungen speichern"}
                  </PrimaryButton>
                </form>
              </SectionCard>

              {canManageUsers ? (
                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <SectionCard
                    title="Benutzerverwaltung"
                    subtitle="Rollen steuern, wer welche Bereiche verwalten darf."
                  >
                    <EntityList
                      items={users}
                      title={(item) => item.displayName}
                      subtitle={(item) =>
                        `${item.email} · ${item.roles.map((role) => role.role.name).join(", ")}`
                      }
                      editLabel="Bearbeiten"
                      deleteLabel="Deaktivieren"
                      onEdit={(item) =>
                        setUserForm({
                          id: item.id,
                          email: item.email,
                          displayName: item.displayName,
                          password: "",
                          kioskCode: "",
                          roleCodes: item.roles.map((role) => role.role.code),
                          isActive: item.isActive,
                        })
                      }
                      onDelete={(item) => void handleDelete(`/users/${item.id}`, "Benutzer")}
                    />
                  </SectionCard>

                  <SectionCard
                    title={userForm.id ? "Benutzer bearbeiten" : "Benutzer anlegen"}
                    subtitle="Jeder Benutzer erhaelt Login, Passwort, Kiosk-Code und Rollen."
                  >
                    <form className="grid gap-4" onSubmit={handleUserSubmit}>
                      <Field
                        label="Anzeigename"
                        value={userForm.displayName}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            displayName: event.target.value,
                          }))
                        }
                      />
                      <Field
                        label="E-Mail"
                        value={userForm.email}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                      />
                      <FormRow>
                        <Field
                          label="Passwort"
                          type="password"
                          value={userForm.password}
                          onChange={(event) =>
                            setUserForm((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                        />
                        <Field
                          label="Kiosk-Code"
                          type="password"
                          value={userForm.kioskCode}
                          onChange={(event) =>
                            setUserForm((current) => ({
                              ...current,
                              kioskCode: event.target.value,
                            }))
                          }
                        />
                      </FormRow>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Rollen</label>
                        <div className="flex flex-wrap gap-2">
                          {roles.map((role) => {
                            const checked = userForm.roleCodes.includes(role.code);
                            return (
                              <label
                                key={role.id}
                                className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setUserForm((current) => ({
                                      ...current,
                                      roleCodes: event.target.checked
                                        ? [...current.roleCodes, role.code]
                                        : current.roleCodes.filter((item) => item !== role.code),
                                    }));
                                  }}
                                />
                                {role.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <PrimaryButton disabled={submitting}>
                          {submitting ? "Speichert ..." : "Benutzer speichern"}
                        </PrimaryButton>
                        <SecondaryButton onClick={() => setUserForm(emptyUserForm())}>
                          Zuruecksetzen
                        </SecondaryButton>
                      </div>
                    </form>
                  </SectionCard>
                </div>
              ) : null}
            </div>
          ) : (
            <InfoCard title="Kein Zugriff">Diese Seite ist nur fuer Admin oder Buero sichtbar.</InfoCard>
          )
        ) : null}

        {section === "users" ? null : null}
      </div>
      {documentPreview ? (
        <DocumentPreviewModal
          preview={documentPreview}
          onPrint={() => void handlePrintDocumentById(documentPreview.documentId)}
          onClose={() => {
            window.URL.revokeObjectURL(documentPreview.url);
            setDocumentPreview(null);
          }}
        />
      ) : null}
    </div>
  );

  function updateBranch(index: number, patch: Partial<CustomerBranch>) {
    setCustomerForm((current) => ({
      ...current,
      branches: current.branches.map((branch, branchIndex) =>
        branchIndex === index ? { ...branch, ...patch } : branch,
      ),
    }));
  }

  function removeBranch(index: number) {
    setCustomerForm((current) => ({
      ...current,
      branches: current.branches.filter((_, branchIndex) => branchIndex !== index),
    }));
  }

  function updateContact(index: number, patch: Partial<CustomerContact>) {
    setCustomerForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact,
      ),
    }));
  }

  function removeContact(index: number) {
    setCustomerForm((current) => ({
      ...current,
      contacts: current.contacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  }
}

// ── Monteur Zeiterfassungs-View ──────────────────────────────
type WorkerTimeStatus = {
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
};

function WorkerTimeView({
  auth,
  apiFetch,
  onLogout,
}: {
  auth: AuthState;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<WorkerTimeStatus | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerSuccess, setWorkerSuccess] = useState<string | null>(null);

  const workerId = auth.worker?.id ?? auth.user.id;
  const currentProjects = auth.currentProjects ?? [];
  const futureProjects = auth.futureProjects ?? [];
  const hasOnlyFuture = currentProjects.length === 0 && futureProjects.length > 0;

  const loadStatus = useCallback(async () => {
    try {
      const s = await apiFetch<WorkerTimeStatus>(`/time/status?workerId=${workerId}`);
      setStatus(s);
    } catch {
      setStatus({ hasOpenWork: false, openEntry: null });
    }
  }, [apiFetch, workerId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  type LocationResult = {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    locationSource: string;
  };

  // Letzter bekannter Standort (bleibt ueber die Komponenten-Lebensdauer)
  const lastKnownRef = useRef<{ latitude: number; longitude: number; accuracy?: number; timestamp: number } | null>(null);
  const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000; // 10 Minuten

  function getLocation(projectId?: string): Promise<LocationResult> {
    return new Promise((resolve) => {
      // 1. Live-Standort versuchen
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            // Live erfolgreich → auch als last_known merken
            lastKnownRef.current = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: Date.now(),
            };
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              locationSource: "live",
            });
          },
          () => {
            // Live fehlgeschlagen → Fallback 2: last_known
            resolve(getLastKnownOrFallback(projectId));
          },
          { timeout: 8000, enableHighAccuracy: true },
        );
        return;
      }

      // Kein Geolocation API → Fallback-Kette
      resolve(getLastKnownOrFallback(projectId));
    });
  }

  function getLastKnownOrFallback(projectId?: string): LocationResult {
    // 2. Letzter bekannter Standort (max 10 Minuten alt)
    const lk = lastKnownRef.current;
    if (lk && Date.now() - lk.timestamp < LAST_KNOWN_MAX_AGE_MS) {
      return {
        latitude: lk.latitude,
        longitude: lk.longitude,
        accuracy: lk.accuracy,
        locationSource: "last_known",
      };
    }

    // 3. Projekt-Fallback mit echten Koordinaten
    return getProjectFallback(projectId);
  }

  function getProjectFallback(projectId?: string): LocationResult {
    if (projectId) {
      const project = currentProjects.find((p) => p.id === projectId);
      if (project?.siteLatitude != null && project?.siteLongitude != null) {
        return {
          latitude: project.siteLatitude,
          longitude: project.siteLongitude,
          locationSource: "project_fallback",
        };
      }
    }
    // 4. Gar nichts verfuegbar
    return { locationSource: "none" };
  }

  async function handleClockIn() {
    if (!selectedProjectId) {
      setWorkerError("Bitte zuerst ein Projekt waehlen.");
      return;
    }
    setWorking(true);
    setWorkerError(null);
    setWorkerSuccess(null);
    try {
      const loc = await getLocation(selectedProjectId);
      await apiFetch("/time/clock-in", {
        method: "POST",
        body: JSON.stringify({
          workerId,
          projectId: selectedProjectId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          locationSource: loc.locationSource,
          sourceDevice: "web",
        }),
      });
      setWorkerSuccess("Arbeit gestartet.");
      setSelectedProjectId("");
      await loadStatus();
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Fehler beim Starten.");
    } finally {
      setWorking(false);
    }
  }

  async function handleClockOut() {
    if (!status?.openEntry) return;
    setWorking(true);
    setWorkerError(null);
    setWorkerSuccess(null);
    try {
      const loc = await getLocation(status.openEntry.projectId);
      await apiFetch("/time/clock-out", {
        method: "POST",
        body: JSON.stringify({
          workerId,
          projectId: status.openEntry.projectId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          locationSource: loc.locationSource,
          sourceDevice: "web",
        }),
      });
      setWorkerSuccess("Arbeit beendet.");
      await loadStatus();
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Fehler beim Beenden.");
    } finally {
      setWorking(false);
    }
  }

  const openWork = status?.openEntry;
  const allProjects = [...currentProjects, ...futureProjects];
  const viewingProject = viewingProjectId ? allProjects.find((p) => p.id === viewingProjectId) ?? null : null;

  // ── Projektdetail-Ansicht ─────────────────────────
  if (viewingProject) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Projektdetail</p>
              <h1 className="text-2xl font-semibold">{viewingProject.title}</h1>
              <p className="text-sm text-slate-500">{viewingProject.projectNumber}</p>
            </div>
            <SecondaryButton onClick={() => setViewingProjectId(null)}>Zurueck</SecondaryButton>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <span className="text-slate-500">Projektnummer</span>
                <span className="font-mono">{viewingProject.projectNumber}</span>
                <span className="text-slate-500">Status</span>
                <span>{viewingProject.status}</span>
                <span className="text-slate-500">Zeitraum</span>
                <span>{viewingProject.startDate.slice(0, 10)} bis {viewingProject.endDate?.slice(0, 10) ?? "offen"}</span>
                {viewingProject.siteLatitude != null && viewingProject.siteLongitude != null ? (
                  <>
                    <span className="text-slate-500">Standort</span>
                    <span className="font-mono">{viewingProject.siteLatitude.toFixed(5)}, {viewingProject.siteLongitude.toFixed(5)}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {openWork && openWork.projectId === viewingProject.id ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Laufende Arbeit auf diesem Projekt</div>
              <div className="mt-1 text-sm">Gestartet: <span className="font-mono">{new Date(openWork.startedAt).toLocaleString("de-DE")}</span></div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Hauptansicht ──────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">CRM Monteur Plattform</p>
            <h1 className="text-2xl font-semibold">Zeiterfassung</h1>
            <p className="text-sm text-slate-500">
              {auth.worker?.name} · {auth.worker?.workerNumber}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SecondaryButton onClick={onLogout}>Abmelden</SecondaryButton>
          </div>
        </div>

        <MessageBar error={workerError} success={workerSuccess} />

        {/* ── Laufende Arbeit ──────────────────────────── */}
        {openWork ? (
          <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-50/60 p-6 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Laufende Arbeit</div>
            <div className="text-xl font-semibold">{openWork.projectTitle}</div>
            <p className="text-sm text-slate-500">{openWork.projectNumber}</p>
            <div className="mt-3 grid gap-1 text-sm">
              <div>Gestartet: <span className="font-mono">{new Date(openWork.startedAt).toLocaleString("de-DE")}</span></div>
              {openWork.latitude != null && openWork.longitude != null ? (
                <div className="text-slate-500">Standort: {openWork.latitude.toFixed(5)}, {openWork.longitude.toFixed(5)}</div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={working}
                onClick={() => void handleClockOut()}
                className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {working ? "Beende Arbeit ..." : "Arbeit beenden"}
              </button>
              <SecondaryButton onClick={() => setViewingProjectId(openWork.projectId)}>
                Projekt oeffnen
              </SecondaryButton>
            </div>
          </div>
        ) : null}

        {/* ── Arbeit beginnen (nur wenn keine offene Arbeit) ── */}
        {!openWork && status !== null ? (
          <>
            {hasOnlyFuture ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Du hast derzeit kein aktives Projekt. Deine Zuordnung beginnt erst in der Zukunft.
                </p>
              </div>
            ) : null}

            {currentProjects.length > 0 ? (
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                <h2 className="mb-4 text-lg font-semibold">Arbeit beginnen</h2>
                <div className="grid gap-3">
                  {currentProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={cx(
                        "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition",
                        selectedProjectId === p.id
                          ? "border-slate-900 bg-slate-900/5 ring-2 ring-slate-900/20 dark:border-slate-100 dark:bg-slate-100/5 dark:ring-slate-100/20"
                          : "border-black/10 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cx(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          selectedProjectId === p.id
                            ? "border-slate-900 dark:border-slate-100"
                            : "border-slate-300 dark:border-slate-600",
                        )}>
                          {selectedProjectId === p.id ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-slate-900 dark:bg-slate-100" />
                          ) : null}
                        </div>
                        <div>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-sm text-slate-500">{p.projectNumber}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewingProjectId(p.id); }}
                        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Projekt oeffnen
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={working || !selectedProjectId}
                    onClick={() => void handleClockIn()}
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {working ? "Starte Arbeit ..." : "Arbeit beginnen"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {/* Lade-Zustand */}
        {status === null ? (
          <div className="text-center text-sm text-slate-500">Lade Status ...</div>
        ) : null}

        {/* ── Zukuenftige Projekte ─────────────────────── */}
        {futureProjects.length > 0 ? (
          <SectionCard title="Zukuenftige Projekte">
            <div className="grid gap-3">
              {futureProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <p className="text-sm text-slate-500">{p.projectNumber} · ab {p.startDate.slice(0, 10)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingProjectId(p.id)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    Projekt oeffnen
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function ReportsSection({
  customers,
  projects,
  workers,
  apiFetch,
}: {
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [customerFinancials, setCustomerFinancials] = useState<Record<string, { totalRevenue: number; totalCosts: number; margin: number; totalHours: number }>>({});
  const [loadingFinancials, setLoadingFinancials] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingFinancials(true);

    async function loadAll() {
      const results: Record<string, { totalRevenue: number; totalCosts: number; margin: number; totalHours: number }> = {};
      for (const c of customers) {
        try {
          const f = await apiFetch<{ totalRevenue: number; totalCosts: number; margin: number; totalHours: number }>(`/customers/${c.id}/financials`);
          results[c.id] = f;
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setCustomerFinancials(results);
        setLoadingFinancials(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [apiFetch, customers]);

  const activeWorkers = workers.filter((w) => w.active !== false);

  // Arbeitsstatus pro Monteur
  function workerIsWorking(w: Worker): boolean {
    return w.timeEntries?.[0]?.entryType === "CLOCK_IN";
  }

  const workingCount = activeWorkers.filter(workerIsWorking).length;

  return (
    <div className="grid gap-6">
      {/* Kennzahlen */}
      <div className="grid gap-4 md:grid-cols-4">
        <MiniStat title="Aktive Monteure" value={activeWorkers.length} />
        <MiniStat title="Arbeiten gerade" value={workingCount} />
        <MiniStat title="Aktive Projekte" value={projects.filter((p) => p.status === "ACTIVE").length} />
        <MiniStat title="Kunden" value={customers.length} />
      </div>

      {/* Umsatzuebersicht pro Kunde */}
      <SectionCard title="Umsatz pro Kunde" subtitle="Basierend auf erfassten Stunden und Projektpreisen">
        {loadingFinancials ? (
          <p className="text-sm text-slate-500">Lade Auswertungsdaten ...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-3">Kunde</th>
                  <th className="pb-2 pr-3 text-right">Stunden</th>
                  <th className="pb-2 pr-3 text-right">Umsatz</th>
                  <th className="pb-2 pr-3 text-right">Kosten</th>
                  <th className="pb-2 text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const f = customerFinancials[c.id];
                  return (
                    <tr key={c.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2 pr-3">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.companyName}</Link>
                        <div className="text-xs text-slate-500">{c.customerNumber}</div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalHours} h` : "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalRevenue.toFixed(2)}` : "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalCosts.toFixed(2)}` : "-"}</td>
                      <td className={cx("py-2 text-right font-mono", f && f.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : f ? "text-red-600 dark:text-red-400" : "")}>
                        {f ? `${f.margin.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Monteur-Arbeitsstatus */}
      <SectionCard title="Monteur-Status" subtitle="Aktueller Arbeitsstatus aller aktiven Monteure">
        <div className="grid gap-2">
          {activeWorkers.map((w) => {
            const isWorking = workerIsWorking(w);
            const hasProject = (w.assignments ?? []).length > 0;
            const statusColor = isWorking ? "bg-emerald-500" : hasProject ? "bg-red-500" : "bg-amber-500";
            const statusLabel = isWorking ? "arbeitet" : hasProject ? "nicht gestartet" : "kein Projekt";
            return (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-2 dark:border-white/10">
                <div>
                  <span className="font-medium">{w.firstName} {w.lastName}</span>
                  <span className="ml-2 text-sm text-slate-500">{w.workerNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx("inline-block h-2.5 w-2.5 rounded-full", statusColor)} />
                  <span className="text-xs text-slate-500">{statusLabel}</span>
                  {w.internalHourlyRate != null ? (
                    <span className="ml-2 text-xs font-mono text-slate-400">{w.internalHourlyRate.toFixed(2)} EUR/h</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function sectionTitle(section: AppSection) {
  switch (section) {
    case "dashboard":
      return "Dashboard";
    case "customers":
      return "Kunden";
    case "projects":
      return "Projekte";
    case "workers":
      return "Monteure";
    case "reports":
      return "Auswertung";
    case "settings":
      return "Einstellungen";
    case "users":
      return "Benutzerverwaltung";
    default:
      return "CRM";
  }
}

function hasRole(auth: AuthState | null, roles: string[]) {
  return roles.some((role) => auth?.user.roles.includes(role));
}

function mapCustomerToForm(customer: Customer): CustomerFormState {
  return {
    id: customer.id,
    customerNumber: customer.customerNumber,
    companyName: customer.companyName,
    legalForm: customer.legalForm ?? "",
    status: customer.status ?? "ACTIVE",
    billingEmail: customer.billingEmail ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    website: customer.website ?? "",
    vatId: customer.vatId ?? "",
    addressLine1: customer.addressLine1 ?? "",
    addressLine2: customer.addressLine2 ?? "",
    postalCode: customer.postalCode ?? "",
    city: customer.city ?? "",
    country: customer.country ?? "DE",
    notes: customer.notes ?? "",
    branches: (customer.branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      postalCode: b.postalCode,
      city: b.city,
      country: b.country,
      phone: b.phone,
      email: b.email,
      notes: b.notes,
      active: b.active,
    })),
    contacts: (customer.contacts ?? []).map((c) => ({
      id: c.id,
      branchId: c.branchId,
      branchName: c.branchName,
      firstName: c.firstName,
      lastName: c.lastName,
      role: c.role,
      email: c.email,
      phoneMobile: c.phoneMobile,
      phoneLandline: c.phoneLandline,
      isAccountingContact: c.isAccountingContact,
      isProjectContact: c.isProjectContact,
      isSignatory: c.isSignatory,
      notes: c.notes,
    })),
  };
}

function mapProjectToForm(project: Project): ProjectFormState {
  return {
    id: project.id,
    projectNumber: project.projectNumber,
    customerId: project.customerId,
    branchId: project.branchId ?? "",
    title: project.title,
    description: project.description ?? "",
    serviceType: project.serviceType ?? "OTHER",
    status: project.status ?? "DRAFT",
    priority: 0,
    siteName: project.siteName ?? "",
    siteAddressLine1: project.siteAddressLine1 ?? "",
    sitePostalCode: project.sitePostalCode ?? "",
    siteCity: project.siteCity ?? "",
    siteCountry: project.siteCountry ?? "DE",
    accommodationAddress: project.accommodationAddress ?? "",
    weeklyFlatRate: project.weeklyFlatRate != null ? String(project.weeklyFlatRate) : "",
    includedHoursPerWeek: project.includedHoursPerWeek != null ? String(project.includedHoursPerWeek) : "",
    hourlyRateUpTo40h: project.hourlyRateUpTo40h != null ? String(project.hourlyRateUpTo40h) : "",
    overtimeRate: project.overtimeRate != null ? String(project.overtimeRate) : "",
    plannedStartDate: toDateInput(project.plannedStartDate),
    plannedEndDate: toDateInput(project.plannedEndDate),
    notes: project.notes ?? "",
  };
}

function mapWorkerToForm(worker: Worker): WorkerFormState {
  return {
    id: worker.id,
    workerNumber: worker.workerNumber,
    firstName: worker.firstName,
    lastName: worker.lastName,
    email: worker.email ?? "",
    phoneMobile: worker.phoneMobile ?? worker.phone ?? "",
    phoneOffice: worker.phoneOffice ?? "",
    addressLine1: worker.addressLine1 ?? "",
    addressLine2: worker.addressLine2 ?? "",
    postalCode: worker.postalCode ?? "",
    city: worker.city ?? "",
    country: worker.country ?? "DE",
    languageCode: worker.languageCode ?? "de",
    notes: worker.notes ?? "",
    active: worker.active ?? true,
    internalHourlyRate: worker.internalHourlyRate != null ? String(worker.internalHourlyRate) : "",
    pin: "",
  };
}

function filterDocuments(
  documents: DocumentItem[],
  entityType: string,
  entityId: string,
) {
  return documents.filter((document) =>
    document.links.some(
      (link) => link.entityType === entityType && link.entityId === entityId,
    ),
  );
}

function availableBranches(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.branches ?? [];
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatAddress(parts: Array<string | null | undefined>) {
  return parts.filter((part) => Boolean(part && part.trim())).join(", ");
}

function mapsUrlFromParts(parts: Array<string | null | undefined>) {
  const query = formatAddress(parts);
  if (!query) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-xl border px-3 py-2 text-sm font-medium transition",
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
          : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </Link>
  );
}

function IconNavLink({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition",
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
          : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </Link>
  );
}

function PrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  bordered = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  bordered?: boolean;
}) {
  return (
    <section
      className={cx(
        "rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-slate-900/80",
        bordered && "border border-black/10 dark:border-white/10",
      )}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard title={title}>
      <p className="text-sm text-slate-500">{children}</p>
    </SectionCard>
  );
}

function MessageBar({
  error,
  success,
}: {
  error: string | null;
  success: string | null;
}) {
  if (!error && !success) {
    return null;
  }

  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-3 text-sm",
        error
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
      )}
    >
      {error ?? success}
    </div>
  );
}

function DashboardSection({
  summary,
  customers,
  projects,
  workers,
  teams,
}: {
  summary: Summary | null;
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
  teams: TeamItem[];
}) {
  function workerStatus(w: Worker): { label: string; color: string } {
    const lastEntry = w.timeEntries?.[0];
    if (lastEntry?.entryType === "CLOCK_IN") {
      return { label: "arbeitet", color: "bg-emerald-500" };
    }
    const hasAssignment = (w.assignments ?? []).length > 0;
    if (hasAssignment) {
      return { label: "nicht gestartet", color: "bg-red-500" };
    }
    return { label: "kein Projekt", color: "bg-amber-500" };
  }

  function projectTeamHint(p: Project): string {
    const assignedWorkers = (p.assignments ?? []).map((a) => a.worker);
    if (assignedWorkers.length === 0) return "Keine Monteure zugeordnet";

    // Pruefen ob ein Team alle zugeordneten Monteure abdeckt
    const workerIds = new Set(assignedWorkers.map((w) => w.id));
    for (const team of teams) {
      const teamWorkerIds = new Set(team.members.map((m) => m.worker.id));
      if (workerIds.size > 0 && [...workerIds].every((id) => teamWorkerIds.has(id))) {
        return team.name;
      }
    }

    if (assignedWorkers.length <= 3) {
      return assignedWorkers.map((w) => `${w.firstName} ${w.lastName}`).join(", ");
    }
    return `${assignedWorkers.length} Monteure zugeordnet`;
  }

  return (
    <div className="grid gap-6">
      {summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <MiniStat title="Kunden" value={summary.customers} />
          <MiniStat title="Projekte" value={summary.projects} />
          <MiniStat title="Monteure" value={summary.workers} />
          <MiniStat title="Offene Wochenzettel" value={summary.openTimesheets} />
        </div>
      ) : null}

      <SectionCard title="Kunden">
        <DashboardList
          items={customers}
          href={(item) => `/customers/${item.id}`}
          primary={(item) => item.companyName}
          secondary={(item) => item.customerNumber}
        />
      </SectionCard>

      <SectionCard title="Projekte">
        <div className="grid gap-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
            >
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="text-sm text-slate-500">{p.projectNumber}</div>
              </div>
              <div className="text-right text-xs text-slate-500">{projectTeamHint(p)}</div>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Monteure">
        <div className="grid gap-2">
          {workers.filter((w) => w.active !== false).map((w) => {
            const st = workerStatus(w);
            return (
              <Link
                key={w.id}
                href={`/workers/${w.id}`}
                className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div>
                  <div className="font-medium">{w.firstName} {w.lastName}</div>
                  <div className="text-sm text-slate-500">{w.workerNumber}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx("inline-block h-2.5 w-2.5 rounded-full", st.color)} />
                  <span className="text-xs text-slate-500">{st.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function MiniStat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-semibold">{value}</p>
    </div>
  );
}

function DashboardList<T>({
  items,
  href,
  primary,
  secondary,
}: {
  items: T[];
  href: (item: T) => string;
  primary: (item: T) => string;
  secondary: (item: T) => string;
}) {
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <Link
          key={index}
          href={href(item)}
          className="rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
        >
          <div className="font-medium">{primary(item)}</div>
          <div className="text-sm text-slate-500">{secondary(item)}</div>
        </Link>
      ))}
    </div>
  );
}

function EntityList<T extends { id: string }>({
  items,
  title,
  subtitle,
  href,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  items: T[];
  title: (item: T) => string;
  subtitle: (item: T) => string;
  href?: (item: T) => string;
  editLabel: string;
  deleteLabel: string;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            {href ? (
              <Link href={href(item)} className="text-lg font-semibold hover:underline">
                {title(item)}
              </Link>
            ) : (
              <div className="text-lg font-semibold">{title(item)}</div>
            )}
            <p className="text-sm text-slate-500">{subtitle(item)}</p>
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => onEdit(item)}>{editLabel}</SecondaryButton>
            <SecondaryButton onClick={() => onDelete(item)}>{deleteLabel}</SecondaryButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerDetailCard({
  customer,
  customerProjects,
  financials,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
}: {
  customer: Customer;
  customerProjects: Project[];
  financials: CustomerFinancials | null;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
}) {
  const customerMapsUrl = mapsUrlFromParts([
    customer.companyName,
    customer.addressLine1,
    customer.addressLine2,
    customer.postalCode,
    customer.city,
    customer.country,
  ]);

  const statusLabel = (status?: string) => {
    switch (status) {
      case "DRAFT": return "Entwurf";
      case "PLANNED": return "Geplant";
      case "ACTIVE": return "Aktiv";
      case "PAUSED": return "Pausiert";
      case "COMPLETED": return "Abgeschlossen";
      case "CANCELED": return "Storniert";
      default: return status ?? "-";
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "ACTIVE": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
      case "COMPLETED": return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
      case "PAUSED": return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
      case "CANCELED": return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300";
      default: return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{customer.companyName}</h3>
            <p className="text-sm text-slate-500">{customer.customerNumber}</p>
          </div>
          {customerMapsUrl ? <MapLinkButton href={customerMapsUrl}>Google Maps</MapLinkButton> : null}
        </div>
        <div className="grid gap-1 text-sm text-slate-500">
          <div>{formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]) || "Keine Adresse hinterlegt."}</div>
          <div>{customer.email ?? "Keine E-Mail"} · {customer.phone ?? "Kein Telefon"}</div>
        </div>
      </div>

      {/* ── Niederlassungen ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Niederlassungen</h4>
        {customer.branches.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Niederlassungen vorhanden.</p>
        ) : (
          <div className="grid gap-2">
            {customer.branches.map((branch, index) => {
              const branchMapsUrl = mapsUrlFromParts([
                branch.name,
                branch.addressLine1,
                branch.addressLine2,
                branch.postalCode,
                branch.city,
                branch.country,
              ]);

              return (
                <div
                  key={`${branch.id ?? branch.name}-${index}`}
                  className="grid gap-2 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-medium">{branch.name}</div>
                    {branchMapsUrl ? (
                      <MapLinkButton href={branchMapsUrl}>Google Maps</MapLinkButton>
                    ) : null}
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatAddress([
                      branch.addressLine1,
                      branch.addressLine2,
                      branch.postalCode,
                      branch.city,
                      branch.country,
                    ]) || "Keine Adresse"}
                  </div>
                  <div className="text-sm text-slate-500">
                    {branch.phone || "Kein Telefon"} · {branch.email || "Keine E-Mail"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Ansprechpartner ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Ansprechpartner</h4>
        {customer.contacts.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Ansprechpartner vorhanden.</p>
        ) : (
          <div className="grid gap-2">
            {customer.contacts.map((contact, index) => (
              <div
                key={`${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                className="grid gap-1 rounded-xl bg-slate-50/70 p-3 text-sm dark:bg-slate-950/40"
              >
                <div className="font-medium">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="text-slate-500">
                  {contact.email || "Keine E-Mail"} · Mobil: {contact.phoneMobile || "-"} · Buero:{" "}
                  {contact.phoneLandline || "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Zugeordnete Projekte ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Zugeordnete Projekte</h4>
        {customerProjects.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Projekte zugeordnet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-3">Nr.</th>
                  <th className="pb-2 pr-3">Titel</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3 text-right">Wochenpauschale</th>
                  <th className="pb-2 text-right">Stundensatz</th>
                </tr>
              </thead>
              <tbody>
                {customerProjects.map((project) => (
                  <tr key={project.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{project.projectNumber}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                        {project.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", statusColor(project.status))}>
                        {statusLabel(project.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {project.weeklyFlatRate != null ? `${project.weeklyFlatRate.toFixed(2)} EUR` : "-"}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {project.hourlyRateUpTo40h != null ? `${project.hourlyRateUpTo40h.toFixed(2)} EUR` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Kunden-Auswertung ──────────────────────────────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">Auswertung gesamt</h4>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FinancialKpi label="Stunden gesamt" value={`${financials.totalHours} h`} />
              <FinancialKpi label="davon Ueberstunden" value={`${financials.overtimeHours} h`} />
              <FinancialKpi label="Umsatz gesamt" value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
              <FinancialKpi label="Monteurkosten" value={`${financials.totalCosts.toFixed(2)} EUR`} />
              <FinancialKpi label="Deckungsbeitrag" value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
            </div>

            <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Aufschluesselung</h5>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Grundumsatz</span>
                <span className="text-right font-mono">{financials.baseRevenue.toFixed(2)} EUR</span>
                <span className="text-slate-500">Ueberstundenumsatz</span>
                <span className="text-right font-mono">{financials.overtimeRevenue.toFixed(2)} EUR</span>
                <span className="text-slate-500">Monteurkosten</span>
                <span className="text-right font-mono">-{financials.totalCosts.toFixed(2)} EUR</span>
                <span className="font-medium">Deckungsbeitrag</span>
                <span className={cx("text-right font-mono font-medium", financials.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{financials.margin.toFixed(2)} EUR</span>
              </div>
            </div>

            {financials.projects.length > 0 ? (
              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Pro Projekt</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500">
                        <th className="pb-1 pr-3">Projekt</th>
                        <th className="pb-1 pr-3 text-right">Stunden</th>
                        <th className="pb-1 pr-3 text-right">Umsatz</th>
                        <th className="pb-1 pr-3 text-right">Kosten</th>
                        <th className="pb-1 text-right">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.projects.map((p) => (
                        <tr key={p.projectId} className="border-t border-black/5 dark:border-white/5">
                          <td className="py-1 pr-3">
                            <Link href={`/projects/${p.projectId}`} className="hover:underline">{p.projectNumber}</Link>
                            <span className="ml-1 text-slate-400">{p.title}</span>
                          </td>
                          <td className="py-1 pr-3 text-right font-mono">{p.hours}</td>
                          <td className="py-1 pr-3 text-right font-mono">{p.revenue.toFixed(2)}</td>
                          <td className="py-1 pr-3 text-right font-mono">{p.costs.toFixed(2)}</td>
                          <td className={cx("py-1 text-right font-mono", p.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{p.margin.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Dokumente und Bilder ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <DocumentPanel
          documents={documents}
          onOpenDocument={onOpenDocument}
          onPrintDocument={onPrintDocument}
          onDownload={onDownload}
          onDeleteDocument={onDeleteDocument}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={onUpload}
        />
      </div>
    </div>
  );
}

function ProjectDetailCard({
  project,
  financials,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
}: {
  project: Project;
  financials: ProjectFinancials | null;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
}) {
  const projectMapsUrl = mapsUrlFromParts([
    project.title,
    project.siteAddressLine1,
    project.sitePostalCode,
    project.siteCity,
    project.siteCountry,
  ]);

  const hasPricing = project.weeklyFlatRate != null || project.hourlyRateUpTo40h != null || project.includedHoursPerWeek != null || project.overtimeRate != null;

  const fmt = (value?: number | null) => value != null ? `${value.toFixed(2)} EUR` : "-";

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ──────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{project.title}</h3>
            <p className="text-sm text-slate-500">
              {project.projectNumber} · {project.customer?.companyName ?? "Kein Kunde"}
            </p>
          </div>
          {projectMapsUrl ? <MapLinkButton href={projectMapsUrl}>Google Maps</MapLinkButton> : null}
        </div>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{project.status ?? "Kein Status"}</div>
          <div>
            {formatAddress([
              project.siteAddressLine1,
              project.sitePostalCode,
              project.siteCity,
              project.siteCountry,
            ]) || "Keine Projektadresse hinterlegt."}
          </div>
        </div>
      </div>

      {/* ── Projektpreise ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Projektpreise</h4>
        {hasPricing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-slate-500">Wochenpauschale</div>
            <div className="font-mono">{fmt(project.weeklyFlatRate)}</div>
            <div className="text-slate-500">Inklusivstunden / Woche</div>
            <div className="font-mono">{project.includedHoursPerWeek != null ? `${project.includedHoursPerWeek} h` : "-"}</div>
            <div className="text-slate-500">Stundensatz bis 40h</div>
            <div className="font-mono">{fmt(project.hourlyRateUpTo40h)}</div>
            <div className="text-slate-500">Ueberstundensatz</div>
            <div className="font-mono">{fmt(project.overtimeRate)}</div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Noch keine Preise hinterlegt.</p>
        )}
      </div>

      {/* ── Eingeteilte Monteure mit Stundensatz ────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Eingeteilte Monteure</h4>
        {(project.assignments ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Keine Monteure zugeordnet.</p>
        ) : (
          <div className="grid gap-2">
            {(project.assignments ?? []).map((assignment) => (
              <Link
                key={assignment.id}
                href={`/workers/${assignment.worker.id}`}
                className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div>
                  <div className="font-medium">{assignment.worker.firstName} {assignment.worker.lastName}</div>
                  <div className="text-slate-500">{assignment.worker.workerNumber}</div>
                </div>
                <div className="text-right font-mono text-xs text-slate-500">
                  {assignment.worker.internalHourlyRate != null
                    ? `${assignment.worker.internalHourlyRate.toFixed(2)} EUR/h intern`
                    : "kein Stundensatz"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Auswertung ──────────────────────────────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">Auswertung</h4>
          <div className="grid gap-4">
            {/* Kennzahlen */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FinancialKpi label="Stunden gesamt" value={`${financials.totalHours} h`} />
              <FinancialKpi label="davon Ueberstunden" value={`${financials.overtimeHours} h`} />
              <FinancialKpi label="Umsatz gesamt" value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
              <FinancialKpi label="Monteurkosten" value={`${financials.totalCosts.toFixed(2)} EUR`} />
              <FinancialKpi label="Deckungsbeitrag" value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
            </div>

            {/* Aufschluesselung */}
            <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Umsatzaufschluesselung</h5>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">{financials.pricingModel === "WEEKLY_FLAT_RATE" ? "Wochenpauschale(n)" : "Grundstunden"}</span>
                <span className="text-right font-mono">{financials.baseRevenue.toFixed(2)} EUR</span>
                <span className="text-slate-500">Ueberstundenumsatz</span>
                <span className="text-right font-mono">{financials.overtimeRevenue.toFixed(2)} EUR</span>
                <span className="font-medium">Umsatz gesamt</span>
                <span className="text-right font-mono font-medium">{financials.totalRevenue.toFixed(2)} EUR</span>
              </div>
            </div>

            {/* Monteurkosten Detail */}
            {financials.workerCosts.length > 0 ? (
              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Monteurkosten</h5>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-sm">
                  {financials.workerCosts.map((wc) => (
                    <Fragment key={wc.workerId}>
                      <span className="text-slate-500">{wc.name}</span>
                      <span className="text-right font-mono text-slate-400">{wc.hours} h</span>
                      <span className="text-right font-mono text-slate-400">{wc.rate != null ? `${wc.rate.toFixed(2)} EUR/h` : "-"}</span>
                      <span className="text-right font-mono">{wc.cost.toFixed(2)} EUR</span>
                    </Fragment>
                  ))}
                  <span className="font-medium">Kosten gesamt</span>
                  <span />
                  <span />
                  <span className="text-right font-mono font-medium">{financials.totalCosts.toFixed(2)} EUR</span>
                </div>
              </div>
            ) : null}

            {/* Wochen-Detail */}
            {financials.weeklyBreakdown.length > 0 ? (
              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Wochendetail</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500">
                        <th className="pb-1 pr-3">KW</th>
                        <th className="pb-1 pr-3 text-right">Stunden</th>
                        <th className="pb-1 pr-3 text-right">Ueberst.</th>
                        <th className="pb-1 pr-3 text-right">Grundumsatz</th>
                        <th className="pb-1 text-right">Ueberst.-Umsatz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.weeklyBreakdown.map((w) => (
                        <tr key={w.week} className="border-t border-black/5 dark:border-white/5">
                          <td className="py-1 pr-3 font-mono text-xs">{w.week}</td>
                          <td className="py-1 pr-3 text-right font-mono">{w.hours}</td>
                          <td className="py-1 pr-3 text-right font-mono">{w.overtimeHours}</td>
                          <td className="py-1 pr-3 text-right font-mono">{w.baseRevenue.toFixed(2)}</td>
                          <td className="py-1 text-right font-mono">{w.overtimeRevenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Dokumente ───────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <DocumentPanel
          documents={documents}
          onOpenDocument={onOpenDocument}
          onPrintDocument={onPrintDocument}
          onDownload={onDownload}
          onDeleteDocument={onDeleteDocument}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={onUpload}
        />
      </div>
    </div>
  );
}

function FinancialKpi({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={cx(
      "rounded-xl border p-3",
      warn ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" :
      highlight ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" :
      "border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-950"
    )}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx("text-lg font-semibold font-mono", warn ? "text-red-600 dark:text-red-400" : highlight ? "text-emerald-700 dark:text-emerald-300" : "")}>{value}</div>
    </div>
  );
}

function WorkerDetailCard({
  worker,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
}: {
  worker: Worker;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
}) {
  const workerMapsUrl = mapsUrlFromParts([
    `${worker.firstName} ${worker.lastName}`,
    worker.addressLine1,
    worker.addressLine2,
    worker.postalCode,
    worker.city,
    worker.country,
  ]);

  const now = new Date();
  const allAssignments = worker.assignments ?? [];

  const currentAssignments = allAssignments.filter((a) => {
    const start = new Date(a.startDate);
    const end = a.endDate ? new Date(a.endDate) : null;
    return start <= now && (!end || end >= now);
  });

  const futureAssignments = allAssignments.filter((a) => {
    const start = new Date(a.startDate);
    return start > now;
  });

  const pastAssignments = allAssignments.filter((a) => {
    const end = a.endDate ? new Date(a.endDate) : null;
    return end !== null && end < now;
  });

  const hasOnlyFuture = currentAssignments.length === 0 && futureAssignments.length > 0;

  const formatDateRange = (a: { startDate: string; endDate?: string | null }) => {
    const s = a.startDate.slice(0, 10);
    const e = a.endDate ? a.endDate.slice(0, 10) : "offen";
    return `${s} bis ${e}`;
  };

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ──────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {worker.firstName} {worker.lastName}
            </h3>
            <p className="text-sm text-slate-500">{worker.workerNumber}</p>
          </div>
          {workerMapsUrl ? <MapLinkButton href={workerMapsUrl}>Google Maps</MapLinkButton> : null}
        </div>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]) || "Keine Adresse hinterlegt."}</div>
          <div>
            {worker.email ?? "Keine E-Mail"} · Mobil: {worker.phoneMobile ?? worker.phone ?? "-"} ·
            Buero: {worker.phoneOffice ?? "-"}
          </div>
        </div>
      </div>

      {/* ── Hinweis: nur zukuenftige Projekte ───────────── */}
      {hasOnlyFuture ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Dieser Monteur hat derzeit kein aktives Projekt. Die Zuordnung beginnt erst in der Zukunft.
            Ein Login per PIN ist trotzdem moeglich.
          </p>
        </div>
      ) : null}

      {/* ── Aktuelle Projekte ───────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Aktuelle Projekte</h4>
        {currentAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">Keine laufenden Projekte.</p>
        ) : (
          <div className="grid gap-2">
            {currentAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div className="text-slate-500">{a.project.projectNumber} · {formatDateRange(a)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Zukuenftige Projekte ────────────────────────── */}
      {futureAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">Zukuenftige Projekte</h4>
          <div className="grid gap-2">
            {futureAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div className="text-slate-500">{a.project.projectNumber} · ab {a.startDate.slice(0, 10)}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Vergangene Projekte ─────────────────────────── */}
      {pastAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold text-slate-400">Vergangene Projekte</h4>
          <div className="grid gap-2">
            {pastAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/5 px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div>{a.project.projectNumber} · {formatDateRange(a)}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Dokumente ───────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <DocumentPanel
          documents={documents}
          onOpenDocument={onOpenDocument}
          onPrintDocument={onPrintDocument}
          onDownload={onDownload}
          onDeleteDocument={onDeleteDocument}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={onUpload}
        />
      </div>
    </div>
  );
}

function DocumentPanel({
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
}: {
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
}) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    if (documents.length === 0) {
      setThumbnailUrls({});
      setThumbnailErrors({});
      return;
    }

    type ThumbnailResult =
      | { kind: "error"; id: string; error: string }
      | { kind: "url"; id: string; url: string }
      | { kind: "ok"; id: string };

    async function loadThumbnails() {
      const results: ThumbnailResult[] = await Promise.all(
        documents.map(async (document): Promise<ThumbnailResult> => {
          const isPreviewable =
            document.mimeType.startsWith("image/") || document.mimeType === "application/pdf";
          try {
            const response = await fetch(`${API_ROOT}/api/documents/${document.id}/download`, {
              headers: authToken
                ? { Authorization: `Bearer ${authToken}` }
                : undefined,
            });

            if (!response.ok) {
              let errorMessage = "Datei nicht verfuegbar";
              try {
                const body = (await response.json()) as { message?: string };
                if (body.message) errorMessage = body.message;
              } catch {
                // not JSON
              }
              return { kind: "error", id: document.id, error: errorMessage };
            }

            if (!isPreviewable) {
              return { kind: "ok", id: document.id };
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            createdUrls.push(url);
            return { kind: "url", id: document.id, url };
          } catch {
            return { kind: "error", id: document.id, error: "Datei nicht verfuegbar" };
          }
        }),
      );

      if (cancelled) {
        createdUrls.forEach((url) => window.URL.revokeObjectURL(url));
        return;
      }

      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      for (const result of results) {
        if (result.kind === "error") {
          nextErrors[result.id] = result.error;
        } else if (result.kind === "url") {
          nextUrls[result.id] = result.url;
        }
      }
      setThumbnailUrls(nextUrls);
      setThumbnailErrors(nextErrors);
    }

    void loadThumbnails();

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => window.URL.revokeObjectURL(url));
    };
  }, [authToken, documents]);

  return (
    <div className="grid gap-4">
      <h4 className="text-base font-semibold">Dokumente und Bilder</h4>
      <div className="grid gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Dokumente vorhanden.</p>
        ) : (
          documents.map((document) => {
            const fileError = thumbnailErrors[document.id];
            return (
              <div
                key={document.id}
                className={cx(
                  "flex flex-col gap-2 rounded-2xl border p-3 lg:flex-row lg:items-center lg:justify-between",
                  fileError
                    ? "border-amber-300 bg-amber-50/50 dark:border-amber-500/40 dark:bg-amber-500/5"
                    : "border-black/10 dark:border-white/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <DocumentThumbnail
                    document={document}
                    thumbnailUrl={thumbnailUrls[document.id]}
                    hasError={Boolean(fileError)}
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(document)}
                      className="text-left font-medium hover:underline"
                    >
                      {document.title || document.originalFilename}
                    </button>
                    <div className="text-sm text-slate-500">
                      {document.documentType} · {document.mimeType}
                    </div>
                    {fileError ? (
                      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {fileError}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton onClick={() => onOpenDocument(document)}>
                    Anzeigen
                  </SecondaryButton>
                  <SecondaryButton onClick={() => onPrintDocument(document)}>Drucken</SecondaryButton>
                  <SecondaryButton
                    onClick={() => onDownload(document.id, document.originalFilename)}
                  >
                    Download
                  </SecondaryButton>
                  <SecondaryButton onClick={() => onDeleteDocument(document.id)}>
                    Loeschen
                  </SecondaryButton>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="grid gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/10">
        <Field
          label="Titel"
          value={documentForm.title}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        <Field
          label="Typ"
          value={documentForm.documentType}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              documentType: event.target.value,
            }))
          }
        />
        <TextArea
          label="Beschreibung"
          value={documentForm.description}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        <div className="grid gap-2">
          <label className="text-sm font-medium">Datei oder Bild</label>
          <input
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            capture="environment"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDocumentForm((current) => ({
                ...current,
                file: event.target.files?.[0] ?? null,
              }))
            }
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
          />
          <p className="text-xs text-slate-500">
            Auf dem Handy koennen Bilder direkt mit der Kamera aufgenommen werden.
          </p>
        </div>
        <div>
          <SecondaryButton onClick={onUpload}>Datei / Bild hochladen</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

function LinkedItemList({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; meta?: string }[];
}) {
  return (
    <div className="grid gap-3">
      <h4 className="font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Eintraege vorhanden.</p>
      ) : (
        items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className="rounded-2xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
          >
            <div className="font-medium">{item.label}</div>
            {item.meta ? <div className="text-slate-500">{item.meta}</div> : null}
          </Link>
        ))
      )}
    </div>
  );
}

function MapLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <MapPinned className="h-4 w-4" />
      {children}
    </a>
  );
}

function DocumentThumbnail({
  document,
  thumbnailUrl,
  hasError,
}: {
  document: DocumentItem;
  thumbnailUrl?: string;
  hasError?: boolean;
}) {
  const isImage = document.mimeType.startsWith("image/");
  const isPdf = document.mimeType === "application/pdf";
  const isSpreadsheet = /spreadsheet|excel|\.xls/i.test(document.mimeType);
  const isWordDoc = /word|\.doc/i.test(document.mimeType);

  const ext = document.originalFilename.split(".").pop()?.toUpperCase() ?? "";

  if (hasError) {
    return (
      <div className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950">
        <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">fehlt</span>
      </div>
    );
  }

  if (thumbnailUrl && isImage) {
    return (
      <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-950">
        <img
          src={thumbnailUrl}
          alt={document.title || document.originalFilename}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (thumbnailUrl && isPdf) {
    return (
      <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-950">
        <iframe
          src={thumbnailUrl}
          title={document.title || document.originalFilename}
          className="pointer-events-none h-[200%] w-[200%] origin-top-left scale-50"
        />
      </div>
    );
  }

  // Platzhalter fuer verschiedene Dateitypen
  let icon: ReactNode;
  let label: string;
  let bgClass: string;

  if (isPdf) {
    label = "PDF";
    bgClass = "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-500/30";
    icon = (
      <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  } else if (isImage) {
    label = ext || "Bild";
    bgClass = "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30";
    icon = (
      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    );
  } else if (isSpreadsheet) {
    label = ext || "XLS";
    bgClass = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30";
    icon = (
      <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
      </svg>
    );
  } else if (isWordDoc) {
    label = ext || "DOC";
    bgClass = "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30";
    icon = (
      <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  } else {
    label = ext || "Datei";
    bgClass = "bg-slate-50 dark:bg-slate-950 border-black/10 dark:border-white/10";
    icon = (
      <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  }

  return (
    <div className={cx("flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border", bgClass)}>
      {icon}
      <span className="text-[10px] font-semibold text-slate-500">{label}</span>
    </div>
  );
}

function DocumentPreviewModal({
  preview,
  onPrint,
  onClose,
}: {
  preview: DocumentPreviewState;
  onPrint: () => void;
  onClose: () => void;
}) {
  const isImage = preview.mimeType.startsWith("image/");
  const isPdf = preview.mimeType === "application/pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-3xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{preview.title}</h3>
            <p className="text-sm text-slate-500">{preview.mimeType}</p>
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={onPrint}>Drucken</SecondaryButton>
            <SecondaryButton onClick={onClose}>Schliessen</SecondaryButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-black/10 bg-slate-50 p-2 dark:border-white/10 dark:bg-slate-950">
          {isImage ? (
            <img
              src={preview.url}
              alt={preview.title}
              className="mx-auto max-h-[72vh] w-auto rounded-xl object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={preview.url}
              title={preview.title}
              className="h-[72vh] w-full rounded-xl"
            />
          ) : (
            <div className="flex h-[72vh] items-center justify-center">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-white/10 dark:hover:bg-slate-800"
              >
                Dokument in neuem Tab oeffnen
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NestedBlock({
  title,
  onAdd,
  children,
  bordered = true,
}: {
  title: string;
  onAdd: () => void;
  children: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={cx(
        "grid gap-3 rounded-2xl p-4",
        bordered && "border border-black/10 dark:border-white/10",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <SecondaryButton onClick={onAdd}>Hinzufuegen</SecondaryButton>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isSecret = type === "password";

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          type={isSecret && showSecret ? "text" : type}
          value={value}
          onChange={onChange}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
        />
        {isSecret ? (
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            tabIndex={-1}
          >
            {showSecret ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
      >
        <option value="">Bitte waehlen</option>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <textarea
        value={value}
        onChange={onChange}
        rows={4}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
      />
    </div>
  );
}
