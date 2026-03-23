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
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ThemeToggle } from "./theme-toggle";

type AppSection =
  | "dashboard"
  | "customers"
  | "projects"
  | "workers"
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
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
  };
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
  assignments?: {
    id: string;
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

  const [loginEmail, setLoginEmail] = useState("admin@example.local");
  const [loginPassword, setLoginPassword] = useState("admin12345");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [workerForm, setWorkerForm] = useState<WorkerFormState>(emptyWorkerForm);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [settingsForm, setSettingsForm] = useState<AppSettings>({
    passwordMinLength: 8,
    kioskCodeLength: 6,
    defaultTheme: "dark",
  });
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);

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
        try {
          const body = (await response.json()) as { message?: string | string[] };
          const message = Array.isArray(body.message)
            ? body.message.join(", ")
            : body.message;
          throw new Error(message || fallback);
        } catch {
          throw new Error(fallback);
        }
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
      setAuth(raw ? (JSON.parse(raw) as AuthState) : null);
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuth(null);
    } finally {
      setReady(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!auth) {
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
    } else if (section === "customers") {
      setCustomerForm(emptyCustomerForm());
    }
  }, [section, selectedCustomer]);

  useEffect(() => {
    if (selectedProject) {
      setProjectForm(mapProjectToForm(selectedProject));
      setDocumentForm(emptyDocumentForm());
    } else if (section === "projects") {
      setProjectForm(emptyProjectForm());
    }
  }, [section, selectedProject]);

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
      const nextAuth = await apiFetch<AuthState>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

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
      const payload = sanitizeForApi({
        ...customerForm,
        branches: customerForm.branches.map((branch) => ({
          ...branch,
          active: branch.active ?? true,
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
      const payload = sanitizeForApi({
        ...projectForm,
        priority: Number(projectForm.priority) || 0,
        branchId: projectForm.branchId || undefined,
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
      const payload = sanitizeForApi({
        ...workerForm,
        phone: workerForm.phoneMobile || undefined,
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

  async function handleDelete(path: string, label: string) {
    await runMutation(async () => {
      await apiFetch(path, {
        method: "DELETE",
      });
      await loadData();
      setSuccess(`${label} entfernt.`);
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
      const response = await fetch(`${API_ROOT}/api/documents/${documentId}/download`, {
        headers: auth?.accessToken
          ? {
              Authorization: `Bearer ${auth.accessToken}`,
            }
          : undefined,
      });

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen.");
      }

      const blob = await response.blob();
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
      const response = await fetch(`${API_ROOT}/api/documents/${document.id}/download`, {
        headers: auth?.accessToken
          ? {
              Authorization: `Bearer ${auth.accessToken}`,
            }
          : undefined,
      });

      if (!response.ok) {
        throw new Error("Dokument konnte nicht geladen werden.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      setDocumentPreview((current) => {
        if (current?.url) {
          window.URL.revokeObjectURL(current.url);
        }

        return {
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
      <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-center justify-between rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">CRM Monteur Plattform</p>
              <h1 className="text-3xl font-semibold">Admin Login</h1>
            </div>
            <ThemeToggle />
          </div>

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
            <div className="flex items-center gap-3">
              <PrimaryButton disabled={submitting}>
                {submitting ? "Anmeldung laeuft ..." : "Anmelden"}
              </PrimaryButton>
              <span className="text-sm text-slate-500">
                Demo: `admin@example.local` / `admin12345`
              </span>
            </div>
            <MessageBar error={error} success={success} />
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
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
          />
        ) : null}

        {section === "customers" ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title={selectedCustomer ? "Kunde geoeffnet" : "Kundenliste"}
              subtitle="Klick auf den Kundentitel oeffnet die Kundenseite."
            >
              {selectedCustomer ? (
                <CustomerDetailCard
                  customer={selectedCustomer}
                  documents={filterDocuments(documents, "CUSTOMER", selectedCustomer.id)}
                  onOpenDocument={handleOpenDocument}
                  onDownload={handleDownloadDocument}
                  onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                  documentForm={documentForm}
                  setDocumentForm={setDocumentForm}
                  onUpload={() => void handleDocumentUpload("CUSTOMER", selectedCustomer.id)}
                />
              ) : null}
              <EntityList
                items={customers}
                title={(item) => item.companyName}
                subtitle={(item) => item.customerNumber}
                href={(item) => `/customers/${item.id}`}
                editLabel="Bearbeiten"
                deleteLabel="Loeschen"
                onEdit={(item) => setCustomerForm(mapCustomerToForm(item))}
                onDelete={(item) => void handleDelete(`/customers/${item.id}`, "Kunde")}
              />
            </SectionCard>

            <SectionCard
              title={customerForm.id ? "Kunde bearbeiten" : "Neuen Kunden anlegen"}
              subtitle="Niederlassungen und Ansprechpartner werden direkt mit dem Kunden gepflegt."
            >
              <form className="grid gap-4" onSubmit={handleCustomerSubmit}>
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

                <NestedBlock
                  title="Niederlassungen"
                  onAdd={() =>
                    setCustomerForm((current) => ({
                      ...current,
                      branches: [
                        ...current.branches,
                        { name: "", city: "", country: "DE", active: true },
                      ],
                    }))
                  }
                >
                  {customerForm.branches.map((branch, index) => (
                    <div
                      key={`${branch.id ?? "new"}-${index}`}
                      className="grid gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/10"
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
                  ))}
                </NestedBlock>

                <NestedBlock
                  title="Ansprechpartner"
                  onAdd={() =>
                    setCustomerForm((current) => ({
                      ...current,
                      contacts: [
                        ...current.contacts,
                        { firstName: "", lastName: "", branchId: "", branchName: "" },
                      ],
                    }))
                  }
                >
                  {customerForm.contacts.map((contact, index) => (
                    <div
                      key={`${contact.id ?? "new"}-${index}`}
                      className="grid gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/10"
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
                  ))}
                </NestedBlock>

                <div className="flex gap-3">
                  <PrimaryButton disabled={submitting}>
                    {submitting ? "Speichert ..." : "Kunde speichern"}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setCustomerForm(emptyCustomerForm())}>
                    Zuruecksetzen
                  </SecondaryButton>
                </div>
              </form>
            </SectionCard>
          </div>
        ) : null}

        {section === "projects" ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title={selectedProject ? "Projekt geoeffnet" : "Projektliste"}
              subtitle="Klick auf den Projekttitel oeffnet die Projektseite."
            >
              {selectedProject ? (
                <ProjectDetailCard
                  project={selectedProject}
                  documents={filterDocuments(documents, "PROJECT", selectedProject.id)}
                  onOpenDocument={handleOpenDocument}
                  onDownload={handleDownloadDocument}
                  onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                  documentForm={documentForm}
                  setDocumentForm={setDocumentForm}
                  onUpload={() => void handleDocumentUpload("PROJECT", selectedProject.id)}
                />
              ) : null}
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
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title={selectedWorker ? "Monteur geoeffnet" : "Monteursliste"}
              subtitle="Klick auf den Monteurtitel oeffnet die Monteurseite."
            >
              {selectedWorker ? (
                <WorkerDetailCard
                  worker={selectedWorker}
                  documents={filterDocuments(documents, "WORKER", selectedWorker.id)}
                  onOpenDocument={handleOpenDocument}
                  onDownload={handleDownloadDocument}
                  onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                  documentForm={documentForm}
                  setDocumentForm={setDocumentForm}
                  onUpload={() => void handleDocumentUpload("WORKER", selectedWorker.id)}
                />
              ) : null}
              <EntityList
                items={workers}
                title={(item) => `${item.firstName} ${item.lastName}`}
                subtitle={(item) => item.workerNumber}
                href={(item) => `/workers/${item.id}`}
                editLabel="Bearbeiten"
                deleteLabel="Deaktivieren"
                onEdit={(item) => setWorkerForm(mapWorkerToForm(item))}
                onDelete={(item) => void handleDelete(`/workers/${item.id}`, "Monteur")}
              />
            </SectionCard>

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
    branches: customer.branches ?? [],
    contacts: customer.contacts ?? [],
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
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
}: {
  summary: Summary | null;
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
}) {
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
        <DashboardList
          items={projects}
          href={(item) => `/projects/${item.id}`}
          primary={(item) => item.title}
          secondary={(item) => item.projectNumber}
        />
      </SectionCard>

      <SectionCard title="Monteure">
        <DashboardList
          items={workers}
          href={(item) => `/workers/${item.id}`}
          primary={(item) => `${item.firstName} ${item.lastName}`}
          secondary={(item) => item.workerNumber}
        />
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
  documents,
  onOpenDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  onUpload,
}: {
  customer: Customer;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
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

  return (
    <div className="grid gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
      <div className="grid gap-3">
        <h4 className="font-medium">Niederlassungen</h4>
        {customer.branches.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Niederlassungen vorhanden.</p>
        ) : (
          customer.branches.map((branch, index) => {
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
                className="grid gap-2 rounded-2xl border border-black/10 p-3 dark:border-white/10"
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
          })
        )}
      </div>
      <div className="grid gap-3">
        <h4 className="font-medium">Ansprechpartner</h4>
        {customer.contacts.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Ansprechpartner vorhanden.</p>
        ) : (
          customer.contacts.map((contact, index) => (
            <div
              key={`${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
              className="grid gap-1 rounded-2xl border border-black/10 p-3 text-sm dark:border-white/10"
            >
              <div className="font-medium">
                {contact.firstName} {contact.lastName}
              </div>
              <div className="text-slate-500">
                {contact.email || "Keine E-Mail"} · Mobil: {contact.phoneMobile || "-"} · Buero:{" "}
                {contact.phoneLandline || "-"}
              </div>
            </div>
          ))
        )}
      </div>
      <DocumentPanel
        documents={documents}
        onOpenDocument={onOpenDocument}
        onDownload={onDownload}
        onDeleteDocument={onDeleteDocument}
        documentForm={documentForm}
        setDocumentForm={setDocumentForm}
        onUpload={onUpload}
      />
    </div>
  );
}

function ProjectDetailCard({
  project,
  documents,
  onOpenDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  onUpload,
}: {
  project: Project;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  onUpload: () => void;
}) {
  const projectMapsUrl = mapsUrlFromParts([
    project.title,
    project.siteAddressLine1,
    project.sitePostalCode,
    project.siteCity,
    project.siteCountry,
  ]);

  return (
    <div className="grid gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{project.title}</h3>
          <p className="text-sm text-slate-500">
            {project.projectNumber} · {project.customer?.companyName ?? "Kein Kunde"}
          </p>
        </div>
        {projectMapsUrl ? <MapLinkButton href={projectMapsUrl}>Google Maps</MapLinkButton> : null}
      </div>
      <div className="grid gap-1 text-sm text-slate-500">
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
      <LinkedItemList
        title="Eingeteilte Monteure"
        items={(project.assignments ?? []).map((assignment) => ({
          href: `/workers/${assignment.worker.id}`,
          label: `${assignment.worker.firstName} ${assignment.worker.lastName}`,
          meta: assignment.worker.workerNumber,
        }))}
      />
      <DocumentPanel
        documents={documents}
        onOpenDocument={onOpenDocument}
        onDownload={onDownload}
        onDeleteDocument={onDeleteDocument}
        documentForm={documentForm}
        setDocumentForm={setDocumentForm}
        onUpload={onUpload}
      />
    </div>
  );
}

function WorkerDetailCard({
  worker,
  documents,
  onOpenDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  onUpload,
}: {
  worker: Worker;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
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

  return (
    <div className="grid gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {worker.firstName} {worker.lastName}
          </h3>
          <p className="text-sm text-slate-500">{worker.workerNumber}</p>
        </div>
        {workerMapsUrl ? <MapLinkButton href={workerMapsUrl}>Google Maps</MapLinkButton> : null}
      </div>
      <div className="grid gap-1 text-sm text-slate-500">
        <div>{formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]) || "Keine Adresse hinterlegt."}</div>
        <div>
          {worker.email ?? "Keine E-Mail"} · Mobil: {worker.phoneMobile ?? worker.phone ?? "-"} ·
          Buero: {worker.phoneOffice ?? "-"}
        </div>
      </div>
      <LinkedItemList
        title="Geplante Projekte"
        items={(worker.assignments ?? []).map((assignment) => ({
          href: `/projects/${assignment.project.id}`,
          label: assignment.project.title,
          meta: assignment.project.projectNumber,
        }))}
      />
      <DocumentPanel
        documents={documents}
        onOpenDocument={onOpenDocument}
        onDownload={onDownload}
        onDeleteDocument={onDeleteDocument}
        documentForm={documentForm}
        setDocumentForm={setDocumentForm}
        onUpload={onUpload}
      />
    </div>
  );
}

function DocumentPanel({
  documents,
  onOpenDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  onUpload,
}: {
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  onUpload: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h4 className="font-medium">Dokumente und Bilder</h4>
        <div className="grid gap-2 pt-2">
          {documents.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Dokumente vorhanden.</p>
          ) : (
            documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-2 rounded-2xl border border-black/10 p-3 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
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
                  {document.mimeType.startsWith("image/") ? (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(document)}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Bild anzeigen
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => onOpenDocument(document)}>
                    Anzeigen
                  </SecondaryButton>
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
            ))
          )}
        </div>
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

function DocumentPreviewModal({
  preview,
  onClose,
}: {
  preview: DocumentPreviewState;
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
          <SecondaryButton onClick={onClose}>Schliessen</SecondaryButton>
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
}: {
  title: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
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
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
      />
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
