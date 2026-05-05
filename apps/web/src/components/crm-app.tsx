"use client";

import {
  BarChart3,
  Building2,
  CalendarDays,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  ListTodo,
  NotebookText,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ThemeToggle } from "./theme-toggle";
import type {
  CrmAppProps, Summary, AuthState,
  Customer,
  Project, Worker,
  DocumentItem, TeamItem, TeamFormState,
  RoleItem, UserItem,
  AppSettings,
  ProjectFormState, WorkerFormState, UserFormState,
  DocumentFormState, DocumentPreviewState,
  TimesheetItem, NoteItem,
  ProjectFinancials, CustomerFinancials,
} from "./crm-app/types";
import { apiUrl, AUTH_STORAGE_KEY } from "./crm-app/types";
import {
  toDateInput, sanitizeForApi,
  NavLink, IconNavLink, PrimaryButton, SecondaryButton,
  SectionCard, InfoCard, MessageBar,
  FormRow, Field, SelectField, TextArea,
  PrintButton, openPrintWindow,
  CollapseIndicator, CollapsibleContent,
} from "./crm-app/shared";
import { KioskLoginScreen } from "./crm-app/login";
import { WorkerTimeView, WorkerDetailCard, KioskUserView, getDeviceUuid, getDeviceInfo } from "./crm-app/worker";
import {
  CustomerDetailCard,
  CreateCustomerModal,
  EditCustomerModal,
  type EditCustomerInitialTab,
  type EditCustomerPrefill,
} from "./crm-app/customers";
import { NoteDetailModal, SpeechButton, MarkdownContent } from "./crm-app/notes";
import { appendSpeechTranscript } from "./crm-app/notes/speech-format";
import { ReminderSettings, SettingsPanel } from "./crm-app/settings";
import { DocumentPreviewModal } from "./crm-app/documents";
import { DashboardSection, EntityList } from "./crm-app/dashboard";
import { ReportsSection } from "./crm-app/reports";
import { NotificationBell } from "./crm-app/notifications";
import { ProjectDetailCard, KioskProjectView, PlanningCalendar, PlanningProfitTool } from "./crm-app/projects";
import { WhatIfCalculator } from "./crm-app/whatif/WhatIfCalculator";
import { SUPPORTED_LANGUAGES, t, type SupportedLang } from "../i18n";
import { I18nProvider } from "../i18n-context";

export type { CrmAppProps } from "./crm-app/types";

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
  notes: "",
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

type ApiError = Error & { status?: number };

function createApiError(message: string, status: number): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  return error;
}

