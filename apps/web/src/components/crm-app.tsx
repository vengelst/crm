"use client";

import { Settings as SettingsIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type {
  AppSection, CrmAppProps, Summary, AuthState,
  CustomerBranch, CustomerContact, Customer,
  Project, Worker,
  DocumentItem, TeamItem, TeamFormState,
  RoleItem, UserItem,
  ProjectFinancials, CustomerFinancials,
  AppSettings,
  CustomerFormState, ProjectFormState, WorkerFormState, UserFormState,
  DocumentFormState, DocumentPreviewState,
  TimesheetItem, WorkerTimeStatus,
  PermissionItem, SmtpFormState,
} from "./crm-app/types";
import { API_ROOT, AUTH_STORAGE_KEY } from "./crm-app/types";
import {
  cx, formatAddress, mapsUrlFromParts, toDateInput, sanitizeForApi,
  NavLink, IconNavLink, PrimaryButton, SecondaryButton,
  SectionCard, InfoCard, MessageBar, MiniStat, MapLinkButton,
  FormRow, Field, SelectField, TextArea,
  PrintButton, openPrintWindow,
} from "./crm-app/shared";
import { KioskLoginScreen } from "./crm-app/login";

// Re-export types for page files that import CrmAppProps
export type { CrmAppProps } from "./crm-app/types";


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

export function CrmApp({ section, entityId }: CrmAppProps) {
  const { setTheme } = useTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loginTab, setLoginTab] = useState<"admin" | "kiosk">("admin");
  const [loginEmail, setLoginEmail] = useState("admin@example.local");
  const [loginPassword, setLoginPassword] = useState("admin12345");
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
  const [projectTimesheets, setProjectTimesheets] = useState<TimesheetItem[]>([]);
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
      void apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${selectedProject.id}`).then(setProjectTimesheets).catch(() => setProjectTimesheets([]));
    } else if (section === "projects") {
      setProjectForm(emptyProjectForm());
      setProjectFinancials(null);
      setProjectTimesheets([]);
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
        pastProjects: AuthState["pastProjects"];
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
        pastProjects: response.pastProjects,
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
      const payload = sanitizeForApi({
        customerNumber: customerForm.customerNumber,
        companyName: customerForm.companyName,
        legalForm: customerForm.legalForm,
        status: customerForm.status,
        billingEmail: customerForm.billingEmail,
        phone: customerForm.phone,
        email: customerForm.email,
        website: customerForm.website,
        vatId: customerForm.vatId,
        addressLine1: customerForm.addressLine1,
        addressLine2: customerForm.addressLine2,
        postalCode: customerForm.postalCode,
        city: customerForm.city,
        country: customerForm.country,
        notes: customerForm.notes,
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
      const payload = sanitizeForApi({
        projectNumber: projectForm.projectNumber,
        customerId: projectForm.customerId,
        branchId: projectForm.branchId || undefined,
        title: projectForm.title,
        description: projectForm.description,
        serviceType: projectForm.serviceType,
        status: projectForm.status,
        siteName: projectForm.siteName,
        siteAddressLine1: projectForm.siteAddressLine1,
        sitePostalCode: projectForm.sitePostalCode,
        siteCity: projectForm.siteCity,
        siteCountry: projectForm.siteCountry,
        accommodationAddress: projectForm.accommodationAddress,
        notes: projectForm.notes,
        priority: Number(projectForm.priority) || 0,
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
      const payload = sanitizeForApi({
        workerNumber: workerForm.workerNumber,
        firstName: workerForm.firstName,
        lastName: workerForm.lastName,
        email: workerForm.email,
        phoneMobile: workerForm.phoneMobile,
        phoneOffice: workerForm.phoneOffice,
        addressLine1: workerForm.addressLine1,
        addressLine2: workerForm.addressLine2,
        postalCode: workerForm.postalCode,
        city: workerForm.city,
        country: workerForm.country,
        languageCode: workerForm.languageCode,
        notes: workerForm.notes,
        active: workerForm.active,
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
      <KioskLoginScreen
        loginPin={loginPin}
        setLoginPin={setLoginPin}
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        submitting={submitting}
        error={error}
        success={success}
        onKioskLogin={handleKioskLogin}
        onAdminLogin={handleLogin}
      />
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
            <NavLink href="/planning" active={section === "planning"}>
              Planung
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
                    apiFetch={apiFetch}
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
                    onEdit={(item) => router.push(`/customers/${item.id}`)}
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
                    timesheets={projectTimesheets}
                    documents={filterDocuments(documents, "PROJECT", selectedProject.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={handlePrintDocument}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, "Dokument")}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => void handleDocumentUpload("PROJECT", selectedProject.id)}
                    apiFetch={apiFetch}
                  />
                </>
              ) : (
                <SectionCard title="Projektliste" subtitle="Klick auf den Projekttitel oeffnet die Projektseite.">
                  <div className="mb-3 flex justify-end">
                    <PrintButton onClick={() => {
                      const rows = projects.map((p) => `<tr><td>${p.projectNumber}</td><td>${p.title}</td><td>${p.customer?.companyName ?? "-"}</td><td>${p.status ?? "-"}</td><td>${p.plannedStartDate?.slice(0, 10) ?? "-"} - ${p.plannedEndDate?.slice(0, 10) ?? "offen"}</td></tr>`).join("");
                      openPrintWindow("Projektliste", `<h1>Projektliste</h1><p class="meta">${projects.length} Projekte</p><table><thead><tr><th>Nr.</th><th>Titel</th><th>Kunde</th><th>Status</th><th>Zeitraum</th></tr></thead><tbody>${rows}</tbody></table>`);
                    }} label="Liste drucken" />
                  </div>
                  <EntityList
                    items={projects}
                    title={(item) => item.title}
                    subtitle={(item) => item.projectNumber}
                    href={(item) => `/projects/${item.id}`}
                    editLabel="Bearbeiten"
                    deleteLabel="Loeschen"
                    onEdit={(item) => router.push(`/projects/${item.id}`)}
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
                    onEdit={(item) => router.push(`/workers/${item.id}`)}
                    onDelete={(item) => void handleDelete(`/workers/${item.id}`, "Monteur", true)}
                  />
                </SectionCard>
              )}
            </div>

            <SectionCard
              title={workerForm.id ? "Monteur bearbeiten" : "Neuen Monteur anlegen"}
              subtitle="Monteure melden sich ausschliesslich per PIN im Kiosk an. PIN leer lassen = bestehende PIN bleibt erhalten. Neuer Wert = PIN wird ersetzt."
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
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Kiosk-PIN</label>
                    {workerForm.id && selectedWorker?.pins?.[0]?.pinPlain ? (
                      <div className="mb-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">
                        Aktueller PIN: <span className="font-semibold">{selectedWorker.pins[0].pinPlain}</span>
                      </div>
                    ) : null}
                    <input
                      type="text"
                      value={workerForm.pin}
                      onChange={(event) => setWorkerForm((current) => ({ ...current, pin: event.target.value }))}
                      placeholder={workerForm.id ? "Neuer PIN (leer = bleibt)" : "PIN vergeben"}
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
                    />
                    <p className="text-xs text-slate-500">
                      {workerForm.id ? "Leer lassen = bestehender PIN bleibt. Neuer Wert = PIN wird ersetzt." : "PIN fuer Kiosk-Anmeldung vergeben."}
                    </p>
                  </div>
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

        {section === "planning" ? (
          <PlanningCalendar projects={projects} workers={workers} teams={teams} apiFetch={apiFetch} onDataChanged={() => void loadData()} />
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
            <SettingsPanel
              settingsForm={settingsForm}
              setSettingsForm={setSettingsForm}
              onSettingsSubmit={handleSettingsSubmit}
              users={users}
              roles={roles}
              userForm={userForm}
              setUserForm={setUserForm}
              onUserSubmit={handleUserSubmit}
              onDeleteUser={(id) => void handleDelete(`/users/${id}`, "Benutzer", true)}
              canManageUsers={canManageUsers}
              submitting={submitting}
              apiFetch={apiFetch}
              error={error}
              success={success}
            />
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

// ── Monteur Stundenzettel ────────────────────────────────────

function TimesheetList({ timesheets, apiFetch, title = "Stundenzettel" }: {
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  title?: string;
}) {
  const [emailTsId, setEmailTsId] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [tsMsg, setTsMsg] = useState<string | null>(null);

  async function downloadPdf(tsId: string) {
    try {
      const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");
      const token = typeof window !== "undefined" ? (JSON.parse(window.localStorage.getItem("crm-admin-auth") ?? "{}") as { accessToken?: string }).accessToken ?? "" : "";
      const response = await fetch(`${apiRoot}/api/timesheets/${tsId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("PDF-Fehler");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `stundenzettel-${tsId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setTsMsg("PDF konnte nicht geladen werden."); }
  }

  async function sendEmail() {
    if (!emailTsId || !emailRecipient.trim()) return;
    setSending(true); setTsMsg(null);
    try {
      await apiFetch(`/timesheets/${emailTsId}/send-email`, { method: "POST", body: JSON.stringify({ recipients: emailRecipient.split(",").map((r) => r.trim()).filter(Boolean) }) });
      setTsMsg("E-Mail gesendet."); setEmailTsId(null); setEmailRecipient("");
    } catch (e) { setTsMsg(e instanceof Error ? e.message : "Fehler"); }
    finally { setSending(false); }
  }

  const statusLabel = (s: string) => {
    switch (s) { case "DRAFT": return "Entwurf"; case "WORKER_SIGNED": return "Monteur signiert"; case "CUSTOMER_SIGNED": return "Kunde signiert"; case "COMPLETED": return "Fertig"; case "LOCKED": return "Gesperrt"; default: return s; }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <h4 className="mb-3 text-base font-semibold">{title}</h4>
      {tsMsg ? <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{tsMsg}</div> : null}
      {timesheets.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Stundenzettel vorhanden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="pb-2 pr-2">KW</th>
                <th className="pb-2 pr-2">Monteur</th>
                <th className="pb-2 pr-2">Projekt</th>
                <th className="pb-2 pr-2 text-right">Netto</th>
                <th className="pb-2 pr-2">Status</th>
                <th className="pb-2 pr-2">Signiert</th>
                <th className="pb-2">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((ts) => (
                <tr key={ts.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs">{ts.weekNumber}/{ts.weekYear}</td>
                  <td className="py-2 pr-2 text-xs">{ts.worker ? `${ts.worker.firstName} ${ts.worker.lastName}` : "-"}</td>
                  <td className="py-2 pr-2 text-xs">{ts.project.projectNumber}</td>
                  <td className="py-2 pr-2 text-right font-mono text-xs">{Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m</td>
                  <td className="py-2 pr-2 text-xs">{statusLabel(ts.status)}</td>
                  <td className="py-2 pr-2 text-xs">{ts.signatures.length > 0 ? `${ts.signatures.length}x` : "-"}</td>
                  <td className="py-2 text-xs">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void downloadPdf(ts.id)} className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] hover:bg-slate-50 dark:border-white/10">PDF</button>
                      <button type="button" onClick={() => { setEmailTsId(ts.id); setEmailRecipient(""); }} className="rounded border border-blue-300 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-400">Mail</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {emailTsId ? (
        <div className="mt-3 rounded-xl border-2 border-blue-300 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
          <div className="grid gap-2">
            <Field label="Empfaenger (Komma-getrennt)" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" disabled={sending} onClick={() => void sendEmail()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{sending ? "Sendet..." : "Senden"}</button>
              <SecondaryButton onClick={() => setEmailTsId(null)}>Abbrechen</SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkerTimesheetSection({
  workerId,
  projects,
  apiFetch,
}: {
  workerId: string;
  projects: { id: string; projectNumber: string; title: string }[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [timesheets, setTimesheets] = useState<TimesheetItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [tsError, setTsError] = useState<string | null>(null);
  const [tsSuccess, setTsSuccess] = useState<string | null>(null);
  const [signCanvasRef, setSignCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [signingTsId, setSigningTsId] = useState<string | null>(null);
  const [emailTsId, setEmailTsId] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");

  const loadTimesheets = useCallback(async () => {
    try {
      const all = await apiFetch<TimesheetItem[]>(`/timesheets/weekly?workerId=${workerId}`);
      setTimesheets(all);
    } catch { /* ignore */ }
  }, [apiFetch, workerId]);

  useEffect(() => { void loadTimesheets(); }, [loadTimesheets]);

  const now = new Date();
  const currentWeekYear = now.getFullYear();
  const janFirst = new Date(currentWeekYear, 0, 1);
  const currentWeekNumber = Math.ceil(((now.getTime() - janFirst.getTime()) / 86400000 + janFirst.getDay() + 1) / 7);

  async function generateTimesheet(projectId: string) {
    setGenerating(true); setTsError(null); setTsSuccess(null);
    try {
      await apiFetch("/timesheets/weekly", {
        method: "POST",
        body: JSON.stringify({ workerId, projectId, weekYear: currentWeekYear, weekNumber: currentWeekNumber }),
      });
      setTsSuccess("Stundenzettel erzeugt.");
      await loadTimesheets();
    } catch (e) { setTsError(e instanceof Error ? e.message : "Fehler"); }
    finally { setGenerating(false); }
  }

  async function signTimesheet() {
    if (!signingTsId || !signCanvasRef) return;
    setSigning(true); setTsError(null);
    try {
      const signatureImagePath = signCanvasRef.toDataURL("image/png");
      await apiFetch(`/timesheets/${signingTsId}/worker-sign`, {
        method: "POST",
        body: JSON.stringify({ signerName: "Monteur", signatureImagePath, deviceInfo: "web" }),
      });
      setTsSuccess("Unterschrieben.");
      setSigningTsId(null);
      await loadTimesheets();
    } catch (e) { setTsError(e instanceof Error ? e.message : "Fehler"); }
    finally { setSigning(false); }
  }

  async function sendTimesheetEmail() {
    if (!emailTsId || !emailRecipient.trim()) { setTsError("Bitte Empfaenger eingeben."); return; }
    setSending(true); setTsError(null); setTsSuccess(null);
    try {
      const recipients = emailRecipient.split(",").map((r) => r.trim()).filter(Boolean);
      await apiFetch(`/timesheets/${emailTsId}/send-email`, {
        method: "POST",
        body: JSON.stringify({ recipients }),
      });
      setTsSuccess(`E-Mail gesendet an ${recipients.join(", ")}.`);
      setEmailTsId(null);
      setEmailRecipient("");
    } catch (e) { setTsError(e instanceof Error ? e.message : "Versand fehlgeschlagen."); }
    finally { setSending(false); }
  }

  async function downloadPdf(tsId: string) {
    try {
      const response = await fetch(`${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "")}/api/timesheets/${tsId}/pdf`, {
        headers: { Authorization: `Bearer ${typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem("crm-admin-auth") ?? "{}").accessToken ?? "" : ""}` },
      });
      if (!response.ok) throw new Error("PDF konnte nicht geladen werden.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `stundenzettel-${tsId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setTsError(e instanceof Error ? e.message : "PDF-Fehler"); }
  }

  function initSignCanvas(canvas: HTMLCanvasElement | null) {
    setSignCanvasRef(canvas);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let drawing = false;
    canvas.onpointerdown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
    canvas.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke(); };
    canvas.onpointerup = () => { drawing = false; };
    canvas.onpointerleave = () => { drawing = false; };
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case "DRAFT": return "Entwurf";
      case "WORKER_SIGNED": return "Monteur unterschrieben";
      case "CUSTOMER_SIGNED": return "Kunde unterschrieben";
      case "COMPLETED": return "Abgeschlossen";
      case "LOCKED": return "Gesperrt";
      default: return s;
    }
  };

  return (
    <SectionCard title="Stundenzettel" subtitle="Wochenzettel erzeugen, unterschreiben und herunterladen.">
      <MessageBar error={tsError} success={tsSuccess} />

      {/* Erzeugen */}
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <SecondaryButton key={p.id} onClick={() => void generateTimesheet(p.id)}>
              {generating ? "Erzeugt ..." : `KW ${currentWeekNumber} · ${p.projectNumber}`}
            </SecondaryButton>
          ))}
        </div>

        {/* Liste */}
        {timesheets.length > 0 ? (
          <div className="grid gap-2">
            {timesheets.map((ts) => (
              <div key={ts.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">KW {ts.weekNumber} / {ts.weekYear} · {ts.project.projectNumber}</div>
                    <div className="text-xs text-slate-500">
                      {Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m netto · {statusLabel(ts.status)}
                      {ts.signatures.length > 0 ? ` · ${ts.signatures.map((s) => `${s.signerType === "WORKER" ? "Monteur" : "Kunde"}: ${s.signerName}`).join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void downloadPdf(ts.id)}
                      className="rounded-lg border border-black/10 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">PDF</button>
                    <button type="button" onClick={() => { setEmailTsId(ts.id); setEmailRecipient(""); }}
                      className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400">E-Mail</button>
                    {ts.status === "DRAFT" ? (
                      <button type="button" onClick={() => setSigningTsId(ts.id)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Unterschreiben
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Noch keine Stundenzettel vorhanden.</p>
        )}

        {/* Signatur-Dialog */}
        {signingTsId ? (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <h4 className="mb-2 text-sm font-semibold">Unterschrift</h4>
            <canvas ref={initSignCanvas} width={400} height={150}
              className="w-full rounded-lg border border-black/10 bg-white" style={{ touchAction: "none" }} />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={signing} onClick={() => void signTimesheet()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                {signing ? "Unterschreibt ..." : "Bestaetigen"}
              </button>
              <SecondaryButton onClick={() => setSigningTsId(null)}>Abbrechen</SecondaryButton>
            </div>
          </div>
        ) : null}

        {/* E-Mail-Dialog */}
        {emailTsId ? (
          <div className="rounded-xl border-2 border-blue-300 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
            <h4 className="mb-2 text-sm font-semibold">Stundenzettel per E-Mail senden</h4>
            <div className="grid gap-3">
              <Field
                label="Empfaenger (E-Mail, mehrere mit Komma trennen)"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" disabled={sending} onClick={() => void sendTimesheetEmail()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {sending ? "Sendet ..." : "Senden"}
                </button>
                <SecondaryButton onClick={() => setEmailTsId(null)}>Abbrechen</SecondaryButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function KioskProjectView({ project, timesheets, apiFetch, workerId, authToken }: {
  project: Project;
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  workerId: string;
  authToken: string;
}) {
  // Nur eigene, aktuelle (nicht abgeschlossene) Stundenzettel
  const myCurrentTimesheets = timesheets.filter((ts) =>
    ts.worker?.id === workerId &&
    ts.status !== "COMPLETED" &&
    ts.status !== "LOCKED",
  );

  // Dokumente fuer dieses Projekt laden
  const [projectDocs, setProjectDocs] = useState<DocumentItem[]>([]);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<DocumentItem[]>(`/documents?entityType=PROJECT&entityId=${project.id}`).then(setProjectDocs).catch(() => {});
  }, [apiFetch, project.id]);

  async function uploadDoc() {
    if (!docFile) return;
    setUploading(true); setDocMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", docFile);
      fd.append("documentType", "PROJEKTDOKUMENT");
      fd.append("entityType", "PROJECT");
      fd.append("entityId", project.id);
      await apiFetch("/documents/upload", { method: "POST", body: fd, headers: {} });
      setDocMsg("Dokument hochgeladen.");
      setDocFile(null);
      const docs = await apiFetch<DocumentItem[]>(`/documents?entityType=PROJECT&entityId=${project.id}`);
      setProjectDocs(docs);
    } catch (e) { setDocMsg(e instanceof Error ? e.message : "Upload fehlgeschlagen."); }
    finally { setUploading(false); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-5">
      {/* Stammdaten */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h3 className="text-lg font-semibold">{project.title}</h3>
        <p className="text-sm text-slate-500">{project.projectNumber} · {project.customer?.companyName ?? "-"}</p>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{project.status ?? "-"}</div>
          <div>{formatAddress([project.siteAddressLine1, project.sitePostalCode, project.siteCity, project.siteCountry]) || "Keine Projektadresse"}</div>
          {project.description ? <div className="mt-1">{project.description}</div> : null}
          {project.plannedStartDate ? (
            <div>Zeitraum: {project.plannedStartDate.slice(0, 10)} bis {project.plannedEndDate?.slice(0, 10) ?? "offen"}</div>
          ) : null}
        </div>
      </div>

      {/* Team / zugeordnete Monteure */}
      {(project.assignments ?? []).length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-2 text-sm font-semibold">Mein Team</h4>
          <div className="flex flex-wrap gap-2">
            {(project.assignments ?? []).map((a) => (
              <span key={a.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800">
                {a.worker.firstName} {a.worker.lastName}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Projektdokumente (kein Loeschen fuer Monteur) */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-sm font-semibold">Projektdokumente</h4>
        {docMsg ? <div className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{docMsg}</div> : null}
        {projectDocs.length > 0 ? (
          <div className="grid gap-2">
            {projectDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.title || doc.originalFilename}</div>
                  <div className="text-xs text-slate-500">{doc.mimeType}</div>
                </div>
                <a href={`${apiRoot}/api/documents/${doc.id}/download`}
                  target="_blank" rel="noreferrer"
                  className="shrink-0 rounded-lg border border-black/10 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                  Oeffnen
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Keine Dokumente vorhanden.</p>
        )}
        <div className="mt-3 grid gap-2">
          <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900" />
          {docFile ? (
            <button type="button" disabled={uploading} onClick={() => void uploadDoc()}
              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              {uploading ? "Hochladen..." : "Dokument hochladen"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Nur eigener aktueller Stundenzettel (nicht abgeschlossene) */}
      {myCurrentTimesheets.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-sm font-semibold">Mein aktueller Stundenzettel</h4>
          <div className="grid gap-2">
            {myCurrentTimesheets.map((ts) => (
              <div key={ts.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="font-medium">KW {ts.weekNumber} / {ts.weekYear}</div>
                <div className="text-xs text-slate-500">
                  {Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m netto ·
                  {ts.status === "DRAFT" ? " Entwurf" : ts.status === "WORKER_SIGNED" ? " Monteur signiert" : ` ${ts.status}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OpenWorkCard({ openWork, working, onClockOut, onOpenProject }: {
  openWork: NonNullable<WorkerTimeStatus["openEntry"]>;
  working: boolean;
  onClockOut: () => void;
  onOpenProject: () => void;
}) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(openWork.startedAt).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}h ${String(m).padStart(2, "0")}m`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [openWork.startedAt]);

  const mapsLink = openWork.latitude != null && openWork.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${openWork.latitude},${openWork.longitude}`
    : null;

  return (
    <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-50/60 p-6 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/5">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Laufende Arbeit</div>
      <div className="text-xl font-semibold">{openWork.projectTitle}</div>
      <p className="text-sm text-slate-500">{openWork.projectNumber}</p>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-500">Gestartet:</span>{" "}
            <span className="font-mono">{new Date(openWork.startedAt).toLocaleString("de-DE")}</span>
          </div>
          <div className="rounded-lg bg-emerald-100 px-3 py-1 font-mono text-lg font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            {elapsed}
          </div>
        </div>
        {mapsLink ? (
          <div className="text-slate-500">
            Start-Standort:{" "}
            <a href={mapsLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              {openWork.latitude?.toFixed(5)}, {openWork.longitude?.toFixed(5)} (Karte)
            </a>
          </div>
        ) : (
          <div className="text-slate-400">Kein Start-Standort gespeichert</div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={working} onClick={onClockOut}
          className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
          {working ? "Beende Arbeit ..." : "Arbeit beenden"}
        </button>
        <SecondaryButton onClick={onOpenProject}>Projekt oeffnen</SecondaryButton>
      </div>
    </div>
  );
}

// ── Monteur Zeiterfassungs-View ──────────────────────────────
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
  const pastProjects = auth.pastProjects ?? [];
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
  const [kioskProjectDetail, setKioskProjectDetail] = useState<Project | null>(null);
  const [kioskTimesheets, setKioskTimesheets] = useState<TimesheetItem[]>([]);

  useEffect(() => {
    if (!viewingProjectId) { setKioskProjectDetail(null); setKioskTimesheets([]); return; }
    void apiFetch<Project>(`/projects/${viewingProjectId}`).then(setKioskProjectDetail).catch(() => {});
    void apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${viewingProjectId}`).then(setKioskTimesheets).catch(() => {});
  }, [apiFetch, viewingProjectId]);

  // ── Projektdetail-Ansicht ─────────────────────────
  if (viewingProject && kioskProjectDetail) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={() => setViewingProjectId(null)}>Zurueck</SecondaryButton>
            <h2 className="text-xl font-semibold">Projektdetail</h2>
          </div>

          {openWork && openWork.projectId === viewingProject.id ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Laufende Arbeit auf diesem Projekt</div>
              <div className="mt-1 text-sm">Gestartet: <span className="font-mono">{new Date(openWork.startedAt).toLocaleString("de-DE")}</span></div>
            </div>
          ) : null}

          <KioskProjectView project={kioskProjectDetail} timesheets={kioskTimesheets} apiFetch={apiFetch} workerId={workerId} authToken={auth.accessToken} />
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
          <OpenWorkCard openWork={openWork} working={working} onClockOut={() => void handleClockOut()} onOpenProject={() => setViewingProjectId(openWork.projectId)} />
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
                          <div className="text-sm text-slate-500">{p.projectNumber}{p.customerName ? ` · ${p.customerName}` : ""}</div>
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

        {/* ── Stundenzettel ──────────────────────────── */}
        {currentProjects.length > 0 && status !== null ? (
          <WorkerTimesheetSection workerId={workerId} projects={currentProjects} apiFetch={apiFetch} />
        ) : null}

        {/* ── Zukuenftige Projekte ─────────────────────── */}
        {futureProjects.length > 0 ? (
          <SectionCard title="Zukuenftige Projekte">
            <div className="grid gap-3">
              {futureProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-4 dark:border-white/10">
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <p className="text-sm text-slate-500">{p.projectNumber} · {p.customerName ?? ""} · ab {p.startDate.slice(0, 10)}</p>
                  </div>
                  <button type="button" onClick={() => setViewingProjectId(p.id)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                    Projekt oeffnen
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* ── Vergangene Projekte ──────────────────────── */}
        {pastProjects.length > 0 ? (
          <SectionCard title="Vergangene Projekte">
            <div className="grid gap-3">
              {pastProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/5 p-4 text-slate-500 dark:border-white/5">
                  <div>
                    <div className="font-medium">{p.title}</div>
                    <p className="text-sm">{p.projectNumber} · {p.customerName ?? ""} · {p.startDate.slice(0, 10)} bis {p.endDate?.slice(0, 10) ?? "offen"}</p>
                  </div>
                  <button type="button" onClick={() => setViewingProjectId(p.id)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-400">
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


function CompanySettingsTab({ companyForm, setCompanyForm, onSave, submitting, apiFetch, setPanelSuccess, setPanelError }: {
  companyForm: { name: string; street: string; postalCode: string; city: string; country: string; phone: string; email: string; website: string };
  setCompanyForm: Dispatch<SetStateAction<typeof companyForm>>;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void apiFetch<{ path: string | null }>("/settings/logo").then((r) => setLogoPath(r.path)).catch(() => {});
  }, [apiFetch]);

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ path: string }>("/settings/logo", { method: "POST", body: fd, headers: {} });
      setLogoPath(r.path);
      setPanelSuccess("Logo hochgeladen.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Upload fehlgeschlagen."); }
    finally { setUploading(false); }
  }

  async function deleteLogo() {
    try {
      await apiFetch("/settings/logo", { method: "DELETE" });
      setLogoPath(null);
      setPanelSuccess("Logo entfernt.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler."); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-6">
      <SectionCard title="Firmeninformationen" subtitle="Diese Daten erscheinen auf Stundenzetteln und PDFs.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={onSave}>
          <Field label="Firmenname" value={companyForm.name} onChange={(e) => setCompanyForm((c) => ({ ...c, name: e.target.value }))} />
          <Field label="Strasse / Hausnummer" value={companyForm.street} onChange={(e) => setCompanyForm((c) => ({ ...c, street: e.target.value }))} />
          <FormRow>
            <Field label="PLZ" value={companyForm.postalCode} onChange={(e) => setCompanyForm((c) => ({ ...c, postalCode: e.target.value }))} />
            <Field label="Ort" value={companyForm.city} onChange={(e) => setCompanyForm((c) => ({ ...c, city: e.target.value }))} />
          </FormRow>
          <Field label="Land" value={companyForm.country} onChange={(e) => setCompanyForm((c) => ({ ...c, country: e.target.value }))} />
          <FormRow>
            <Field label="Telefon" value={companyForm.phone} onChange={(e) => setCompanyForm((c) => ({ ...c, phone: e.target.value }))} />
            <Field label="E-Mail" value={companyForm.email} onChange={(e) => setCompanyForm((c) => ({ ...c, email: e.target.value }))} />
          </FormRow>
          <Field label="Website" value={companyForm.website} onChange={(e) => setCompanyForm((c) => ({ ...c, website: e.target.value }))} />
          <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Firmeninformationen speichern"}</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Firmenlogo" subtitle="Logo fuer Stundenzettel und PDF-Dokumente.">
        <div className="grid gap-4">
          {logoPath ? (
            <div className="flex items-center gap-4">
              <img src={`${apiRoot}/api/settings/logo/file?t=${Date.now()}`} alt="Logo" className="h-16 rounded-lg border border-black/10 dark:border-white/10" />
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">Logo vorhanden</p>
                <SecondaryButton onClick={() => void deleteLogo()}>Logo entfernen</SecondaryButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Kein Logo hinterlegt.</p>
          )}
          <div className="grid gap-2">
            <label className="text-sm font-medium">{logoPath ? "Logo ersetzen" : "Logo hochladen"}</label>
            <input type="file" accept="image/png,image/jpeg" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

type BackupEntry = { id: string; createdAt: string; hasDatabase: boolean; databaseStatus?: string; hasSettings: boolean; settingsStatus?: string; hasDocuments: boolean; documentsStatus?: string; sizeBytes: number };

function BackupSettingsTab({ backupForm, setBackupForm, onSaveConfig, submitting, apiFetch, setPanelSuccess, setPanelError }: {
  backupForm: { enabled: boolean; interval: string; time: string; keepCount: string };
  setBackupForm: Dispatch<SetStateAction<typeof backupForm>>;
  onSaveConfig: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreOpts, setRestoreOpts] = useState({ database: true, documents: true, settings: true });
  const [restoring, setRestoring] = useState(false);

  const loadBackups = useCallback(async () => {
    try { const list = await apiFetch<BackupEntry[]>("/settings/backup/list"); setBackups(list); } catch { /* skip */ }
  }, [apiFetch]);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  async function createBackup() {
    setCreating(true); setPanelError(null);
    try {
      await apiFetch("/settings/backup/create", { method: "POST" });
      setPanelSuccess("Backup erstellt.");
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Backup fehlgeschlagen."); }
    finally { setCreating(false); }
  }

  async function deleteBackup(id: string) {
    if (!window.confirm("Backup wirklich loeschen?")) return;
    try {
      await apiFetch(`/settings/backup/${id}`, { method: "DELETE" });
      setPanelSuccess("Backup geloescht.");
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler."); }
  }

  async function restore() {
    if (!restoreId) return;
    if (!window.confirm("ACHTUNG: Ausgewaehlte Daten werden ueberschrieben. Fortfahren?")) return;
    setRestoring(true); setPanelError(null);
    try {
      const r = await apiFetch<{ restored: string[] }>(`/settings/backup/${restoreId}/restore`, {
        method: "POST",
        body: JSON.stringify(restoreOpts),
      });
      setPanelSuccess(r.restored.join(" "));
      setRestoreId(null);
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Restore fehlgeschlagen."); }
    finally { setRestoring(false); }
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  return (
    <div className="grid gap-6">
      <SectionCard title="Manuelles Backup" subtitle="Erstellt ein Backup von Datenbank, Dokumenten und Einstellungen.">
        <button type="button" disabled={creating} onClick={() => void createBackup()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          {creating ? "Erstelle Backup ..." : "Backup jetzt erstellen"}
        </button>
      </SectionCard>

      <SectionCard title="Vorhandene Backups" subtitle={`${backups.length} Backup(s) gespeichert.`}>
        {backups.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Backups vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-2">Erstellt</th>
                  <th className="pb-2 pr-2">Inhalt</th>
                  <th className="pb-2 pr-2 text-right">Groesse</th>
                  <th className="pb-2">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                    <td className="py-2 pr-2 text-xs">{new Date(b.createdAt).toLocaleString("de-DE")}</td>
                    <td className="py-2 pr-2 text-xs">
                      <span className={b.hasDatabase ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>DB:{b.hasDatabase ? "OK" : "Fehler"}</span>
                      {" "}
                      <span className={b.hasSettings ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>Set:{b.hasSettings ? "OK" : "Fehler"}</span>
                      {" "}
                      <span className={b.hasDocuments ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>Dok:{b.hasDocuments ? "OK" : "-"}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">{fmtSize(b.sizeBytes)}</td>
                    <td className="py-2 text-xs">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => { setRestoreId(b.id); setRestoreOpts({ database: true, documents: true, settings: true }); }}
                          className="rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400">Restore</button>
                        <button type="button" onClick={() => void deleteBackup(b.id)}
                          className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400">Loeschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {restoreId ? (
        <SectionCard title="Wiederherstellung" subtitle={`Backup ${restoreId} wiederherstellen.`}>
          <div className="grid gap-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400">
              Achtung: Die ausgewaehlten Daten werden mit dem Backup-Stand ueberschrieben.
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.database} onChange={(e) => setRestoreOpts((c) => ({ ...c, database: e.target.checked }))} /> Datenbank</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.documents} onChange={(e) => setRestoreOpts((c) => ({ ...c, documents: e.target.checked }))} /> Dokumente</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.settings} onChange={(e) => setRestoreOpts((c) => ({ ...c, settings: e.target.checked }))} /> Einstellungen</label>
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={restoring} onClick={() => void restore()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                {restoring ? "Stelle wieder her ..." : "Wiederherstellen"}
              </button>
              <SecondaryButton onClick={() => setRestoreId(null)}>Abbrechen</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Automatische Backups" subtitle="Zeitgesteuerte Datensicherung konfigurieren.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={onSaveConfig}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={backupForm.enabled} onChange={(e) => setBackupForm((c) => ({ ...c, enabled: e.target.checked }))} />
            Automatische Backups aktiviert
          </label>
          <FormRow>
            <SelectField label="Intervall" value={backupForm.interval} onChange={(e) => setBackupForm((c) => ({ ...c, interval: e.target.value }))}
              options={[{ value: "daily", label: "Taeglich" }, { value: "weekly", label: "Woechentlich" }, { value: "monthly", label: "Monatlich" }]} />
            <Field label="Uhrzeit" value={backupForm.time} onChange={(e) => setBackupForm((c) => ({ ...c, time: e.target.value }))} />
          </FormRow>
          <Field label="Aufzubewahrende Backups" value={backupForm.keepCount} onChange={(e) => setBackupForm((c) => ({ ...c, keepCount: e.target.value }))} />
          <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Backup-Konfiguration speichern"}</PrimaryButton>
        </form>
      </SectionCard>
    </div>
  );
}

function GoogleCalendarSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const [gcalForm, setGcalForm] = useState({ clientId: "", clientSecret: "", calendarId: "", enabled: false });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; lastSyncStatus: string | null; lastSyncCount: number }>({ lastSync: null, lastSyncStatus: null, lastSyncCount: 0 });

  useEffect(() => {
    void apiFetch<typeof gcalForm>("/settings/google-calendar").then(setGcalForm).catch(() => {});
    void apiFetch<typeof syncStatus>("/settings/google-calendar/status").then(setSyncStatus).catch(() => {});
  }, [apiFetch]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setPanelError(null);
    try {
      await apiFetch("/settings/google-calendar", { method: "PUT", body: JSON.stringify(gcalForm) });
      setPanelSuccess("Google-Kalender-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler."); }
    finally { setSaving(false); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-6">
      <SectionCard title="Google Kalender" subtitle="Projekttermine mit Google Kalender synchronisieren.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void save(e)}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={gcalForm.enabled} onChange={(e) => setGcalForm((c) => ({ ...c, enabled: e.target.checked }))} />
            Google-Kalender-Abgleich aktiviert
          </label>
          <Field label="Service-Account E-Mail (optional)" value={gcalForm.clientId} onChange={(e) => setGcalForm((c) => ({ ...c, clientId: e.target.value }))} />
          <Field label="OAuth2 Access Token" type="password" value={gcalForm.clientSecret} onChange={(e) => setGcalForm((c) => ({ ...c, clientSecret: e.target.value }))} />
          <Field label="Kalender-ID (z.B. primary oder user@gmail.com)" value={gcalForm.calendarId} onChange={(e) => setGcalForm((c) => ({ ...c, calendarId: e.target.value }))} />
          <p className="text-xs text-slate-500">
            Access Token kann ueber Google Cloud Console / OAuth 2.0 Playground generiert werden.
            Kalender-ID findet sich in den Google Kalender-Einstellungen unter Kalenderdetails.
          </p>
          <PrimaryButton disabled={saving}>{saving ? "Speichert ..." : "Konfiguration speichern"}</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Synchronisierung" subtitle="Projekttermine in Google Kalender uebertragen.">
        <div className="grid gap-4">
          {syncStatus.lastSync ? (
            <div className="rounded-xl border border-black/10 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-950/30">
              <div className="text-xs text-slate-500">Letzter Sync: {new Date(syncStatus.lastSync).toLocaleString("de-DE")}</div>
              <div className="text-sm font-medium">{syncStatus.lastSyncStatus}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Noch nie synchronisiert.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={syncing || !gcalForm.enabled} onClick={async () => {
              setSyncing(true); setPanelError(null);
              try {
                const r = await apiFetch<{ syncedAt: string; status: string; count: number }>("/settings/google-calendar/sync", { method: "POST" });
                setPanelSuccess(r.status);
                setSyncStatus({ lastSync: r.syncedAt, lastSyncStatus: r.status, lastSyncCount: r.count });
              } catch (e) { setPanelError(e instanceof Error ? e.message : "Sync fehlgeschlagen."); }
              finally { setSyncing(false); }
            }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              {syncing ? "Synchronisiert ..." : "Jetzt synchronisieren"}
            </button>
            <a href={`${apiRoot}/api/projects/export/ical`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              iCal-Export (.ics)
            </a>
          </div>
          {!gcalForm.enabled ? <p className="text-xs text-amber-600 dark:text-amber-400">Google-Kalender ist deaktiviert. Bitte oben aktivieren und Kalender-ID eintragen.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsPanel({
  settingsForm, setSettingsForm, onSettingsSubmit,
  users, roles, userForm, setUserForm, onUserSubmit, onDeleteUser,
  canManageUsers, submitting, apiFetch, error, success,
}: {
  settingsForm: AppSettings;
  setSettingsForm: Dispatch<SetStateAction<AppSettings>>;
  onSettingsSubmit: (e: FormEvent<HTMLFormElement>) => void;
  users: UserItem[];
  roles: RoleItem[];
  userForm: UserFormState;
  setUserForm: Dispatch<SetStateAction<UserFormState>>;
  onUserSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDeleteUser: (id: string) => void;
  canManageUsers: boolean;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  error: string | null;
  success: string | null;
}) {
  const [settingsTab, setSettingsTab] = useState<"general" | "users" | "roles" | "company" | "pdfconfig" | "smtp" | "backup" | "gcal">("general");
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolePermissionIds, setRolePermissionIds] = useState<string[]>([]);
  const [smtpForm, setSmtpForm] = useState<SmtpFormState>({ host: "", port: "587", user: "", password: "", fromEmail: "", secure: false });
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [backupForm, setBackupForm] = useState({ enabled: false, interval: "daily", time: "02:00", keepCount: "7" });
  const [companyForm, setCompanyForm] = useState({ name: "", street: "", postalCode: "", city: "", country: "DE", phone: "", email: "", website: "" });
  const [pdfConfigForm, setPdfConfigForm] = useState({ header: "", footer: "", extraText: "", useLogo: false });
  const [panelSuccess, setPanelSuccess] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<PermissionItem[]>("/settings/permissions").then(setPermissions).catch(() => setPermissions([]));
  }, [apiFetch]);

  useEffect(() => {
    void apiFetch<{ host: string; port: number; user: string; password: string; fromEmail: string; secure: boolean }>("/settings/smtp")
      .then((s) => {
        setSmtpForm({ host: s.host ?? "", port: String(s.port ?? 587), user: s.user ?? "", password: s.password ?? "", fromEmail: s.fromEmail ?? "", secure: s.secure ?? false });
        setSmtpTestRecipient(s.fromEmail ?? "");
      })
      .catch(() => {});
    void apiFetch<{ enabled: boolean; interval: string; time: string; keepCount: number }>("/settings/backup")
      .then((b) => setBackupForm({ enabled: b.enabled, interval: b.interval, time: b.time, keepCount: String(b.keepCount) }))
      .catch(() => {});
    void apiFetch<typeof companyForm>("/settings/company").then(setCompanyForm).catch(() => {});
    void apiFetch<typeof pdfConfigForm>("/settings/pdf-config").then(setPdfConfigForm).catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    if (!selectedRoleId) { setRolePermissionIds([]); return; }
    void apiFetch<PermissionItem[]>(`/settings/roles/${selectedRoleId}/permissions`).then((perms) => setRolePermissionIds(perms.map((p) => p.id))).catch(() => {});
  }, [apiFetch, selectedRoleId]);

  async function saveRolePermissions() {
    setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch(`/settings/roles/${selectedRoleId}/permissions`, { method: "PUT", body: JSON.stringify({ permissionIds: rolePermissionIds }) });
      setPanelSuccess("Rechte gespeichert.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
  }

  async function saveSmtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/smtp", { method: "PUT", body: JSON.stringify({ ...smtpForm, port: Number(smtpForm.port) }) });
      setPanelSuccess("SMTP gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function testSmtp() {
    setPanelError(null); setPanelSuccess(null); setSmtpTesting(true);
    try {
      const recipient = smtpTestRecipient.trim() || smtpForm.fromEmail.trim();
      await apiFetch("/settings/smtp/test", {
        method: "PUT",
        body: JSON.stringify({
          ...smtpForm,
          port: Number(smtpForm.port),
          recipient,
        }),
      });
      setPanelSuccess(`Test-E-Mail erfolgreich an ${recipient} gesendet.`);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSmtpTesting(false);
    }
  }

  async function saveCompanyInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/company", { method: "PUT", body: JSON.stringify(companyForm) });
      setPanelSuccess("Firmeninformationen gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function savePdfConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/pdf-config", { method: "PUT", body: JSON.stringify(pdfConfigForm) });
      setPanelSuccess("PDF-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function saveBackupConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/backup", {
        method: "PUT",
        body: JSON.stringify({ ...backupForm, keepCount: Number(backupForm.keepCount) }),
      });
      setPanelSuccess("Backup-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  const tabs: { key: typeof settingsTab; label: string }[] = [
    { key: "general", label: "Allgemein" },
    ...(canManageUsers ? [{ key: "users" as const, label: "Benutzer" }] : []),
    ...(canManageUsers ? [{ key: "roles" as const, label: "Rollen & Rechte" }] : []),
    { key: "company" as const, label: "Firma" },
    { key: "pdfconfig" as const, label: "PDF" },
    { key: "smtp", label: "E-Mail / SMTP" },
    { key: "backup", label: "Backup" },
    { key: "gcal" as const, label: "Google Kalender" },
  ];

  const permissionsByCategory = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => { setSettingsTab(t.key); setPanelSuccess(null); setPanelError(null); }}
            className={cx("rounded-xl border px-3 py-2 text-sm font-medium transition",
              settingsTab === t.key
                ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-300 dark:bg-slate-200 dark:!text-slate-950"
                : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            )}>{t.label}</button>
        ))}
      </div>

      <MessageBar error={panelError ?? error} success={panelSuccess ?? success} />

      {settingsTab === "general" ? (
        <SectionCard title="Allgemeine Einstellungen" subtitle="Passwort, Kiosk-Code, Theme">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={onSettingsSubmit}>
            <FormRow>
              <Field label="Minimale Passwortlaenge" type="number" value={String(settingsForm.passwordMinLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, passwordMinLength: Number(e.target.value || 0) }))} />
              <Field label="Kiosk-Code Laenge" type="number" value={String(settingsForm.kioskCodeLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, kioskCodeLength: Number(e.target.value || 0) }))} />
            </FormRow>
            <SelectField label="Standard Theme" value={settingsForm.defaultTheme} onChange={(e) => setSettingsForm((c) => ({ ...c, defaultTheme: e.target.value as AppSettings["defaultTheme"] }))} options={[{ value: "dark", label: "Dunkel" }, { value: "light", label: "Hell" }]} />
            <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Einstellungen speichern"}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "users" && canManageUsers ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Benutzer" subtitle="Benutzer verwalten, Rollen zuweisen.">
            <EntityList items={users} title={(i) => i.displayName}
              subtitle={(i) => `${i.email} · ${i.roles.map((r) => r.role.name).join(", ")}${i.isActive ? "" : " (inaktiv)"}`}
              editLabel="Bearbeiten" deleteLabel="Loeschen"
              onEdit={(i) => setUserForm({ id: i.id, email: i.email, displayName: i.displayName, password: "", kioskCode: "", roleCodes: i.roles.map((r) => r.role.code), isActive: i.isActive })}
              onDelete={(i) => onDeleteUser(i.id)} />
          </SectionCard>
          <SectionCard title={userForm.id ? "Benutzer bearbeiten" : "Benutzer anlegen"} subtitle="Login, Passwort, Kiosk-Code und Rollen.">
            <form className="grid gap-4" onSubmit={onUserSubmit}>
              <Field label="Anzeigename" value={userForm.displayName} onChange={(e) => setUserForm((c) => ({ ...c, displayName: e.target.value }))} />
              <Field label="E-Mail" value={userForm.email} onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))} />
              <FormRow>
                <Field label="Passwort" type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))} />
                <Field label="Sicherheitscode (intern)" type="password" autoComplete="new-password" value={userForm.kioskCode} onChange={(e) => setUserForm((c) => ({ ...c, kioskCode: e.target.value }))} />
              </FormRow>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Rollen</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <label key={role.id} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                      <input type="checkbox" checked={userForm.roleCodes.includes(role.code)}
                        onChange={(e) => setUserForm((c) => ({ ...c, roleCodes: e.target.checked ? [...c.roleCodes, role.code] : c.roleCodes.filter((r) => r !== role.code) }))} />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Benutzer speichern"}</PrimaryButton>
                <SecondaryButton onClick={() => setUserForm({ id: undefined, email: "", displayName: "", password: "", kioskCode: "", roleCodes: [], isActive: true })}>Zuruecksetzen</SecondaryButton>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {settingsTab === "roles" && canManageUsers ? (
        <SectionCard title="Rollen & Rechte" subtitle="Rechte pro Rolle konfigurieren.">
          <div className="grid gap-4">
            <SelectField label="Rolle waehlen" value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              options={roles.map((r) => ({ value: r.id, label: r.name }))} />
            {selectedRoleId ? (
              <div className="grid gap-4">
                {Object.entries(permissionsByCategory).map(([cat, perms]) => (
                  <div key={cat} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                    <h4 className="mb-2 text-sm font-semibold text-slate-500">{cat}</h4>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((p) => (
                        <label key={p.id} className="inline-flex items-center gap-2 rounded-lg border border-black/5 px-2 py-1 text-xs dark:border-white/5">
                          <input type="checkbox" checked={rolePermissionIds.includes(p.id)}
                            onChange={(e) => setRolePermissionIds((c) => e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id))} />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <SecondaryButton onClick={() => void saveRolePermissions()}>Rechte speichern</SecondaryButton>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {settingsTab === "company" ? (
        <CompanySettingsTab companyForm={companyForm} setCompanyForm={setCompanyForm} onSave={(e) => void saveCompanyInfo(e)} submitting={submitting} apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "pdfconfig" ? (
        <SectionCard title="PDF-Konfiguration" subtitle="Darstellung fuer Stundenzettel und Dokumente.">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void savePdfConfig(e)}>
            <Field label="PDF-Kopfzeile" value={pdfConfigForm.header} onChange={(e) => setPdfConfigForm((c) => ({ ...c, header: e.target.value }))} />
            <Field label="PDF-Fusszeile" value={pdfConfigForm.footer} onChange={(e) => setPdfConfigForm((c) => ({ ...c, footer: e.target.value }))} />
            <TextArea label="Zusatztext / Freitext" value={pdfConfigForm.extraText} onChange={(e) => setPdfConfigForm((c) => ({ ...c, extraText: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pdfConfigForm.useLogo} onChange={(e) => setPdfConfigForm((c) => ({ ...c, useLogo: e.target.checked }))} />
              Logo im PDF verwenden
            </label>
            <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "PDF-Konfiguration speichern"}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "smtp" ? (
        <SectionCard title="E-Mail / SMTP" subtitle="Mailserver fuer Stundenzettel-Versand konfigurieren.">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void saveSmtp(e)}>
            <FormRow>
              <Field label="SMTP Host" value={smtpForm.host} onChange={(e) => setSmtpForm((c) => ({ ...c, host: e.target.value }))} />
              <Field label="SMTP Port" value={smtpForm.port} onChange={(e) => setSmtpForm((c) => ({ ...c, port: e.target.value }))} />
            </FormRow>
            <FormRow>
              <Field label="SMTP Benutzer" value={smtpForm.user} onChange={(e) => setSmtpForm((c) => ({ ...c, user: e.target.value }))} />
              <Field label="SMTP Passwort" type="password" autoComplete="new-password" value={smtpForm.password} onChange={(e) => setSmtpForm((c) => ({ ...c, password: e.target.value }))} />
            </FormRow>
            <Field label="Absenderadresse" value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((c) => ({ ...c, fromEmail: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smtpForm.secure} onChange={(e) => setSmtpForm((c) => ({ ...c, secure: e.target.checked }))} />
              TLS / SSL verwenden
            </label>
            <Field
              label="Test-E-Mail an"
              value={smtpTestRecipient}
              onChange={(e) => setSmtpTestRecipient(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "SMTP speichern"}</PrimaryButton>
              <SecondaryButton onClick={() => void testSmtp()}>
                {smtpTesting ? "Testet ..." : "SMTP testen"}
              </SecondaryButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "backup" ? (
        <BackupSettingsTab backupForm={backupForm} setBackupForm={setBackupForm} onSaveConfig={(e) => void saveBackupConfig(e)} submitting={submitting} apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "gcal" ? (
        <GoogleCalendarSettings apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}
    </div>
  );
}

function PlanningCalendar({ projects, workers, teams, apiFetch, onDataChanged }: { projects: Project[]; workers: Worker[]; teams: TeamItem[]; apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>; onDataChanged: () => void }) {
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [planForm, setPlanForm] = useState({ projectId: "", startDate: "", endDate: "", teamId: "", workerIds: [] as string[] });
  const [planConflicts, setPlanConflicts] = useState<string[]>([]);
  const [planSaving, setPlanSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);

  function openPlanForm(p: Project) {
    setPlanForm({
      projectId: p.id,
      startDate: p.plannedStartDate?.slice(0, 10) ?? "",
      endDate: p.plannedEndDate?.slice(0, 10) ?? "",
      teamId: "",
      workerIds: (p.assignments ?? []).map((a) => a.worker.id),
    });
    setPlanConflicts([]);
    setPlanMsg(null);
    setPlanErr(null);
    setSelectedProject(p);
  }

  function checkConflicts() {
    if (!planForm.startDate) return [];
    const start = new Date(planForm.startDate);
    const end = planForm.endDate ? new Date(planForm.endDate) : null;
    const issues: string[] = [];
    for (const wid of planForm.workerIds) {
      const w = workers.find((x) => x.id === wid);
      if (!w) continue;
      for (const p of projects) {
        if (p.id === planForm.projectId) continue;
        if (!(p.assignments ?? []).some((a) => a.worker.id === wid)) continue;
        if (!p.plannedStartDate) continue;
        const pStart = new Date(p.plannedStartDate);
        const pEnd = p.plannedEndDate ? new Date(p.plannedEndDate) : null;
        const overlap = start <= (pEnd ?? new Date("9999-12-31")) && (end ?? new Date("9999-12-31")) >= pStart;
        if (overlap) {
          issues.push(`${w.firstName} ${w.lastName} kollidiert mit ${p.projectNumber} (${p.plannedStartDate.slice(0, 10)} - ${p.plannedEndDate?.slice(0, 10) ?? "offen"})`);
        }
      }
    }
    return issues;
  }

  async function savePlan() {
    const conflicts = checkConflicts();
    setPlanConflicts(conflicts);
    if (conflicts.length > 0 && !window.confirm(`Es gibt ${conflicts.length} Ueberschneidung(en). Trotzdem speichern?`)) return;
    setPlanSaving(true); setPlanErr(null); setPlanMsg(null);
    try {
      // 1. Zeitraum speichern
      await apiFetch(`/projects/${planForm.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedStartDate: planForm.startDate || undefined,
          plannedEndDate: planForm.endDate || undefined,
        }),
      });
      // 2. Monteur-Zuordnungen ersetzen (auch bei leerem Array = alle entfernen)
      if (planForm.startDate) {
        await apiFetch(`/projects/${planForm.projectId}/assignments`, {
          method: "PUT",
          body: JSON.stringify({
            workerIds: planForm.workerIds,
            startDate: planForm.startDate,
            endDate: planForm.endDate || undefined,
          }),
        });
      }
      setPlanMsg("Planung und Monteur-Zuordnungen gespeichert.");
      onDataChanged();
    } catch (e) { setPlanErr(e instanceof Error ? e.message : "Fehler beim Speichern."); }
    finally { setPlanSaving(false); }
  }

  // Drag-Zustand fuer Kalender (Verschieben/Resize bestehender)
  const [dragState, setDragState] = useState<{ projectId: string; startDay: number; currentDay: number; mode: "move" | "resize-end" } | null>(null);

  // Aufziehen neuer Termine auf leeren Tagen
  const [drawState, setDrawState] = useState<{ startDay: number; currentDay: number } | null>(null);
  const [drawProjectPicker, setDrawProjectPicker] = useState<{ startDay: number; endDay: number } | null>(null);

  function handleDragStart(projectId: string, day: number, mode: "move" | "resize-end") {
    setDragState({ projectId, startDay: day, currentDay: day, mode });
  }

  function handleDragOver(day: number) {
    if (dragState) setDragState((s) => s ? { ...s, currentDay: day } : null);
  }

  async function handleDragEnd() {
    if (!dragState) return;
    const p = projects.find((x) => x.id === dragState.projectId);
    if (!p) { setDragState(null); return; }

    const delta = dragState.currentDay - dragState.startDay;
    if (delta === 0) { setDragState(null); return; }

    let newStart = p.plannedStartDate ? new Date(p.plannedStartDate) : new Date(year, month - 1, dragState.startDay);
    let newEnd = p.plannedEndDate ? new Date(p.plannedEndDate) : null;

    if (dragState.mode === "move") {
      newStart = new Date(newStart.getTime() + delta * 86400000);
      if (newEnd) newEnd = new Date(newEnd.getTime() + delta * 86400000);
    } else {
      // resize-end
      if (newEnd) {
        newEnd = new Date(newEnd.getTime() + delta * 86400000);
      } else {
        newEnd = new Date(newStart.getTime() + delta * 86400000);
      }
      if (newEnd < newStart) newEnd = newStart;
    }

    setDragState(null);
    try {
      await apiFetch(`/projects/${dragState.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedStartDate: newStart.toISOString().slice(0, 10),
          plannedEndDate: newEnd?.toISOString().slice(0, 10) ?? undefined,
        }),
      });
      onDataChanged();
    } catch { /* silently fail */ }
  }

  function applyTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      setPlanForm((c) => ({ ...c, teamId, workerIds: team.members.map((m) => m.worker.id) }));
    }
  }

  const year = Number(viewMonth.slice(0, 4));
  const month = Number(viewMonth.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mo=0

  // Projekte mit Zeitraum
  const plannable = projects.filter((p) => p.plannedStartDate || p.plannedEndDate);

  function projectInDay(p: Project, day: number) {
    const date = new Date(year, month - 1, day);
    const start = p.plannedStartDate ? new Date(p.plannedStartDate) : null;
    const end = p.plannedEndDate ? new Date(p.plannedEndDate) : null;
    if (start && date < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
    if (end && date > new Date(end.getFullYear(), end.getMonth(), end.getDate())) return false;
    if (!start && !end) return false;
    return true;
  }

  // Konflikte: Monteure die an mehreren Projekten gleichzeitig zugeordnet sind
  function getConflicts() {
    const conflicts: { day: number; workerName: string; projects: string[] }[] = [];
    const activeWorkers = workers.filter((w) => w.active !== false);
    for (let day = 1; day <= daysInMonth; day++) {
      const dayProjects = plannable.filter((p) => projectInDay(p, day));
      for (const w of activeWorkers) {
        const workerProjects = dayProjects.filter((p) =>
          (p.assignments ?? []).some((a) => a.worker.id === w.id),
        );
        if (workerProjects.length > 1) {
          conflicts.push({
            day,
            workerName: `${w.firstName} ${w.lastName}`,
            projects: workerProjects.map((p) => p.projectNumber),
          });
        }
      }
    }
    return conflicts;
  }

  const conflicts = getConflicts();
  const conflictDays = new Set(conflicts.map((c) => c.day));

  const statusColor = (s?: string) => {
    switch (s) {
      case "ACTIVE": return "bg-emerald-200 dark:bg-emerald-800";
      case "PLANNED": return "bg-blue-200 dark:bg-blue-800";
      case "PAUSED": return "bg-amber-200 dark:bg-amber-800";
      default: return "bg-slate-200 dark:bg-slate-700";
    }
  };

  return (
    <div className="grid gap-6">
      {/* Monatsnavigation */}
      <div className="flex items-center gap-4">
        <SecondaryButton onClick={() => {
          const d = new Date(year, month - 2, 1);
          setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }}>&#8592;</SecondaryButton>
        <h2 className="text-xl font-semibold">{new Date(year, month - 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</h2>
        <SecondaryButton onClick={() => {
          const d = new Date(year, month, 1);
          setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }}>&#8594;</SecondaryButton>
      </div>

      {/* Projekt einplanen */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-slate-500">Projekt waehlen und einplanen</label>
          <select onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); if (p) openPlanForm(p); e.target.value = ""; }}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900">
            <option value="">Projekt waehlen...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.projectNumber} – {p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Konflikte */}
      {conflicts.length > 0 ? (
        <div className="rounded-2xl border border-red-300 bg-red-50/60 p-4 dark:border-red-500/40 dark:bg-red-500/5">
          <h3 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">Ueberschneidungen</h3>
          {conflicts.map((c, i) => (
            <div key={i} className="text-xs text-red-600 dark:text-red-300">
              Tag {c.day}: {c.workerName} in {c.projects.join(" + ")}
            </div>
          ))}
        </div>
      ) : null}

      {/* Kalender-Grid mit Drag-Support */}
      <div className="rounded-3xl border border-black/10 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80"
        onPointerUp={() => {
          if (dragState) { void handleDragEnd(); return; }
          if (drawState) {
            const s = Math.min(drawState.startDay, drawState.currentDay);
            const e = Math.max(drawState.startDay, drawState.currentDay);
            setDrawState(null);
            if (s !== e) setDrawProjectPicker({ startDay: s, endDay: e });
          }
        }}>
        <div className="grid grid-cols-7 gap-px select-none">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500">{d}</div>
          ))}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] rounded-lg bg-slate-50/50 dark:bg-slate-950/20" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayProjects = plannable.filter((p) => projectInDay(p, day));
            const hasConflict = conflictDays.has(day);
            const isWeekend = ((firstDayOfWeek + i) % 7) >= 5;
            const isDragOver = dragState && dragState.currentDay === day;
            return (
              <div key={day}
                onPointerEnter={() => { handleDragOver(day); if (drawState) setDrawState((s) => s ? { ...s, currentDay: day } : null); }}
                onPointerDown={(e) => { if (dayProjects.length === 0 && !dragState) { e.preventDefault(); setDrawState({ startDay: day, currentDay: day }); } }}
                className={cx(
                  "min-h-[80px] rounded-lg border p-1 transition-colors",
                  (drawState && day >= Math.min(drawState.startDay, drawState.currentDay) && day <= Math.max(drawState.startDay, drawState.currentDay)) ? "border-blue-400 bg-blue-100/50 dark:border-blue-500/50 dark:bg-blue-500/15" :
                  isDragOver ? "border-blue-400 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-500/10" :
                  hasConflict ? "border-red-300 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5" :
                  isWeekend ? "border-black/5 bg-slate-50/30 dark:border-white/5 dark:bg-slate-950/30" :
                  "border-black/5 dark:border-white/5",
                )}>
                <div className="mb-1 text-right text-xs font-medium text-slate-400">{day}</div>
                {dayProjects.slice(0, 3).map((p) => (
                  <div key={p.id} className={cx("group relative mb-0.5 flex w-full items-center rounded text-left text-[10px] font-medium", statusColor(p.status))}>
                    <button type="button"
                      onClick={() => openPlanForm(p)}
                      onPointerDown={(e) => { e.preventDefault(); handleDragStart(p.id, day, "move"); }}
                      className="flex-1 truncate px-1 py-0.5 cursor-grab active:cursor-grabbing">
                      {p.projectNumber}
                    </button>
                    <button type="button"
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDragStart(p.id, day, "resize-end"); }}
                      className="hidden w-2 cursor-ew-resize rounded-r bg-black/10 group-hover:block dark:bg-white/20"
                      title="Ende anpassen">&nbsp;</button>
                  </div>
                ))}
                {dayProjects.length > 3 ? <div className="text-[9px] text-slate-400">+{dayProjects.length - 3}</div> : null}
              </div>
            );
          })}
        </div>
        {dragState ? <div className="mt-2 text-center text-xs text-blue-600 dark:text-blue-400">
          {dragState.mode === "move" ? "Verschieben" : "Ende anpassen"}: Tag {dragState.startDay} → {dragState.currentDay} ({dragState.currentDay - dragState.startDay > 0 ? "+" : ""}{dragState.currentDay - dragState.startDay} Tage)
        </div> : null}
        {drawState ? <div className="mt-2 text-center text-xs text-blue-600 dark:text-blue-400">
          Neuer Termin: Tag {Math.min(drawState.startDay, drawState.currentDay)} – {Math.max(drawState.startDay, drawState.currentDay)}
        </div> : null}
      </div>

      {/* Aufgezogenen Termin einem Projekt zuweisen */}
      {drawProjectPicker ? (
        <SectionCard title="Neuen Termin zuweisen" subtitle={`${drawProjectPicker.startDay}. – ${drawProjectPicker.endDay}. ${new Date(year, month - 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}`}>
          <div className="grid gap-3">
            <p className="text-sm text-slate-500">Bitte Projekt fuer diesen Zeitraum waehlen:</p>
            {projects.filter((p) => !p.plannedStartDate).map((p) => (
              <button key={p.id} type="button" onClick={async () => {
                const startDate = `${year}-${String(month).padStart(2, "0")}-${String(drawProjectPicker.startDay).padStart(2, "0")}`;
                const endDate = `${year}-${String(month).padStart(2, "0")}-${String(drawProjectPicker.endDay).padStart(2, "0")}`;
                try {
                  await apiFetch(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ plannedStartDate: startDate, plannedEndDate: endDate }) });
                  setDrawProjectPicker(null);
                  onDataChanged();
                } catch { /* */ }
              }} className="rounded-xl border border-black/10 px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                <div className="font-medium">{p.projectNumber} – {p.title}</div>
                <div className="text-xs text-slate-500">{p.customer?.companyName ?? "-"}</div>
              </button>
            ))}
            {projects.filter((p) => !p.plannedStartDate).length === 0 ? <p className="text-sm text-slate-500">Alle Projekte haben bereits einen Zeitraum.</p> : null}
            <SecondaryButton onClick={() => setDrawProjectPicker(null)}>Abbrechen</SecondaryButton>
          </div>
        </SectionCard>
      ) : null}

      {/* Planungsformular */}
      {selectedProject ? (
        <SectionCard title={`Planung: ${selectedProject.title}`} subtitle={`${selectedProject.projectNumber} · ${selectedProject.customer?.companyName ?? ""}`}>
          <MessageBar error={planErr} success={planMsg} />
          <div className="grid gap-4">
            <FormRow>
              <Field label="Startdatum" type="date" value={planForm.startDate} onChange={(e) => setPlanForm((c) => ({ ...c, startDate: e.target.value }))} />
              <Field label="Enddatum" type="date" value={planForm.endDate} onChange={(e) => setPlanForm((c) => ({ ...c, endDate: e.target.value }))} />
            </FormRow>
            {teams.length > 0 ? (
              <SelectField label="Team zuordnen" value={planForm.teamId}
                onChange={(e) => { setPlanForm((c) => ({ ...c, teamId: e.target.value })); if (e.target.value) applyTeam(e.target.value); }}
                options={teams.map((t) => ({ value: t.id, label: `${t.name} (${t.members.length} Monteure)` }))} />
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Monteure</label>
              <div className="flex flex-wrap gap-2">
                {workers.filter((w) => w.active !== false).map((w) => (
                  <label key={w.id} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                    <input type="checkbox" checked={planForm.workerIds.includes(w.id)}
                      onChange={(e) => setPlanForm((c) => ({ ...c, workerIds: e.target.checked ? [...c.workerIds, w.id] : c.workerIds.filter((x) => x !== w.id) }))} />
                    {w.firstName} {w.lastName}
                  </label>
                ))}
              </div>
            </div>

            {/* Konflikte */}
            {(() => { const c = checkConflicts(); return c.length > 0 ? (
              <div className="rounded-xl border border-red-300 bg-red-50/60 p-3 dark:border-red-500/30 dark:bg-red-500/5">
                <h4 className="mb-1 text-xs font-semibold uppercase text-red-700 dark:text-red-400">Ueberschneidungen</h4>
                {c.map((x, i) => <div key={i} className="text-xs text-red-600 dark:text-red-300">{x}</div>)}
              </div>
            ) : null; })()}

            <div className="flex gap-3">
              <button type="button" disabled={planSaving} onClick={() => void savePlan()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
                {planSaving ? "Speichert ..." : "Planung speichern"}
              </button>
              <SecondaryButton onClick={() => setSelectedProject(null)}>Schliessen</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Projektliste unter Kalender */}
      <SectionCard title="Geplante Projekte" subtitle={`${plannable.length} Projekte mit Zeitraum`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="pb-2 pr-2">Nr.</th><th className="pb-2 pr-2">Titel</th><th className="pb-2 pr-2">Kunde</th><th className="pb-2 pr-2">Status</th><th className="pb-2 pr-2">Zeitraum</th><th className="pb-2">Monteure</th>
              </tr>
            </thead>
            <tbody>
              {plannable.map((p) => (
                <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs">{p.projectNumber}</td>
                  <td className="py-2 pr-2 text-xs">{p.title}</td>
                  <td className="py-2 pr-2 text-xs">{p.customer?.companyName ?? "-"}</td>
                  <td className="py-2 pr-2 text-xs">{p.status}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{p.plannedStartDate?.slice(0, 10) ?? "-"} – {p.plannedEndDate?.slice(0, 10) ?? "offen"}</td>
                  <td className="py-2 text-xs">{(p.assignments ?? []).map((a) => `${a.worker.firstName} ${a.worker.lastName}`).join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
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
  const [loadingFinancials, setLoadingFinancials] = useState(true);
  const [allTimesheets, setAllTimesheets] = useState<TimesheetItem[]>([]);
  const [tsFilter, setTsFilter] = useState({ customer: "", project: "", worker: "", status: "" });

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoadingFinancials(true);
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

  useEffect(() => {
    void apiFetch<TimesheetItem[]>("/timesheets/weekly").then(setAllTimesheets).catch(() => setAllTimesheets([]));
  }, [apiFetch]);

  const filteredTimesheets = allTimesheets.filter((ts) => {
    if (tsFilter.project && ts.project.id !== tsFilter.project) return false;
    if (tsFilter.worker && ts.worker?.id !== tsFilter.worker) return false;
    if (tsFilter.status && ts.status !== tsFilter.status) return false;
    if (tsFilter.customer) {
      const proj = projects.find((p) => p.id === ts.project.id);
      if (proj?.customerId !== tsFilter.customer) return false;
    }
    return true;
  });

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

      {/* ── Stundenzettel zentral ──────────────────────── */}
      <SectionCard title="Stundenzettel" subtitle="Zentrale Uebersicht aller Stundenzettel. PDF-Download und E-Mail-Versand direkt moeglich.">
        <div className="mb-4 flex flex-wrap gap-3">
          <SelectField label="Kunde" value={tsFilter.customer} onChange={(e) => setTsFilter((c) => ({ ...c, customer: e.target.value }))}
            options={customers.map((c) => ({ value: c.id, label: c.companyName }))} />
          <SelectField label="Projekt" value={tsFilter.project} onChange={(e) => setTsFilter((c) => ({ ...c, project: e.target.value }))}
            options={projects.map((p) => ({ value: p.id, label: `${p.projectNumber} ${p.title}` }))} />
          <SelectField label="Monteur" value={tsFilter.worker} onChange={(e) => setTsFilter((c) => ({ ...c, worker: e.target.value }))}
            options={activeWorkers.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName}` }))} />
          <SelectField label="Status" value={tsFilter.status} onChange={(e) => setTsFilter((c) => ({ ...c, status: e.target.value }))}
            options={[
              { value: "DRAFT", label: "Entwurf" },
              { value: "WORKER_SIGNED", label: "Monteur signiert" },
              { value: "CUSTOMER_SIGNED", label: "Kunde signiert" },
              { value: "COMPLETED", label: "Abgeschlossen" },
              { value: "LOCKED", label: "Gesperrt" },
            ]} />
        </div>
        <TimesheetList timesheets={filteredTimesheets} apiFetch={apiFetch} title={`${filteredTimesheets.length} Stundenzettel`} />
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
    case "planning":
      return "Planung";
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
  apiFetch,
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
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const [customerTimesheets, setCustomerTimesheets] = useState<TimesheetItem[]>([]);

  useEffect(() => {
    async function loadTs() {
      const all: TimesheetItem[] = [];
      for (const p of customerProjects) {
        try {
          const ts = await apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${p.id}`);
          all.push(...ts);
        } catch { /* skip */ }
      }
      setCustomerTimesheets(all);
    }
    void loadTs();
  }, [apiFetch, customerProjects]);

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

  function printCustomer() {
    const addr = formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]);
    const branches = customer.branches.map((b) => `<tr><td>${b.name}</td><td>${formatAddress([b.addressLine1, b.postalCode, b.city])}</td><td>${b.phone ?? "-"}</td><td>${b.email ?? "-"}</td></tr>`).join("");
    const contacts = customer.contacts.map((c) => `<tr><td>${c.firstName} ${c.lastName}</td><td>${c.role ?? "-"}</td><td>${c.phoneMobile ?? "-"}</td><td>${c.email ?? "-"}</td></tr>`).join("");
    openPrintWindow(`Kunde ${customer.companyName}`, `
      <h1>${customer.companyName}</h1>
      <p class="meta">${customer.customerNumber} · ${customer.status ?? ""}</p>
      <h2>Stammdaten</h2>
      <div class="grid">
        <span class="label">Adresse</span><span>${addr || "-"}</span>
        <span class="label">Telefon</span><span>${customer.phone ?? "-"}</span>
        <span class="label">E-Mail</span><span>${customer.email ?? "-"}</span>
        <span class="label">Website</span><span>${customer.website ?? "-"}</span>
        <span class="label">USt-IdNr</span><span>${customer.vatId ?? "-"}</span>
      </div>
      ${customer.branches.length > 0 ? `<h2>Niederlassungen</h2><table><thead><tr><th>Name</th><th>Adresse</th><th>Telefon</th><th>E-Mail</th></tr></thead><tbody>${branches}</tbody></table>` : ""}
      ${customer.contacts.length > 0 ? `<h2>Ansprechpartner</h2><table><thead><tr><th>Name</th><th>Rolle</th><th>Mobil</th><th>E-Mail</th></tr></thead><tbody>${contacts}</tbody></table>` : ""}
      ${customer.notes ? `<h2>Notizen</h2><p>${customer.notes}</p>` : ""}
    `);
  }

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{customer.companyName}</h3>
            <p className="text-sm text-slate-500">{customer.customerNumber}</p>
          </div>
          <div className="flex gap-2">
            {customerMapsUrl ? <MapLinkButton href={customerMapsUrl}>Google Maps</MapLinkButton> : null}
            <PrintButton onClick={printCustomer} label="Stammblatt drucken" />
          </div>
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

      {/* ── Stundenzettel ────────────────────────────────────── */}
      <TimesheetList timesheets={customerTimesheets} apiFetch={apiFetch} title="Stundenzettel (alle Projekte)" />

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
  timesheets,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
  apiFetch,
}: {
  project: Project;
  financials: ProjectFinancials | null;
  timesheets: TimesheetItem[];
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
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

  function printProject() {
    const addr = formatAddress([project.siteAddressLine1, project.sitePostalCode, project.siteCity, project.siteCountry]);
    const workers = (project.assignments ?? []).map((a) => `<tr><td>${a.worker.firstName} ${a.worker.lastName}</td><td>${a.worker.workerNumber}</td></tr>`).join("");
    openPrintWindow(`Projekt ${project.projectNumber}`, `
      <h1>${project.title}</h1>
      <p class="meta">${project.projectNumber} · ${project.customer?.companyName ?? "-"} · ${project.status ?? "-"}</p>
      <h2>Projektdaten</h2>
      <div class="grid">
        <span class="label">Kunde</span><span>${project.customer?.companyName ?? "-"}</span>
        <span class="label">Einsatzort</span><span>${addr || "-"}</span>
        <span class="label">Status</span><span>${project.status ?? "-"}</span>
        <span class="label">Leistungsart</span><span>${project.serviceType ?? "-"}</span>
        ${project.description ? `<span class="label">Beschreibung</span><span>${project.description}</span>` : ""}
      </div>
      ${hasPricing ? `<h2>Preise</h2><div class="grid">
        <span class="label">Wochenpauschale</span><span>${fmt(project.weeklyFlatRate)}</span>
        <span class="label">Inklusivstunden</span><span>${project.includedHoursPerWeek != null ? project.includedHoursPerWeek + " h" : "-"}</span>
        <span class="label">Stundensatz</span><span>${fmt(project.hourlyRateUpTo40h)}</span>
        <span class="label">Ueberstundensatz</span><span>${fmt(project.overtimeRate)}</span>
      </div>` : ""}
      ${workers ? `<h2>Monteure</h2><table><thead><tr><th>Name</th><th>Nummer</th></tr></thead><tbody>${workers}</tbody></table>` : ""}
      ${project.notes ? `<h2>Notizen</h2><p>${project.notes}</p>` : ""}
    `);
  }

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
          <div className="flex gap-2">
            {projectMapsUrl ? <MapLinkButton href={projectMapsUrl}>Google Maps</MapLinkButton> : null}
            <PrintButton onClick={printProject} label="Projekt drucken" />
          </div>
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

      {/* ── Stundenzettel ──────────────────────────────── */}
      <TimesheetList timesheets={timesheets} apiFetch={apiFetch} />

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

function WorkerTimeLog({ entries, workerName }: { entries: NonNullable<Worker["timeEntries"]>; workerName?: string }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Paare CLOCK_IN/CLOCK_OUT
  type WorkPair = {
    clockIn: (typeof entries)[number];
    clockOut: (typeof entries)[number] | null;
  };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.occurredAtClient).getTime() - new Date(b.occurredAtClient).getTime(),
  );

  const pairs: WorkPair[] = [];
  let pendingIn: (typeof entries)[number] | null = null;

  for (const entry of sorted) {
    if (entry.entryType === "CLOCK_IN") {
      if (pendingIn) pairs.push({ clockIn: pendingIn, clockOut: null });
      pendingIn = entry;
    } else if (entry.entryType === "CLOCK_OUT" && pendingIn) {
      pairs.push({ clockIn: pendingIn, clockOut: entry });
      pendingIn = null;
    }
  }
  if (pendingIn) pairs.push({ clockIn: pendingIn, clockOut: null });

  pairs.reverse();

  function mapsUrl(lat?: number | null, lon?: number | null) {
    if (lat == null || lon == null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }

  function duration(start: string, end: string | null) {
    if (!end) return "laufend";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="text-base font-semibold">Arbeitsprotokoll</h4>
        <p className="mt-2 text-sm text-slate-500">Keine Zeitbuchungen vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <h4 className="mb-3 text-base font-semibold">Arbeitsprotokoll</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="pb-2 pr-2">Datum</th>
              <th className="pb-2 pr-2">Projekt</th>
              <th className="pb-2 pr-2">Anmeldung</th>
              <th className="pb-2 pr-2">Ort</th>
              <th className="pb-2 pr-2">Abmeldung</th>
              <th className="pb-2 pr-2">Ort</th>
              <th className="pb-2 pr-2">Dauer</th>
              <th className="pb-2">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const inUrl = mapsUrl(p.clockIn.latitude, p.clockIn.longitude);
              const outUrl = p.clockOut ? mapsUrl(p.clockOut.latitude, p.clockOut.longitude) : null;
              const isOpen = !p.clockOut;
              return (
                <tr key={i} onClick={() => setSelectedIdx(i)} className={cx("cursor-pointer border-b border-black/5 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800", isOpen && "bg-emerald-50/50 dark:bg-emerald-500/5")}>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleDateString("de-DE")}</td>
                  <td className="py-2 pr-2 text-xs">{p.clockIn.project?.projectNumber ?? "-"}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2 pr-2 text-xs">
                    {inUrl ? <a href={inUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Karte</a> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{p.clockOut ? new Date(p.clockOut.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : <span className="font-semibold text-emerald-600 dark:text-emerald-400">laufend</span>}</td>
                  <td className="py-2 pr-2 text-xs">
                    {outUrl ? <a href={outUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Karte</a> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{duration(p.clockIn.occurredAtClient, p.clockOut?.occurredAtClient ?? null)}</td>
                  <td className="py-2 text-xs text-slate-400">{p.clockIn.locationSource ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail-Popup */}
      {selectedIdx !== null && pairs[selectedIdx] ? (() => {
        const sp = pairs[selectedIdx];
        const dateStr = new Date(sp.clockIn.occurredAtClient).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        const inTime = new Date(sp.clockIn.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const outTime = sp.clockOut ? new Date(sp.clockOut.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "laufend";
        const dur = duration(sp.clockIn.occurredAtClient, sp.clockOut?.occurredAtClient ?? null);
        const inUrl = mapsUrl(sp.clockIn.latitude, sp.clockIn.longitude);
        const outUrl = sp.clockOut ? mapsUrl(sp.clockOut.latitude, sp.clockOut.longitude) : null;

        function printDay() {
          openPrintWindow(`Tagesbericht ${dateStr}`, `
            <h1>Tagesbericht</h1>
            ${workerName ? `<p class="meta">${workerName}</p>` : ""}
            <h2>${dateStr}</h2>
            <div class="grid">
              <span class="label">Projekt</span><span>${sp.clockIn.project?.projectNumber ?? "-"}</span>
              <span class="label">Beginn</span><span>${inTime}</span>
              <span class="label">Ende</span><span>${outTime}</span>
              <span class="label">Dauer</span><span>${dur}</span>
              <span class="label">Standort Beginn</span><span>${sp.clockIn.latitude != null ? `${sp.clockIn.latitude.toFixed(5)}, ${sp.clockIn.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">Standort Ende</span><span>${sp.clockOut?.latitude != null ? `${sp.clockOut.latitude.toFixed(5)}, ${sp.clockOut.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">Quelle</span><span>${sp.clockIn.locationSource ?? "-"}</span>
            </div>
          `);
        }

        return (
          <div className="mt-3 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold">{dateStr}</h4>
              <div className="flex gap-2">
                <PrintButton onClick={printDay} label="Drucken" />
                <SecondaryButton onClick={() => setSelectedIdx(null)}>Schliessen</SecondaryButton>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-slate-500">Projekt</span><span>{sp.clockIn.project?.projectNumber ?? "-"} {sp.clockIn.project?.title ?? ""}</span>
              <span className="text-slate-500">Beginn</span><span className="font-mono">{inTime}</span>
              <span className="text-slate-500">Ende</span><span className="font-mono">{outTime}</span>
              <span className="text-slate-500">Dauer</span><span className="font-mono font-semibold">{dur}</span>
              <span className="text-slate-500">Standort Beginn</span>
              <span>{inUrl ? <a href={inUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockIn.latitude?.toFixed(5)}, {sp.clockIn.longitude?.toFixed(5)}</a> : "Kein Standort"}</span>
              <span className="text-slate-500">Standort Ende</span>
              <span>{outUrl ? <a href={outUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockOut?.latitude?.toFixed(5)}, {sp.clockOut?.longitude?.toFixed(5)}</a> : "Kein Standort"}</span>
              <span className="text-slate-500">Quelle</span><span>{sp.clockIn.locationSource ?? "-"}</span>
            </div>
          </div>
        );
      })() : null}
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

  function printWorker() {
    const addr = formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]);
    const projs = allAssignments.map((a) => `<tr><td>${a.project.projectNumber}</td><td>${a.project.title}</td><td>${formatDateRange(a)}</td></tr>`).join("");
    openPrintWindow(`Monteur ${worker.firstName} ${worker.lastName}`, `
      <h1>${worker.firstName} ${worker.lastName}</h1>
      <p class="meta">${worker.workerNumber} · ${worker.active === false ? "deaktiviert" : "aktiv"}</p>
      <h2>Stammdaten</h2>
      <div class="grid">
        <span class="label">Adresse</span><span>${addr || "-"}</span>
        <span class="label">Mobil</span><span>${worker.phoneMobile ?? worker.phone ?? "-"}</span>
        <span class="label">Buero</span><span>${worker.phoneOffice ?? "-"}</span>
        <span class="label">E-Mail</span><span>${worker.email ?? "-"}</span>
        <span class="label">Stundensatz intern</span><span>${worker.internalHourlyRate != null ? worker.internalHourlyRate.toFixed(2) + " EUR/h" : "-"}</span>
      </div>
      ${projs ? `<h2>Projekte</h2><table><thead><tr><th>Nr.</th><th>Titel</th><th>Zeitraum</th></tr></thead><tbody>${projs}</tbody></table>` : ""}
    `);
  }

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
          <div className="flex gap-2">
            {workerMapsUrl ? <MapLinkButton href={workerMapsUrl}>Google Maps</MapLinkButton> : null}
            <PrintButton onClick={printWorker} label="Monteur drucken" />
          </div>
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

      {/* ── Arbeitsprotokoll ──────────────────────────────── */}
      <WorkerTimeLog entries={worker.timeEntries ?? []} workerName={`${worker.firstName} ${worker.lastName}`} />

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

    type ThumbnailResult =
      | { kind: "error"; id: string; error: string }
      | { kind: "url"; id: string; url: string }
      | { kind: "ok"; id: string };

    async function loadThumbnails() {
      if (documents.length === 0) {
        if (!cancelled) {
          setThumbnailUrls({});
          setThumbnailErrors({});
        }
        return;
      }
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
        <Image
          src={thumbnailUrl}
          alt={document.title || document.originalFilename}
          width={64}
          height={80}
          unoptimized
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
            <Image
              src={preview.url}
              alt={preview.title}
              width={1200}
              height={1600}
              unoptimized
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

