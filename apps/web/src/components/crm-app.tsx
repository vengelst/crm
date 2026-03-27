"use client";

import { Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ThemeToggle } from "./theme-toggle";
import type {
  AppSection, CrmAppProps, Summary, AuthState,
  CustomerBranch, CustomerContact, Customer,
  Project, Worker,
  DocumentItem, TeamItem, TeamFormState,
  RoleItem, UserItem,
  AppSettings,
  CustomerFormState, ProjectFormState, WorkerFormState, UserFormState,
  DocumentFormState, DocumentPreviewState,
  TimesheetItem,
  ProjectFinancials, CustomerFinancials,
} from "./crm-app/types";
import { API_ROOT, AUTH_STORAGE_KEY } from "./crm-app/types";
import {
  cx, formatAddress, toDateInput, sanitizeForApi,
  NavLink, IconNavLink, PrimaryButton, SecondaryButton,
  SectionCard, InfoCard, MessageBar,
  FormRow, Field, SelectField, TextArea,
  PrintButton, openPrintWindow,
} from "./crm-app/shared";
import { KioskLoginScreen } from "./crm-app/login";
import { WorkerTimeView, WorkerDetailCard, KioskUserView, getDeviceUuid, getDeviceInfo } from "./crm-app/worker";
import { CustomerDetailCard } from "./crm-app/customers";
import { SettingsPanel } from "./crm-app/settings";
import { DocumentPanel, DocumentPreviewModal } from "./crm-app/documents";
import { DashboardSection, EntityList } from "./crm-app/dashboard";
import { ReportsSection } from "./crm-app/reports";
import { NotificationBell } from "./crm-app/notifications";
import { ProjectDetailCard, KioskProjectView, PlanningCalendar } from "./crm-app/projects";
import { SUPPORTED_LANGUAGES, type SupportedLang } from "../i18n";

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
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  const [loginTab, setLoginTab] = useState<"admin" | "kiosk">("admin");
  const [loginEmail, setLoginEmail] = useState("admin@example.local");
  const [loginPassword, setLoginPassword] = useState("admin12345");
  const [loginPin, setLoginPin] = useState("");
  const [loginLang, setLoginLang] = useState<SupportedLang>("de");

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
    if (!auth || auth.type === "worker" || auth.type === "kiosk-user") {
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

      const nextAuth: AuthState = { ...response, type: "user", sessionLang: loginLang };

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
        loginType: "worker" | "kiosk-user" | "user";
        worker: { id: string; workerNumber: string; name: string } | null;
        user: { id: string; email: string; displayName: string; roles: string[] } | null;
        currentProjects: AuthState["currentProjects"];
        futureProjects: AuthState["futureProjects"];
        pastProjects: AuthState["pastProjects"];
        deviceWarning: string | null;
      }>("/auth/kiosk-login", {
        method: "POST",
        body: JSON.stringify({
          pin: loginPin,
          deviceUuid: getDeviceUuid(),
          ...getDeviceInfo(),
        }),
      });

      let nextAuth: AuthState;
      if (response.loginType === "user" && response.user) {
        nextAuth = {
          accessToken: response.accessToken,
          type: "user",
          sessionLang: loginLang,
          user: response.user,
        };
      } else if (response.loginType === "kiosk-user" && response.user) {
        nextAuth = {
          accessToken: response.accessToken,
          type: "kiosk-user",
          sessionLang: loginLang,
          user: response.user,
        };
      } else {
        nextAuth = {
          accessToken: response.accessToken,
          type: "worker",
          sessionLang: loginLang,
          user: {
            id: response.worker!.id,
            email: "",
            displayName: response.worker!.name,
            roles: ["WORKER"],
          },
          worker: response.worker!,
          currentProjects: response.currentProjects,
          futureProjects: response.futureProjects,
          pastProjects: response.pastProjects,
        };
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      }

      setDeviceWarning(response.deviceWarning ?? null);
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

    setLoginPin("");
    setLoginEmail("");
    setLoginPassword("");
    setAuth(null);
    setUsers([]);
    setRoles([]);
    setSettings(null);
    setSummary(null);
    setSuccess(null);
    setError(null);
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
        email: userForm.email,
        displayName: userForm.displayName,
        password: userForm.password || undefined,
        kioskCode: userForm.kioskCode || undefined,
        roleCodes: userForm.roleCodes,
        isActive: userForm.isActive,
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
      const targetLabel =
        label === "Kunde"
          ? "dieser Kunde"
          : label === "Monteur"
            ? "dieser Monteur"
            : label === "Projekt"
              ? "dieses Projekt"
              : label;
      const ok = window.confirm(
        `Soll ${targetLabel} wirklich endgueltig geloescht werden?\n\nDieser Vorgang kann nicht rueckgaengig gemacht werden.`,
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
      if (blob.type.startsWith("image/")) {
        const url = window.URL.createObjectURL(blob);
        const win = window.open("", "_blank", "width=1000,height=800");
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><title>Bild drucken</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  img { width: 100vw; height: 100vh; object-fit: contain; }
</style></head><body><img src="${url}" alt="Druckbild" /></body></html>`);
        win.document.close();
        win.setTimeout(() => {
          win.print();
          window.setTimeout(() => {
            window.URL.revokeObjectURL(url);
          }, 2000);
        }, 300);
        return;
      }
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
        lang={loginLang}
        setLang={setLoginLang}
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
        deviceWarning={deviceWarning}
        setDeviceWarning={setDeviceWarning}
        renderKioskProjectView={(props) => <KioskProjectView {...props} />}
      />
    );
  }

  // ── Kiosk-User-Sicht (Projektleiter Kunde etc.) ─────────────
  if (auth.type === "kiosk-user") {
    return (
      <KioskUserView
        auth={auth}
        apiFetch={apiFetch}
        onLogout={logout}
        deviceWarning={deviceWarning}
        setDeviceWarning={setDeviceWarning}
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
            <NotificationBell apiFetch={apiFetch} />
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
          <div className={cx("grid gap-6", !selectedWorker && "xl:grid-cols-[1.1fr_0.9fr]")}>
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
                    deleteLabel="Loeschen"
                    onOpen={(item) => router.push(`/projects/${item.id}`)}
                    onDelete={(item) => void handleDelete(`/projects/${item.id}`, "Projekt", true)}
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
                    apiFetch={apiFetch}
                  />
                </>
              ) : (
                <SectionCard title="Monteursliste" subtitle="Klick auf den Monteurtitel oeffnet die Monteurseite.">
                  <EntityList
                    items={workers}
                    title={(item) => `${item.firstName} ${item.lastName}${item.active === false ? " (deaktiviert)" : ""}`}
                    subtitle={(item) => item.workerNumber}
                    deleteLabel="Loeschen"
                    onOpen={(item) => router.push(`/workers/${item.id}`)}
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
                    {workerForm.id && workers.find((item) => item.id === workerForm.id)?.pins?.length ? (
                      <div className="mb-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        PIN ist gesetzt. Neuen Wert eingeben um zu aendern.
                      </div>
                    ) : null}
                    <input
                      type="password"
                      autoComplete="new-password"
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
                <FormRow>
                  <SelectField
                    label="Sprache (Kiosk/PDF)"
                    value={workerForm.languageCode}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        languageCode: event.target.value,
                      }))
                    }
                    options={SUPPORTED_LANGUAGES.map((lang) => ({
                      value: lang.code,
                      label: lang.label,
                    }))}
                  />
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
              workers={workers}
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

// ── Hilfsfunktionen ──────────────────────────────────

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