function isUnauthorizedError(error: unknown) {
  return !!error
    && typeof error === "object"
    && "status" in error
    && ((error as ApiError).status === 401 || (error as ApiError).status === 403);
}

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

  const [loginEmail, setLoginEmail] = useState("admin@example.local");
  const [loginPassword, setLoginPassword] = useState("admin12345");
  const [loginPin, setLoginPin] = useState("");
  const [emergencyUsername, setEmergencyUsername] = useState("");
  const [emergencyPassword, setEmergencyPassword] = useState("");
  const [emergencyEnabled, setEmergencyEnabled] = useState(false);
  const [loginLang, setLoginLang] = useState<SupportedLang>("de");
  const activeLang: SupportedLang = auth?.sessionLang === "en" ? "en" : loginLang;
  const l = useCallback((key: string) => t(key, activeLang), [activeLang]);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [workerForm, setWorkerForm] = useState<WorkerFormState>(emptyWorkerForm);
  const [teamForm, setTeamForm] = useState<TeamFormState>({ name: "", notes: "", active: true, memberWorkerIds: [] });
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [settingsForm, setSettingsForm] = useState<AppSettings>({
    passwordMinLength: 8,
    kioskCodeLength: 6,
    defaultTheme: "dark",
    navAsIcons: false,
  });
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [projectFinancials, setProjectFinancials] = useState<ProjectFinancials | null>(null);
  const [projectTimesheets, setProjectTimesheets] = useState<TimesheetItem[]>([]);
  const [customerFinancials, setCustomerFinancials] = useState<CustomerFinancials | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editCustomerTab, setEditCustomerTab] = useState<EditCustomerInitialTab>("basics");
  const [editCustomerPrefill, setEditCustomerPrefill] = useState<EditCustomerPrefill | undefined>(undefined);
  const [reminderCounts, setReminderCounts] = useState<{ byCustomer: Record<string, number>; byProject: Record<string, number> }>({ byCustomer: {}, byProject: {} });
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateWorker, setShowCreateWorker] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  const canManageSettings = hasRole(auth, ["SUPERADMIN", "OFFICE"]);
  const canManageUsers = hasRole(auth, ["SUPERADMIN"]);
  const canEditCustomer = hasPermission(auth, "customers.edit");
  const canCreateCustomer = hasPermission(auth, "customers.create");
  const canDeleteCustomer = hasPermission(auth, "customers.delete");
  const canEditProject = hasPermission(auth, "projects.edit");
  const canEditWorker = hasPermission(auth, "workers.edit");
  const canCreateWorker = hasPermission(auth, "workers.create");
  const canDeleteWorker = hasPermission(auth, "workers.delete");
  const canPrintCustomer = hasPermission(auth, "customers.print");
  const canPrintProject = hasPermission(auth, "projects.print");
  const canPrintDocument = hasPermission(auth, "documents.print");
  const canPrintReports = hasPermission(auth, "reports.print");
  const canPrintTasks = hasPermission(auth, "tasks.print");

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
      const response = await fetch(apiUrl(path), {
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
        const fallback = `API ${l("common.error")} ${response.status}`;
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

        throw createApiError(message, response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    },
    [auth?.accessToken, l],
  );

  /**
   * Wiedervorlagen-Counts neu laden, ohne den Rest der App zu re-fetchen.
   * Wird nach Anlage/Erledigung im Embedded-Bereich aufgerufen, damit Listen-
   * Badges live aktuell bleiben.
   */
  const refreshReminderCounts = useCallback(async () => {
    try {
      const counts = await apiFetch<{ byCustomer: Record<string, number>; byProject: Record<string, number> }>(
        "/reminders/counts?status=OPEN&kind=FOLLOW_UP",
      );
      setReminderCounts(counts);
    } catch {
      // Wenn der Nutzer nicht zugreifen darf, bleibt der letzte Stand.
    }
  }, [apiFetch]);

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

  // Feature-Flag fuer den Notfall-Login (Public-Endpoint /auth/config). Nur
  // wenn der Server EMERGENCY_ADMIN_ENABLED=true meldet, blendet der Login-
  // Screen den Notfall-Bereich ein.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void fetch(apiUrl("/auth/config"))
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: { emergencyLogin?: { enabled?: boolean } } | null) => {
        setEmergencyEnabled(cfg?.emergencyLogin?.enabled === true);
      })
      .catch(() => {
        setEmergencyEnabled(false);
      });
  }, []);

  // Sync permissions/roles from the server once after auth is restored.
  // Catches role changes the admin made since last login and migrates older
  // stored AuthState that predates the permissions field.
  const accessToken = auth?.accessToken;
  const authType = auth?.type;
  useEffect(() => {
    if (!accessToken || authType === "worker") return;
    let cancelled = false;
    void apiFetch<{ sub: string; roles: string[]; permissions: string[]; type: string } | null>("/auth/me")
      .then((me) => {
        if (cancelled || !me) return;
        setAuth((current) => {
          if (!current) return current;
          const next: AuthState = {
            ...current,
            user: {
              ...current.user,
              roles: me.roles ?? current.user.roles,
              permissions: me.permissions ?? [],
            },
          };
          if (typeof window !== "undefined") {
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
          }
          return next;
        });
      })
      .catch(() => {
        // 401 is handled by the global apiFetch error handler / logout flow;
        // any other error here just leaves the cached permissions in place.
      });
    return () => { cancelled = true; };
  }, [accessToken, authType, apiFetch]);

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
        // Wiedervorlagen-Counts: ein Aufruf liefert beide Maps; Fehler (z. B.
        // fehlende Office-Berechtigung) machen die Listen ohne Badge weiter
        // funktionsfaehig statt das ganze Loading abzubrechen.
        apiFetch<{ byCustomer: Record<string, number>; byProject: Record<string, number> }>(
          "/reminders/counts?status=OPEN&kind=FOLLOW_UP",
        )
          .then(setReminderCounts)
          .catch(() => setReminderCounts({ byCustomer: {}, byProject: {} })),
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
        loadError instanceof Error ? loadError.message : l("common.error");
      if (isUnauthorizedError(loadError) || message.includes("401") || message.includes("403")) {
        logout(l("common.relogin"));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, auth, canManageSettings, canManageUsers, l]);

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
      setDocumentForm(emptyDocumentForm());
      void apiFetch<CustomerFinancials>(`/customers/${selectedCustomer.id}/financials`).then(setCustomerFinancials).catch(() => setCustomerFinancials(null));
    } else if (section === "customers") {
      setCustomerFinancials(null);
    }
  }, [section, selectedCustomer, apiFetch]);

  useEffect(() => {
    if (selectedProject) {
      setProjectForm(mapProjectToForm(selectedProject));
      setDocumentForm(emptyDocumentForm());
      void apiFetch<ProjectFinancials>(`/projects/${selectedProject.id}/financials`).then(setProjectFinancials).catch(() => setProjectFinancials(null));
      void apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${selectedProject.id}&includeWorkWeeks=true`).then(setProjectTimesheets).catch(() => setProjectTimesheets([]));
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
      setSuccess(l("common.success"));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Notfall-Login. ENV-basiertes JWT mit kurzer TTL — funktioniert auch bei
   * DB-Ausfall. Speichert die Session wie ein normaler Login, ergaenzt aber
   * `emergency`/`emergencyTtlMinutes`, sodass die UI den Banner zeigen kann.
   */
  async function handleEmergencyLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<{
        accessToken: string;
        ttlMinutes: number;
        user: {
          id: string;
          email: string;
          displayName: string;
          roles: string[];
          permissions: string[];
        };
        emergency: boolean;
      }>("/auth/emergency-login", {
        method: "POST",
        body: JSON.stringify({
          username: emergencyUsername,
          password: emergencyPassword,
        }),
      });

      const nextAuth: AuthState = {
        accessToken: response.accessToken,
        type: "emergency-admin",
        sessionLang: loginLang,
        emergency: true,
        emergencyTtlMinutes: response.ttlMinutes,
        user: {
          id: response.user.id,
          email: response.user.email,
          displayName: response.user.displayName,
          roles: response.user.roles,
          permissions: response.user.permissions,
        },
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      }
      setAuth(nextAuth);
      setEmergencyPassword("");
      setSuccess(l("common.success"));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : l("common.error"));
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
        user: { id: string; email: string; displayName: string; roles: string[]; permissions?: string[] } | null;
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
      setSuccess(l("common.success"));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function logout(nextError?: string | null) {
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
    setError(nextError ?? null);
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
      setShowCreateProject(false);
      await loadData();
      setSuccess(l("common.success"));
    });
  }

  async function handleWorkerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const payload = sanitizeForApi({
        workerNumber: workerForm.id ? workerForm.workerNumber : undefined,
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
      setShowCreateWorker(false);
      await loadData();
      setSuccess(l("common.success"));
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
      setShowTeamModal(false);
      await loadData();
      setSuccess(l("common.success"));
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
      setSuccess(l("common.success"));
    });
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMutation(async () => {
      const payload = sanitizeForApi({
        email: userForm.email,
        displayName: userForm.displayName,
        notes: userForm.notes,
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
      setSuccess(l("common.success"));
    });
  }

  async function handleDelete(path: string, label: string, confirm = false) {
    if (confirm) {
      const targetLabel =
        label === l("nav.customers")
          ? "dieser Kunde"
          : label === l("nav.workers")
            ? "dieser Monteur"
            : label === l("nav.projects")
              ? "dieses Projekt"
              : label;
      const ok = window.confirm(
        `Soll ${targetLabel} wirklich endgueltig geloescht werden?\n\nDieser Vorgang kann nicht rueckgaengig gemacht werden.`,
      );
      if (!ok) return;
    }

    if (path.startsWith("/documents/")) {
      const ok = window.confirm(
        `${l("doc.confirmDelete")}\n\n${l("doc.confirmDeleteHint")}`,
      );
      if (!ok) return;
    }

    await runMutation(async () => {
      try {
        await apiFetch(path, {
          method: "DELETE",
        });
      } catch (deleteError) {
        const isWorkerDelete = path.startsWith("/workers/");
        const isBlockedByTimeData =
          deleteError instanceof Error
          && (deleteError as ApiError).status === 400
          && deleteError.message.includes("Monteur kann nicht geloescht werden");

        if (isWorkerDelete && isBlockedByTimeData) {
          const forceConfirmed = window.confirm(
            `${l("worker.forceDeleteConfirm")}\n\n${l("worker.forceDeleteHint")}`,
          );
          if (!forceConfirmed) {
            return;
          }
          await apiFetch(`${path}${path.includes("?") ? "&" : "?"}force=true`, {
            method: "DELETE",
          });
        } else {
          throw deleteError;
        }
      }
      await loadData();
      setSuccess(`${label} geloescht.`);
    });
  }

  async function handleDocumentUpload(entityType: string, targetId: string) {
    if (!documentForm.file) {
      setError(l("common.error"));
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
      setSuccess(l("kiosk.uploaded"));
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
      setError(downloadError instanceof Error ? downloadError.message : l("kiosk.downloadFailed"));
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
          : l("kiosk.docLoadFailed"),
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
        win.document.write(`<!DOCTYPE html><html><head><title>${l("doc.printImage")}</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  img { width: 100vw; height: 100vh; object-fit: contain; }
</style></head><body><img src="${url}" alt="${l("doc.printImageAlt")}" /></body></html>`);
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
      setError(printError instanceof Error ? printError.message : l("kiosk.printFailed"));
    }
  }

  async function fetchDocumentBlob(documentId: string) {
    const response = await fetch(apiUrl(`/documents/${documentId}/download`), {
      headers: auth?.accessToken
        ? {
            Authorization: `Bearer ${auth.accessToken}`,
          }
        : undefined,
    });

    if (!response.ok) {
      let message = l("kiosk.docLoadFailed");
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
      throw createApiError(message, response.status);
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
      if (isUnauthorizedError(mutationError)) {
        logout(l("common.relogin"));
      } else {
        setError(
          mutationError instanceof Error ? mutationError.message : l("common.error"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Nur SUPERADMIN sieht das Ertragsplanungs-Tool. Notfall-Admin (`*`-perm)
  // greift weiterhin als ueberlagernder Wildcard, aber die Rolle entscheidet
  // hier, weil das Modul rein finanziellen Charakter hat.
  const canSeeProfitPlanning = hasRole(auth, ["SUPERADMIN"]);
  const navItems = [
    { key: "dashboard" as const, href: "/dashboard", label: l("nav.dashboard"), icon: <LayoutDashboard className="h-5 w-5" />, color: "text-sky-500 dark:text-sky-400" },
    { key: "customers" as const, href: "/customers", label: l("nav.customers"), icon: <Building2 className="h-5 w-5" />, color: "text-emerald-500 dark:text-emerald-400" },
    { key: "projects" as const, href: "/projects", label: l("nav.projects"), icon: <FolderKanban className="h-5 w-5" />, color: "text-violet-500 dark:text-violet-400" },
    { key: "workers" as const, href: "/workers", label: l("nav.workers"), icon: <HardHat className="h-5 w-5" />, color: "text-amber-500 dark:text-amber-400" },
    { key: "planning" as const, href: "/planning", label: l("nav.planning"), icon: <CalendarDays className="h-5 w-5" />, color: "text-rose-500 dark:text-rose-400" },
    ...(canSeeProfitPlanning
      ? [{ key: "profit-planning" as const, href: "/profit-planning", label: l("nav.profitPlanning"), icon: <BarChart3 className="h-5 w-5" />, color: "text-emerald-500 dark:text-emerald-400" }]
      : []),
    ...(canSeeProfitPlanning
      ? [{ key: "whatif" as const, href: "/whatif", label: l("nav.whatif"), icon: <BarChart3 className="h-5 w-5" />, color: "text-fuchsia-500 dark:text-fuchsia-400" }]
      : []),
    { key: "reports" as const, href: "/reports", label: l("nav.reports"), icon: <BarChart3 className="h-5 w-5" />, color: "text-cyan-500 dark:text-cyan-400" },
    { key: "tasks" as const, href: "/tasks", label: l("nav.tasks"), icon: <ListTodo className="h-5 w-5" />, color: "text-orange-500 dark:text-orange-400" },
    { key: "notes" as const, href: "/notes", label: l("nav.notes"), icon: <NotebookText className="h-5 w-5" />, color: "text-fuchsia-500 dark:text-fuchsia-400" },
  ];

  if (!ready) {
    return <I18nProvider lang={activeLang}><div className="p-6 text-sm text-slate-500">{l("common.loading")}</div></I18nProvider>;
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
        emergencyEnabled={emergencyEnabled}
        emergencyUsername={emergencyUsername}
        setEmergencyUsername={setEmergencyUsername}
        emergencyPassword={emergencyPassword}
        setEmergencyPassword={setEmergencyPassword}
        onEmergencyLogin={handleEmergencyLogin}
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
      <I18nProvider lang={activeLang}>
        <WorkerTimeView
          auth={auth}
          apiFetch={apiFetch}
          onLogout={logout}
          deviceWarning={deviceWarning}
          setDeviceWarning={setDeviceWarning}
          renderKioskProjectView={(props) => <KioskProjectView {...props} />}
        />
      </I18nProvider>
    );
  }

  if (auth.type === "kiosk-user") {
    return (
      <I18nProvider lang={activeLang}>
        <KioskUserView
          auth={auth}
          apiFetch={apiFetch}
          onLogout={logout}
          deviceWarning={deviceWarning}
          setDeviceWarning={setDeviceWarning}
        />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={activeLang}>
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        {auth.type === "emergency-admin" || auth.emergency ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200" role="alert">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white">
                {l("kiosk.emergencyBanner")}
              </span>
              <span>{l("kiosk.emergencyBannerNote")}</span>
              {auth.emergencyTtlMinutes ? (
                <span className="text-xs text-amber-800 dark:text-amber-300">
                  {l("kiosk.emergencyTtlInfo").replace("{minutes}", String(auth.emergencyTtlMinutes))}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-lg border border-amber-500 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-300"
            >
              {l("kiosk.emergencyBannerLogout")}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{l("worker.platform")}</p>
            <h1 className="text-2xl font-semibold">{l(`nav.${section === "users" ? "settings" : section === "profit-planning" ? "profitPlanning" : section === "whatif" ? "whatif" : section}`)}</h1>
            <p className="text-sm text-slate-500">
              {auth.user.displayName} · {auth.user.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClockBadge locale={activeLang === "en" ? "en-US" : "de-DE"} />
            {navItems.map((item) =>
              settingsForm.navAsIcons ? (
                <IconNavLink key={item.key} href={item.href} active={section === item.key} label={item.label}>
                  <span className={section === item.key ? "text-white dark:text-slate-950" : item.color}>
                    {item.icon}
                  </span>
                </IconNavLink>
              ) : (
                <NavLink key={item.key} href={item.href} active={section === item.key}>
                  {item.label}
                </NavLink>
              ),
            )}
            {canManageSettings ? (
              settingsForm.navAsIcons ? (
                <IconNavLink
                  href="/settings"
                  active={section === "settings" || section === "users"}
                  label={l("nav.settings")}
                >
                  <span className={section === "settings" || section === "users" ? "text-white dark:text-slate-950" : "text-slate-600 dark:text-slate-300"}>
                    <SettingsIcon className="h-5 w-5" />
                  </span>
                </IconNavLink>
              ) : (
                <NavLink href="/settings" active={section === "settings" || section === "users"}>
                  {l("nav.settings")}
                </NavLink>
              )
            ) : null}
            <NotificationBell apiFetch={apiFetch} />
            <ThemeToggle />
            <SecondaryButton onClick={() => logout()}>{l("nav.logout")}</SecondaryButton>
          </div>
        </div>

        <MessageBar error={error} success={success} />

        {loading ? <InfoCard title={l("common.loading")}>{l("common.loading")}</InfoCard> : null}

        {section === "dashboard" ? (
          <DashboardSection
            summary={summary}
            customers={customers}
            projects={projects}
            workers={workers}
            teams={teams}
            apiFetch={apiFetch}
          />
        ) : null}

        {section === "customers" ? (
          <div className="grid gap-6">
            <div className="grid gap-6">
              {selectedCustomer ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/customers" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      {l("common.backToList")}
                    </Link>
                    <h2 className="text-xl font-semibold">{l("cust.detailTitle")}</h2>
                  </div>
                  <CustomerDetailCard
                    customer={selectedCustomer}
                    customerProjects={projects.filter((p) => p.customerId === selectedCustomer.id)}
                    financials={customerFinancials}
                    documents={filterDocuments(documents, "CUSTOMER", selectedCustomer.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={canPrintDocument ? handlePrintDocument : undefined}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, l("doc.title"))}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => handleDocumentUpload("CUSTOMER", selectedCustomer.id)}
                    onEdit={canEditCustomer ? () => {
                      // "Weitere Kundendaten ergaenzen" landet bewusst im
                      // Vereinbarungen/Finanzen-Reiter. Die reinen Stammdaten
                      // erreicht der Nutzer ueber den Bearbeiten-Stift im
                      // Header bzw. den ersten Reiter im geoeffneten Modal.
                      setEditCustomerTab("agreements");
                      setEditCustomerPrefill(undefined);
                      setShowEditCustomer(true);
                    } : undefined}
                    onAddPrimaryContact={canEditCustomer ? () => {
                      setEditCustomerTab("contacts");
                      setEditCustomerPrefill({ newContact: { asPrimary: true } });
                      setShowEditCustomer(true);
                    } : undefined}
                    onAddBranch={canEditCustomer ? () => {
                      setEditCustomerTab("branches");
                      setEditCustomerPrefill({ newBranch: true });
                      setShowEditCustomer(true);
                    } : undefined}
                    onEditContacts={canEditCustomer ? () => {
                      setEditCustomerTab("contacts");
                      setEditCustomerPrefill(undefined);
                      setShowEditCustomer(true);
                    } : undefined}
                    onCreateProject={canEditProject ? () => {
                      setProjectForm({
                        ...emptyProjectForm(),
                        customerId: selectedCustomer.id,
                      });
                      setShowCreateProject(true);
                      router.push("/projects");
                    } : undefined}
                    onEditTab={canEditCustomer ? (tab) => {
                      setEditCustomerTab(tab);
                      setEditCustomerPrefill(undefined);
                      setShowEditCustomer(true);
                    } : undefined}
                    canPrint={canPrintCustomer}
                    apiFetch={apiFetch}
                    currentUserId={auth.user.id}
                    onRemindersChanged={() => void refreshReminderCounts()}
                  />
                  {showEditCustomer ? (
                    <EditCustomerModal
                      customer={selectedCustomer}
                      customerProjects={projects.filter((p) => p.customerId === selectedCustomer.id)}
                      apiFetch={apiFetch}
                      initialTab={editCustomerTab}
                      prefill={editCustomerPrefill}
                      onCreateProject={canEditProject ? () => {
                        setProjectForm({
                          ...emptyProjectForm(),
                          customerId: selectedCustomer.id,
                        });
                        setShowEditCustomer(false);
                        setEditCustomerPrefill(undefined);
                        setShowCreateProject(true);
                        router.push("/projects");
                      } : undefined}
                      onClose={() => {
                        setShowEditCustomer(false);
                        setEditCustomerPrefill(undefined);
                      }}
                      onSaved={async () => {
                        setShowEditCustomer(false);
                        setEditCustomerPrefill(undefined);
                        await loadData();
                        setSuccess(l("cust.updated"));
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <SectionCard title={l("cust.list")} subtitle={l("cust.listSub")} bordered={false}>
                    {canCreateCustomer ? (
                      <div className="mb-4">
                        <button
                          type="button"
                          onClick={() => setShowCreateCustomer(true)}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                          </svg>
                          {l("cust.newCustomer")}
                        </button>
                      </div>
                    ) : null}
                    <EntityList
                      items={customers}
                      title={(item) => item.companyName}
                      subtitle={(item) => item.customerNumber}
                      href={(item) => `/customers/${item.id}`}
                      editLabel={l("common.edit")}
                      deleteLabel={l("common.delete")}
                      onOpen={(item) => router.push(`/customers/${item.id}`)}
                      onEdit={canEditCustomer ? (item) => router.push(`/customers/${item.id}`) : undefined}
                      onDelete={canDeleteCustomer ? (item) => void handleDelete(`/customers/${item.id}`, l("nav.customers"), true) : undefined}
                      badges={(item) => {
                        const count = reminderCounts.byCustomer[item.id] ?? 0;
                        if (count <= 0) return null;
                        return (
                          <span
                            title={`${count} ${l("reminder.openCount")}`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          >
                            ⏰ {count} {l("reminder.openCountShort")}
                          </span>
                        );
                      }}
                    />
                  </SectionCard>
                  {showCreateCustomer ? (
                    <CreateCustomerModal
                      apiFetch={apiFetch}
                      onClose={() => setShowCreateCustomer(false)}
                      onCreated={(id) => {
                        setShowCreateCustomer(false);
                        void loadData().then(() => router.push(`/customers/${id}`));
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        {section === "projects" ? (
          <div className="grid gap-6">
            <div className="grid gap-6">
              {selectedProject ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/projects" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      {l("common.backToList")}
                    </Link>
                    <h2 className="text-xl font-semibold">{l("proj.detailHeading")}</h2>
                  </div>
                  <ProjectDetailCard
                    project={selectedProject}
                    workers={workers}
                    financials={projectFinancials}
                    timesheets={projectTimesheets}
                    documents={filterDocuments(documents, "PROJECT", selectedProject.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={canPrintDocument ? handlePrintDocument : undefined}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, l("doc.title"))}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => handleDocumentUpload("PROJECT", selectedProject.id)}
                    onDataChanged={loadData}
                    onEdit={
                      canEditProject
                        ? () => {
                            setProjectForm(mapProjectToForm(selectedProject));
                            setShowCreateProject(true);
                          }
                        : undefined
                    }
                    onEditWorker={
                      canEditWorker
                        ? (workerId: string) => {
                            const target = workers.find((w) => w.id === workerId);
                            if (!target) return;
                            setWorkerForm(mapWorkerToForm(target));
                            setShowCreateWorker(true);
                          }
                        : undefined
                    }
                    canPrint={canPrintProject}
                    apiFetch={apiFetch}
                    currentUserId={auth.user.id}
                    onRemindersChanged={() => void refreshReminderCounts()}
                  />
                </>
              ) : (
                <SectionCard title={l("proj.list")} subtitle={l("proj.listSub")}>
                  <div className="mb-3 flex flex-wrap justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setProjectForm(emptyProjectForm());
                        setShowCreateProject(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                      </svg>
                      {l("proj.create")}
                    </button>
                    {canPrintProject ? (
                      <PrintButton onClick={() => {
                        const rows = projects.map((p) => `<tr><td>${p.projectNumber}</td><td>${p.title}</td><td>${p.customer?.companyName ?? "-"}</td><td>${p.status ?? "-"}</td><td>${p.plannedStartDate?.slice(0, 10) ?? "-"} - ${p.plannedEndDate?.slice(0, 10) ?? l("worker.open")}</td></tr>`).join("");
                        openPrintWindow(l("proj.list"), `<h1>${l("proj.list")}</h1><p class="meta">${projects.length} ${l("proj.title")}</p><table><thead><tr><th>${l("table.nr")}</th><th>${l("table.title")}</th><th>${l("table.customer")}</th><th>${l("table.status")}</th><th>${l("table.period")}</th></tr></thead><tbody>${rows}</tbody></table>`);
                      }} label={l("doc.print")} />
                    ) : null}
                  </div>
                  <EntityList
                    items={projects}
                    title={(item) => item.title}
                    subtitle={(item) => item.projectNumber}
                    deleteLabel={l("common.delete")}
                    onOpen={(item) => router.push(`/projects/${item.id}`)}
                    onDelete={(item) => void handleDelete(`/projects/${item.id}`, l("nav.projects"), true)}
                    badges={(item) => {
                      const count = reminderCounts.byProject[item.id] ?? 0;
                      if (count <= 0) return null;
                      return (
                        <span
                          title={`${count} ${l("reminder.openCount")}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                        >
                          ⏰ {count} {l("reminder.openCountShort")}
                        </span>
                      );
                    }}
                  />
                </SectionCard>
              )}
            </div>
            {showCreateProject ? (
              <PopupFrame onClose={() => {
                setProjectForm(emptyProjectForm());
                setShowCreateProject(false);
              }}>
                <SectionCard
                  title={l(projectForm.id ? "proj.edit" : "proj.create")}
                  subtitle={l("proj.createSub")}
                >
                  <form className="grid gap-4" onSubmit={handleProjectSubmit}>
                  <ProjectFormFields
                    form={projectForm}
                    setForm={setProjectForm}
                    customers={customers}
                    l={l}
                  />
                    <div className="flex gap-3">
                      <PrimaryButton disabled={submitting}>
                        {submitting ? l("common.saving") : l("proj.save")}
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setProjectForm(emptyProjectForm())}>
                        {l("common.reset")}
                      </SecondaryButton>
                      <SecondaryButton onClick={() => {
                        setProjectForm(emptyProjectForm());
                        setShowCreateProject(false);
                      }}>
                        {l("common.close")}
                      </SecondaryButton>
                    </div>
                  </form>
                </SectionCard>
              </PopupFrame>
            ) : null}
          </div>
        ) : null}

        {section === "workers" ? (
          <>
          <div className="grid gap-6">
            <div className="grid gap-6">
              {selectedWorker ? (
                <>
                  <div className="flex items-center gap-3">
                    <Link href="/workers" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                      {l("common.backToList")}
                    </Link>
                    <h2 className="text-xl font-semibold">{l("work.detailTitle")}</h2>
                  </div>
                  <WorkerDetailCard
                    worker={selectedWorker}
                    projects={projects}
                    documents={filterDocuments(documents, "WORKER", selectedWorker.id)}
                    onOpenDocument={handleOpenDocument}
                    onPrintDocument={canPrintDocument ? handlePrintDocument : undefined}
                    onDownload={handleDownloadDocument}
                    onDeleteDocument={(id) => void handleDelete(`/documents/${id}`, l("doc.title"))}
                    documentForm={documentForm}
                    setDocumentForm={setDocumentForm}
                    authToken={auth.accessToken}
                    onUpload={() => handleDocumentUpload("WORKER", selectedWorker.id)}
                    onDataChanged={loadData}
                    onEdit={() => {
                      setWorkerForm(mapWorkerToForm(selectedWorker));
                      setShowCreateWorker(true);
                    }}
                    apiFetch={apiFetch}
                  />
                </>
              ) : (
                <SectionCard title={l("work.list")} subtitle={l("work.listSub")}>
                  {canCreateWorker ? (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkerForm(emptyWorkerForm());
                          setShowCreateWorker(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                        {l("work.create")}
                      </button>
                    </div>
                  ) : null}
                  <EntityList
                    items={workers}
                    title={(item) => `${item.firstName} ${item.lastName}${item.active === false ? " (deaktiviert)" : ""}`}
                    subtitle={(item) => item.workerNumber}
                    deleteLabel={l("common.delete")}
                    onOpen={(item) => router.push(`/workers/${item.id}`)}
                    onDelete={canDeleteWorker ? (item) => void handleDelete(`/workers/${item.id}`, l("nav.workers"), true) : undefined}
                  />
                </SectionCard>
              )}
            </div>
            {showCreateWorker ? (
              <PopupFrame onClose={() => {
                setWorkerForm(emptyWorkerForm());
                setShowCreateWorker(false);
              }}>
                <SectionCard
                  title={l(workerForm.id ? "work.edit" : "work.create")}
                  subtitle={l("work.editSub")}
                >
                  <form className="grid gap-4" onSubmit={handleWorkerSubmit}>
                <FormRow>
                  {workerForm.id ? (
                    <Field
                      label={l("work.number")}
                      value={workerForm.workerNumber}
                      onChange={(event) =>
                        setWorkerForm((current) => ({
                          ...current,
                          workerNumber: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">{l("work.number")}</label>
                      <input
                        type="text"
                        value={l("work.numberAuto")}
                        readOnly
                        className="w-full rounded-xl border border-black/10 bg-slate-100 px-3 py-2 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-slate-800 dark:text-slate-400"
                      />
                      <p className="text-xs text-slate-500">{l("work.numberAutoHint")}</p>
                    </div>
                  )}
                  <Field
                    label={l("work.firstName")}
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
                    label={l("work.lastName")}
                    value={workerForm.lastName}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                  />
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{l("work.kioskPin")}</label>
                    {workerForm.id && workers.find((item) => item.id === workerForm.id)?.pins?.length ? (
                      <div className="mb-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        {l("work.pinSet")}
                      </div>
                    ) : null}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={workerForm.pin}
                      onChange={(event) => setWorkerForm((current) => ({ ...current, pin: event.target.value }))}
                      placeholder={workerForm.id ? l("work.pinNew") : l("work.pinCreate")}
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
                    />
                    <p className="text-xs text-slate-500">
                      {workerForm.id ? l("work.pinHint") : l("work.pinHintCreate")}
                    </p>
                  </div>
                </FormRow>
                <FormRow>
                  <Field
                    label={l("work.email")}
                    value={workerForm.email}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label={l("work.mobile")}
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
                    label={l("work.office")}
                    value={workerForm.phoneOffice}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        phoneOffice: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label={l("work.address")}
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
                    label={l("work.address2")}
                    value={workerForm.addressLine2}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        addressLine2: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label={l("work.postalCode")}
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
                    label={l("work.city")}
                    value={workerForm.city}
                    onChange={(event) =>
                      setWorkerForm((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                  />
                  <Field
                    label={l("work.country")}
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
                    label={l("work.language")}
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
                    label={l("work.hourlyRate")}
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
                  label={l("work.notes")}
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
                        {submitting ? l("common.saving") : l("work.save")}
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setWorkerForm(emptyWorkerForm())}>
                        {l("common.reset")}
                      </SecondaryButton>
                      <SecondaryButton onClick={() => {
                        setWorkerForm(emptyWorkerForm());
                        setShowCreateWorker(false);
                      }}>
                        {l("common.close")}
                      </SecondaryButton>
                    </div>
                  </form>
                </SectionCard>
              </PopupFrame>
            ) : null}
          </div>

          {/* ── Teams ────────────────────────────────────── */}
          <div className="grid gap-6">
            <SectionCard title={l("work.teams")} subtitle={l("work.teamsSub")}>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] });
                    setShowTeamModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  {l("work.teamCreate")}
                </button>
              </div>
              {teams.length === 0 ? (
                <p className="text-sm text-slate-500">{l("work.noTeams")}</p>
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
                            ? l("common.none")
                            : team.members.map((m) => `${m.worker.firstName} ${m.worker.lastName}`).join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <SecondaryButton
                          onClick={() =>
                            {
                              setTeamForm({
                                id: team.id,
                                name: team.name,
                                notes: team.notes ?? "",
                                active: team.active,
                                memberWorkerIds: team.members.map((m) => m.worker.id),
                              });
                              setShowTeamModal(true);
                            }
                          }
                        >
                          {l("common.edit")}
                        </SecondaryButton>
                        <SecondaryButton onClick={() => void handleDelete(`/teams/${team.id}`, l("work.teams"))}>
                          {l("common.delete")}
                        </SecondaryButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            {showTeamModal ? (
              <PopupFrame onClose={() => {
                setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] });
                setShowTeamModal(false);
              }}>
                <SectionCard
                  title={l(teamForm.id ? "work.teamEdit" : "work.teamCreate")}
                  subtitle={l("work.teamsSub")}
                >
                  <form className="grid gap-4" onSubmit={handleTeamSubmit}>
                <Field
                  label={l("work.teamName")}
                  value={teamForm.name}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <TextArea
                  label={l("work.notes")}
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
                        {submitting ? l("common.saving") : l("work.teamSave")}
                      </PrimaryButton>
                      <SecondaryButton
                        onClick={() => setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] })}
                      >
                        {l("common.reset")}
                      </SecondaryButton>
                      <SecondaryButton
                        onClick={() => {
                          setTeamForm({ name: "", notes: "", active: true, memberWorkerIds: [] });
                          setShowTeamModal(false);
                        }}
                      >
                        {l("common.close")}
                      </SecondaryButton>
                    </div>
                  </form>
                </SectionCard>
              </PopupFrame>
            ) : null}
          </div>
          </>
        ) : null}

        {section === "planning" ? (
          <PlanningCalendar projects={projects} workers={workers} teams={teams} apiFetch={apiFetch} onDataChanged={() => void loadData()} />
        ) : null}

        {section === "profit-planning" ? (
          // Permission-Gate: nicht-SUPERADMIN sehen den Eintrag schon im Menue
          // nicht; ein Direktaufruf der URL faellt hier auf einen ruhigen
          // Hinweis zurueck statt eine leere Seite zu zeigen.
          canSeeProfitPlanning ? (
            <PlanningProfitTool
              apiFetch={apiFetch}
              authToken={auth.accessToken}
              canEditTargets={hasPermission(auth, "planning.targets")}
              canExport={hasPermission(auth, "planning.export")}
              canEditActuals={hasPermission(auth, "planning.actuals.edit")}
              canViewForecast={hasPermission(auth, "planning.forecast.view")}
              canManageVersions={hasPermission(auth, "planning.versioning.manage")}
              canImport={hasPermission(auth, "planning.import")}
              canViewImportLogs={hasPermission(auth, "planning.import.logs.view")}
              canViewKpis={hasPermission(auth, "planning.kpi.view")}
              canManageAlerts={hasPermission(auth, "planning.alerts.manage")}
              canSubmitReview={hasPermission(auth, "planning.review.submit")}
              canApproveReview={hasPermission(auth, "planning.review.approve")}
              canRejectReview={hasPermission(auth, "planning.review.reject")}
              canManageBaseline={hasPermission(auth, "planning.baseline.manage")}
              canViewBudget={hasPermission(auth, "planning.budget.view")}
              canEditBudget={hasPermission(auth, "planning.budget.edit")}
              canViewCashflow={hasPermission(auth, "planning.cashflow.view")}
              canViewCapacity={hasPermission(auth, "planning.capacity.view")}
              canEditCapacity={hasPermission(auth, "planning.capacity.edit")}
              canViewPipeline={hasPermission(auth, "planning.pipeline.view")}
              canEditPipeline={hasPermission(auth, "planning.pipeline.edit")}
            />
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {l("common.error")}
            </div>
          )
        ) : null}

        {section === "whatif" ? (
          canSeeProfitPlanning ? (
            <WhatIfCalculator />
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {l("common.error")}
            </div>
          )
        ) : null}

        {section === "reports" ? (
          <ReportsSection
            customers={customers}
            projects={projects}
            workers={workers}
            apiFetch={apiFetch}
            canPrint={canPrintReports}
          />
        ) : null}

        {section === "notes" ? (
          <NotesSection customers={customers} projects={projects} apiFetch={apiFetch} auth={auth} />
        ) : null}

        {section === "tasks" ? (
          canManageSettings ? (
            <ReminderSettings
              apiFetch={apiFetch}
              setPanelSuccess={setSuccess}
              setPanelError={setError}
              showSystemSection={false}
              showOfficeSection
              officeListFirst
              usePopupForm
              canPrint={canPrintTasks}
            />
          ) : (
            <InfoCard title={l("settings.noAccess")}>{l("settings.noAccess")}</InfoCard>
          )
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
              onDeleteUser={(id) => void handleDelete(`/users/${id}`, l("settings.users"), true)}
              canManageUsers={canManageUsers}
              submitting={submitting}
              apiFetch={apiFetch}
              error={error}
              success={success}
            />
          ) : (
            <InfoCard title={l("settings.noAccess")}>{l("settings.noAccess")}</InfoCard>
          )
        ) : null}

        {section === "users" ? null : null}
      </div>
      {documentPreview ? (
        <DocumentPreviewModal
          preview={documentPreview}
          onPrint={
            canPrintDocument
              ? () => void handlePrintDocumentById(documentPreview.documentId)
              : undefined
          }
          onClose={() => {
            window.URL.revokeObjectURL(documentPreview.url);
            setDocumentPreview(null);
          }}
        />
      ) : null}
    </div>
    </I18nProvider>
  );

}

// ── Monteur Stundenzettel ────────────────────────────────────

function NotesSection({ customers, projects, apiFetch, auth }: {
  customers: Customer[];
  projects: Project[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  auth: AuthState;
}) {
  const notesLang: SupportedLang = auth.sessionLang === "en" ? "en" : "de";
  const notesLocale = notesLang === "en" ? "en-GB" : "de-DE";
  const l = (key: string) => t(key, notesLang);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<"" | "CUSTOMER" | "CONTACT">("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState<"" | "true" | "false">("");
  const [sortMode, setSortMode] = useState<"desc" | "asc" | "customer">("desc");
  const [showForm, setShowForm] = useState(false);
  const [formEntityType, setFormEntityType] = useState<"CUSTOMER" | "CONTACT">("CUSTOMER");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formIsPhone, setFormIsPhone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);

  // Contacts available for the filter dropdown (scoped to selected customer)
  const filterContacts = useMemo(() => {
    if (!customerFilter) {
      // All contacts across all customers
      return customers.flatMap((c) =>
        (c.contacts ?? []).filter((ct) => ct.id).map((ct) => ({ id: ct.id!, firstName: ct.firstName, lastName: ct.lastName, customerId: c.id }))
      );
    }
    const cust = customers.find((c) => c.id === customerFilter);
    return (cust?.contacts ?? []).filter((ct) => ct.id).map((ct) => ({ id: ct.id!, firstName: ct.firstName, lastName: ct.lastName, customerId: cust!.id }));
  }, [customers, customerFilter]);

  const filterProjects = useMemo(() => {
    if (!customerFilter) {
      return projects;
    }
    return projects.filter((project) => project.customerId === customerFilter);
  }, [customerFilter, projects]);

  const formContacts = useMemo(() => {
    if (formEntityType !== "CONTACT" || !formCustomerId) {
      return [];
    }
    const customer = customers.find((item) => item.id === formCustomerId);
    return (customer?.contacts ?? [])
      .filter((contact) => contact.id)
      .map((contact) => ({
        id: contact.id ?? "",
        firstName: contact.firstName,
        lastName: contact.lastName,
        customerId: customer?.id ?? "",
      }));
  }, [customers, formCustomerId, formEntityType]);

  const formProjects = useMemo(() => {
    if (!formCustomerId) {
      return projects;
    }
    return projects.filter((project) => project.customerId === formCustomerId);
  }, [formCustomerId, projects]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (entityFilter) params.set("entityType", entityFilter);
    if (customerFilter) params.set("customerId", customerFilter);
    if (contactFilter) params.set("contactId", contactFilter);
    if (projectFilter) params.set("projectId", projectFilter);
    if (phoneFilter) params.set("phoneOnly", phoneFilter);
    if (sortMode === "asc" || sortMode === "desc") params.set("sort", sortMode);
    const data = await apiFetch<NoteItem[]>(`/notes?${params.toString()}`).catch(() => []);
    // Client-side sort for "customer" mode
    if (sortMode === "customer") {
      data.sort((a, b) => {
        const nameA = a.customer?.companyName ?? a.contact?.customer?.companyName ?? "";
        const nameB = b.customer?.companyName ?? b.contact?.customer?.companyName ?? "";
        return nameA.localeCompare(nameB);
      });
    }
    setNotes(data);
    setLoading(false);
  }, [apiFetch, search, entityFilter, customerFilter, contactFilter, projectFilter, phoneFilter, sortMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveNote() {
    if (!formContent.trim()) return;
    if (formEntityType === "CUSTOMER" && !formCustomerId) return;
    if (formEntityType === "CONTACT" && !formContactId) return;
    setMsg(null);
    try {
      await apiFetch("/notes", {
        method: "POST",
        body: JSON.stringify({
          entityType: formEntityType,
          customerId: formEntityType === "CUSTOMER" ? formCustomerId : undefined,
          contactId: formEntityType === "CONTACT" ? formContactId : undefined,
          projectId: formProjectId || undefined,
          title: formTitle || undefined,
          content: formContent,
          isPhoneNote: formIsPhone,
        }),
      });
      setMsg(l("notes.saved"));
      setShowForm(false);
      setFormContent("");
      setFormTitle("");
      setFormProjectId("");
      setFormIsPhone(false);
      await load();
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  async function updateNote(id: string, data: { title?: string; content: string; isPhoneNote?: boolean; projectId?: string | null }) {
    await apiFetch(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    await load();
    const refreshed = await apiFetch<NoteItem>(`/notes/${id}`);
    setSelectedNote(refreshed);
  }

  async function deleteNote(id: string) {
    await apiFetch(`/notes/${id}`, { method: "DELETE" }).catch(() => {});
    setSelectedNote(null);
    await load();
  }

  return (
    <div className="grid gap-6">
      <SectionCard title={l("notes.title")} subtitle={l("notes.title")}>
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input type="text" placeholder={l("notes.search")} value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900" />
          <SelectField label={l("notes.entity")} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value as typeof entityFilter)}
            options={[{ value: "", label: l("notes.all") }, { value: "CUSTOMER", label: l("notes.customer") }, { value: "CONTACT", label: l("notes.contact") }]} />
          <SelectField label={l("notes.customer")} value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setContactFilter(""); setProjectFilter(""); }}
            options={[{ value: "", label: l("notes.all") }, ...customers.map((c) => ({ value: c.id, label: c.companyName }))]} />
          <SelectField label={l("notes.filterContact")} value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}
            options={[{ value: "", label: l("notes.allContacts") }, ...filterContacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))]} />
          <SelectField label={l("notes.project")} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
            options={[{ value: "", label: l("notes.all") }, ...filterProjects.map((project) => ({ value: project.id, label: `${project.projectNumber} - ${project.title}` }))]} />
          <SelectField label={l("notes.phoneNoteFilter")} value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value as typeof phoneFilter)}
            options={[{ value: "", label: l("notes.all") }, { value: "true", label: l("notes.phoneOnly") }, { value: "false", label: l("notes.normalOnly") }]} />
          <SelectField label={l("notes.sort")} value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
            options={[{ value: "desc", label: l("notes.sortNewest") }, { value: "asc", label: l("notes.sortOldest") }, { value: "customer", label: l("notes.sortCustomer") }]} />
          <SecondaryButton onClick={() => { setShowForm(true); setFormIsPhone(true); }}>
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
              </svg>
              {l("notes.startPhoneNote")}
            </span>
          </SecondaryButton>
          <SecondaryButton onClick={() => setShowForm(!showForm)}>{showForm ? l("notes.cancel") : l("notes.new")}</SecondaryButton>
        </div>

        {msg ? <MessageBar error={null} success={msg} /> : null}

        {/* New note form */}
        {showForm ? (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
            <h4 className="mb-3 text-sm font-semibold">{l("notes.new")}</h4>
            <div className="grid gap-3">
              <FormRow>
                <SelectField label={l("notes.entity")} value={formEntityType} onChange={(e) => { setFormEntityType(e.target.value as "CUSTOMER" | "CONTACT"); setFormContactId(""); }}
                  options={[{ value: "CUSTOMER", label: l("notes.customer") }, { value: "CONTACT", label: l("notes.contact") }]} />
                <SelectField label={l("notes.customer")} value={formCustomerId} onChange={(e) => { setFormCustomerId(e.target.value); setFormContactId(""); setFormProjectId(""); }}
                  options={[{ value: "", label: l("notes.selectCustomer") }, ...customers.map((c) => ({ value: c.id, label: c.companyName }))]} />
              </FormRow>
              {formEntityType === "CONTACT" && formCustomerId ? (
                <SelectField label={l("notes.contact")} value={formContactId} onChange={(e) => setFormContactId(e.target.value)}
                  options={[{ value: "", label: l("notes.selectContact") }, ...formContacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))]} />
              ) : null}
              <div className="grid gap-2">
                <label className="text-sm font-medium">{l("notes.projectOptional")}</label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <option value="">{l("notes.selectProjectOptional")}</option>
                  {formProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectNumber} - {project.title}
                    </option>
                  ))}
                </select>
              </div>
              <Field label={l("doc.title")} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
              <TextArea label={l("notes.content")} value={formContent} onChange={(e) => setFormContent(e.target.value)} />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formIsPhone} onChange={(e) => setFormIsPhone(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600" />
                  {l("notes.phoneNote")}
                </label>
                <SpeechButton lang={notesLang} l={l} onAppend={(text) => setFormContent((prev) => appendSpeechTranscript(prev, text, notesLang))} />
              </div>
              <SecondaryButton onClick={() => void saveNote()}>{l("notes.save")}</SecondaryButton>
            </div>
          </div>
        ) : null}

        {/* Notes list */}
        {loading ? <p className="text-sm text-slate-500">{l("notes.loading")}</p> : notes.length === 0 ? (
          <p className="text-sm text-slate-500">{l("notes.none")}</p>
        ) : (
          <div className="grid gap-3">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setSelectedNote(note)}
                className="w-full rounded-xl border border-black/10 bg-white/60 p-4 text-left transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {note.title ? <div className="font-semibold">{note.title}</div> : null}
                    <MarkdownContent content={note.content} className="mt-1 text-sm text-slate-600 dark:text-slate-400 line-clamp-2" clamp />
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{new Date(note.createdAt).toLocaleString(notesLocale)}</span>
                      {note.customer ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">{l("notes.customer")}: {note.customer.companyName}</span> : null}
                      {note.contact ? <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">{l("notes.contact")}: {note.contact.firstName} {note.contact.lastName}</span> : null}
                      {note.project ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">{l("notes.project")}: {note.project.projectNumber}</span> : null}
                      {note.createdBy ? <span>{l("notes.createdBy")}: {note.createdBy.displayName}</span> : null}
                    </div>
                  </div>
                  {note.isPhoneNote ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                      {l("notes.phoneNote")}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedNote ? (
        <NoteDetailModal
          note={selectedNote}
          availableProjects={selectedNote.customerId ? projects.filter((project) => project.customerId === selectedNote.customerId) : projects}
          apiFetch={apiFetch}
          onClose={() => setSelectedNote(null)}
          onSave={updateNote}
          onDelete={deleteNote}
        />
      ) : null}
    </div>
  );
}

// ── Hilfsfunktionen ──────────────────────────────────

function PopupFrame({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pb-12 pt-12"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-3xl border-2 border-red-300 bg-white p-4 shadow-xl dark:border-red-500/40 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}



function hasRole(auth: AuthState | null, roles: string[]) {
  return roles.some((role) => auth?.user.roles.includes(role));
}

function hasPermission(auth: AuthState | null, code: string) {
  // Notfall-/Break-Glass-Token traegt "*" als Wildcard und deckt damit jede
  // einzelne Permission im UI-Gating ab (parallel zur PermissionsGuard auf
  // dem Server).
  if (auth?.user.permissions?.includes("*")) return true;
  return Boolean(auth?.user.permissions?.includes(code));
}

function ClockBadge({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const currentDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(now),
    [locale, now],
  );
  return (
    <div className="rounded-xl border border-black/10 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
      {currentDateTime}
    </div>
  );
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

/**
 * Projektformular-Body (anlegen/bearbeiten). Strukturiert in:
 *  - Basisdaten (immer sichtbar): Nummer, Titel, Kunde+Niederlassung, Status,
 *    Leistungsart und Baustellenadresse.
 *  - Plan/Zeitraum (einklappbar): Start, Ende, Unterkunft, Prioritaet.
 *  - Preise (einklappbar): Wochenpauschale, Inklusivstunden, Stundensaetze.
 *  - Beschreibung & Notizen (einklappbar): Freitext.
 *
 * Beim Bearbeiten klappen Bereiche, die bereits Daten enthalten, automatisch
 * auf, damit nichts versehentlich versteckt bleibt.
 */
function ProjectFormFields({
  form,
  setForm,
  customers,
  l,
}: {
  form: ProjectFormState;
  setForm: Dispatch<SetStateAction<ProjectFormState>>;
  customers: Customer[];
  l: (key: string) => string;
}) {
  const hasSchedule = !!(form.plannedStartDate || form.plannedEndDate || form.accommodationAddress || (form.priority && form.priority !== 0));
  const hasPricing = !!(form.weeklyFlatRate || form.includedHoursPerWeek || form.hourlyRateUpTo40h || form.overtimeRate);
  const hasNotes = !!(form.description || form.notes);

  const [scheduleOpen, setScheduleOpen] = useState<boolean>(hasSchedule);
  const [pricesOpen, setPricesOpen] = useState<boolean>(hasPricing);
  const [notesOpen, setNotesOpen] = useState<boolean>(hasNotes);

  const branchOptions = [
    { value: "", label: "-" },
    ...availableBranches(customers, form.customerId).map((branch) => ({
      value: branch.id ?? branch.name,
      label: branch.name,
    })),
  ];

  return (
    <div className="grid gap-4">
      {/* ── Basisdaten ───────────────────────── */}
      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <h3 className="mb-3 text-base font-semibold">{l("proj.basics")}</h3>
        <div className="grid gap-3">
          <FormRow>
            <Field
              label={l("proj.number")}
              value={form.projectNumber}
              onChange={(event) => setForm((c) => ({ ...c, projectNumber: event.target.value }))}
            />
            <Field
              label={l("doc.title")}
              value={form.title}
              onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
            />
          </FormRow>
          <FormRow>
            <SelectField
              label={l("proj.customer")}
              value={form.customerId}
              onChange={(event) => setForm((c) => ({ ...c, customerId: event.target.value, branchId: "" }))}
              options={customers.map((customer) => ({
                value: customer.id,
                label: `${customer.companyName} (${customer.customerNumber})`,
              }))}
            />
            <SelectField
              label={l("cust.branches")}
              value={form.branchId}
              onChange={(event) => setForm((c) => ({ ...c, branchId: event.target.value }))}
              options={branchOptions}
            />
          </FormRow>
          <FormRow>
            <SelectField
              label={l("proj.status")}
              value={form.status}
              onChange={(event) => setForm((c) => ({ ...c, status: event.target.value }))}
              options={[
                { value: "DRAFT", label: l("status.DRAFT") },
                { value: "PLANNED", label: l("status.PLANNED") },
                { value: "ACTIVE", label: l("status.ACTIVE") },
                { value: "PAUSED", label: l("status.PAUSED") },
                { value: "COMPLETED", label: l("status.COMPLETED") },
                { value: "CANCELED", label: l("status.CANCELED") },
              ]}
            />
            <SelectField
              label={l("proj.serviceType")}
              value={form.serviceType}
              onChange={(event) => setForm((c) => ({ ...c, serviceType: event.target.value }))}
              options={[
                { value: "VIDEO", label: l("proj.serviceVideo") },
                { value: "ELECTRICAL", label: l("proj.serviceElectrical") },
                { value: "SERVICE", label: l("proj.serviceService") },
                { value: "OTHER", label: l("proj.serviceOther") },
              ]}
            />
          </FormRow>
          <h4 className="mt-2 text-sm font-semibold uppercase tracking-wider text-slate-500">{l("proj.siteAddress")}</h4>
          <FormRow>
            <Field
              label={l("proj.site")}
              value={form.siteName}
              onChange={(event) => setForm((c) => ({ ...c, siteName: event.target.value }))}
            />
            <Field
              label={l("work.address")}
              value={form.siteAddressLine1}
              onChange={(event) => setForm((c) => ({ ...c, siteAddressLine1: event.target.value }))}
            />
          </FormRow>
          <FormRow>
            <Field
              label={l("work.postalCode")}
              value={form.sitePostalCode}
              onChange={(event) => setForm((c) => ({ ...c, sitePostalCode: event.target.value }))}
            />
            <Field
              label={l("work.city")}
              value={form.siteCity}
              onChange={(event) => setForm((c) => ({ ...c, siteCity: event.target.value }))}
            />
          </FormRow>
          <FormRow>
            <Field
              label={l("work.country")}
              value={form.siteCountry}
              onChange={(event) => setForm((c) => ({ ...c, siteCountry: event.target.value }))}
            />
            <div />
          </FormRow>
        </div>
      </section>

      {/* ── Plan und Zeitraum ────────────────── */}
      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => setScheduleOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-base font-semibold">{l("proj.scheduleAndExtras")}</h3>
            <p className="text-xs text-slate-500">{l("proj.scheduleHint")}</p>
          </div>
          <CollapseIndicator open={scheduleOpen} />
        </button>
        <CollapsibleContent open={scheduleOpen}>
          <div className="grid gap-3">
            <FormRow>
              <Field
                label={l("proj.startDate")}
                type="date"
                value={form.plannedStartDate}
                onChange={(event) => setForm((c) => ({ ...c, plannedStartDate: event.target.value }))}
              />
              <Field
                label={l("proj.endDate")}
                type="date"
                value={form.plannedEndDate}
                onChange={(event) => setForm((c) => ({ ...c, plannedEndDate: event.target.value }))}
              />
            </FormRow>
            <FormRow>
              <Field
                label={l("proj.accommodation")}
                value={form.accommodationAddress}
                onChange={(event) => setForm((c) => ({ ...c, accommodationAddress: event.target.value }))}
              />
              <Field
                label={l("proj.priority")}
                value={String(form.priority ?? 0)}
                onChange={(event) => setForm((c) => ({ ...c, priority: Number(event.target.value) || 0 }))}
              />
            </FormRow>
          </div>
        </CollapsibleContent>
      </section>

      {/* ── Preise ───────────────────────────── */}
      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => setPricesOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-base font-semibold">{l("proj.priceSection")}</h3>
            <p className="text-xs text-slate-500">{l("proj.priceSectionHint")}</p>
          </div>
          <CollapseIndicator open={pricesOpen} />
        </button>
        <CollapsibleContent open={pricesOpen}>
          <div className="grid gap-3">
            <FormRow>
              <Field
                label={l("proj.weeklyFlatRate")}
                value={form.weeklyFlatRate}
                onChange={(event) => setForm((c) => ({ ...c, weeklyFlatRate: event.target.value }))}
              />
              <Field
                label={l("proj.includedHours")}
                value={form.includedHoursPerWeek}
                onChange={(event) => setForm((c) => ({ ...c, includedHoursPerWeek: event.target.value }))}
              />
            </FormRow>
            <FormRow>
              <Field
                label={l("proj.hourlyRate")}
                value={form.hourlyRateUpTo40h}
                onChange={(event) => setForm((c) => ({ ...c, hourlyRateUpTo40h: event.target.value }))}
              />
              <Field
                label={l("proj.overtimeRate")}
                value={form.overtimeRate}
                onChange={(event) => setForm((c) => ({ ...c, overtimeRate: event.target.value }))}
              />
            </FormRow>
          </div>
        </CollapsibleContent>
      </section>

      {/* ── Beschreibung und Notizen ─────────── */}
      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h3 className="text-base font-semibold">{l("proj.descriptionSection")}</h3>
          <CollapseIndicator open={notesOpen} />
        </button>
        <CollapsibleContent open={notesOpen}>
          <div className="grid gap-3">
            <TextArea
              label={l("proj.description")}
              value={form.description}
              onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            />
            <TextArea
              label={l("proj.notes")}
              value={form.notes}
              onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
            />
          </div>
        </CollapsibleContent>
      </section>
    </div>
  );
}
