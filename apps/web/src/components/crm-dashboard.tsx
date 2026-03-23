"use client";

import {
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BriefcaseBusiness,
  Clock3,
  FileText,
  FileSignature,
  HardHat,
  LayoutDashboard,
  Mail,
  Users,
} from "lucide-react";
import { SignaturePad } from "./signature-pad";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "../lib/utils";

type Summary = {
  customers: number;
  projects: number;
  workers: number;
  openTimesheets: number;
};

type AuthState = {
  accessToken: string;
  type: "user" | "worker";
  roles: string[];
  label: string;
  workerId?: string;
};

type Customer = {
  id: string;
  customerNumber: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  branches: CustomerBranch[];
  contacts: CustomerContact[];
};

type CustomerBranch = {
  id?: string;
  name: string;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
  active?: boolean;
};

type CustomerContact = {
  id?: string;
  branchId?: string | null;
  branchName?: string;
  firstName: string;
  lastName: string;
  role?: string | null;
  email?: string | null;
  phoneMobile?: string | null;
  phoneLandline?: string | null;
  isAccountingContact?: boolean;
  isProjectContact?: boolean;
  isSignatory?: boolean;
  notes?: string | null;
};

type Project = {
  id: string;
  projectNumber: string;
  title: string;
  status: string;
  customerId?: string;
  siteCity?: string | null;
  siteCountry?: string | null;
  customer?: {
    companyName: string;
  } | null;
};

type Worker = {
  id: string;
  workerNumber: string;
  firstName: string;
  lastName: string;
  active: boolean;
  email?: string | null;
  phone?: string | null;
};

type TimeEntry = {
  id: string;
  entryType: string;
  occurredAtServer: string;
  project?: {
    title: string;
  } | null;
};

type Timesheet = {
  id: string;
  weekYear: number;
  weekNumber: number;
  totalMinutesNet: number;
  status: string;
  worker?: {
    firstName: string;
    lastName: string;
  } | null;
  project?: {
    title: string;
  } | null;
};

type DocumentItem = {
  id: string;
  originalFilename: string;
  documentType: string;
  createdAt: string;
  title?: string | null;
  description?: string | null;
  links: Array<{
    entityType: string;
    entityId: string;
  }>;
};

type CustomerFormState = {
  customerNumber: string;
  companyName: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  addressLine1: string;
  notes: string;
  branches: Array<{
    name: string;
    city: string;
    phone: string;
    email: string;
  }>;
  contacts: Array<{
    firstName: string;
    lastName: string;
    role: string;
    email: string;
    phoneMobile: string;
    branchName: string;
  }>;
};

const apiBase =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3801";

const inputClass =
  "h-11 rounded-xl border border-black/10 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50";

export function CrmDashboard() {
  const emptyCustomerForm: CustomerFormState = {
    customerNumber: "",
    companyName: "",
    city: "",
    country: "DE",
    email: "",
    phone: "",
    addressLine1: "",
    notes: "",
    branches: [],
    contacts: [],
  };
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [status, setStatus] = useState<string>("Bereit");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [login, setLogin] = useState({ email: "admin@example.local", password: "admin12345" });
  const [pinLogin, setPinLogin] = useState({ workerNumber: "M-1000", pin: "1234" });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [projectForm, setProjectForm] = useState({
    projectNumber: "",
    title: "",
    customerId: "",
    siteCity: "",
    siteCountry: "DE",
    serviceType: "VIDEO",
    status: "ACTIVE",
  });
  const [workerForm, setWorkerForm] = useState({
    workerNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    pin: "",
  });
  const [clockForm, setClockForm] = useState({
    workerId: "",
    projectId: "",
    latitude: "52.52",
    longitude: "13.405",
    sourceDevice: "web",
  });
  const [timesheetForm, setTimesheetForm] = useState(() => {
    const now = new Date();
    return {
      workerId: "",
      projectId: "",
      weekYear: String(now.getFullYear()),
      weekNumber: String(getIsoWeek(now)),
    };
  });
  const [signatureForm, setSignatureForm] = useState({
    timesheetId: "",
    signerName: "",
    signerRole: "",
    signerType: "worker",
    signatureImagePath: "",
  });
  const [documentForm, setDocumentForm] = useState({
    projectId: "",
    documentType: "project_file",
    title: "",
    description: "",
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [mailForm, setMailForm] = useState({
    timesheetId: "",
    recipient: "",
    subject: "",
    message: "",
  });

  const canManage = useMemo(
    () =>
      Boolean(
        auth?.roles.some((role) =>
          ["SUPERADMIN", "OFFICE", "PROJECT_MANAGER"].includes(role),
        ),
      ),
    [auth],
  );

  const canTrackTime = Boolean(auth);

  async function apiFetch<T>(
    path: string,
    init?: RequestInit,
    authOverride?: AuthState | null,
  ): Promise<T> {
    const headers = new Headers(init?.headers);

    headers.set("Content-Type", "application/json");

    const activeAuth = authOverride ?? auth;

    if (activeAuth?.accessToken) {
      headers.set("Authorization", `Bearer ${activeAuth.accessToken}`);
    }

    const response = await fetch(`${apiBase}/api${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async function apiUpload<T>(path: string, body: FormData): Promise<T> {
    const headers = new Headers();

    if (auth?.accessToken) {
      headers.set("Authorization", `Bearer ${auth.accessToken}`);
    }

    const response = await fetch(`${apiBase}/api${path}`, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async function apiBlob(path: string): Promise<Blob> {
    const headers = new Headers();

    if (auth?.accessToken) {
      headers.set("Authorization", `Bearer ${auth.accessToken}`);
    }

    const response = await fetch(`${apiBase}/api${path}`, {
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    return response.blob();
  }

  async function loadData(currentAuth = auth) {
    if (!currentAuth) {
      return;
    }

    try {
      if (currentAuth.type === "user") {
        const [dashboardData, customerData, projectData, workerData, timesheetData] =
          await Promise.all([
            apiFetch<Summary>("/dashboard/summary", undefined, currentAuth),
            apiFetch<Customer[]>("/customers", undefined, currentAuth),
            apiFetch<Project[]>("/projects", undefined, currentAuth),
            apiFetch<Worker[]>("/workers", undefined, currentAuth),
            apiFetch<Timesheet[]>("/timesheets/weekly", undefined, currentAuth),
          ]);
        const documentData = await apiFetch<DocumentItem[]>(
          "/documents",
          undefined,
          currentAuth,
        );

        setSummary(dashboardData);
        setCustomers(customerData);
        setProjects(projectData);
        setWorkers(workerData);
        setTimesheets(timesheetData);
        setDocuments(documentData);
      } else {
        const [entryData, timesheetData] = await Promise.all([
          apiFetch<TimeEntry[]>(
            `/time/my-entries?workerId=${currentAuth.workerId ?? ""}`,
            undefined,
            currentAuth,
          ),
          apiFetch<Timesheet[]>(
            `/timesheets/weekly?workerId=${currentAuth.workerId ?? ""}`,
            undefined,
            currentAuth,
          ),
        ]);

        setSummary(null);
        setCustomers([]);
        setWorkers([]);
        setEntries(entryData);
        setTimesheets(timesheetData);
        setDocuments([]);
      }

      setStatus("Daten geladen");
    } catch (error) {
      setStatus(
        error instanceof Error ? `Fehler beim Laden: ${error.message}` : "Unbekannter Fehler",
      );
    }
  }

  function resetCustomerForm() {
    setEditingCustomerId(null);
    setCustomerForm(emptyCustomerForm);
  }

  function resetProjectForm() {
    setEditingProjectId(null);
    setProjectForm({
      projectNumber: "",
      title: "",
      customerId: customers[0]?.id ?? "",
      siteCity: "",
      siteCountry: "DE",
      serviceType: "VIDEO",
      status: "ACTIVE",
    });
  }

  function resetWorkerForm() {
    setEditingWorkerId(null);
    setWorkerForm({
      workerNumber: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      pin: "",
    });
  }

  function resetDocumentForm() {
    setEditingDocumentId(null);
    setDocumentFile(null);
    setDocumentForm({
      projectId: "",
      documentType: "project_file",
      title: "",
      description: "",
    });
  }

  function startEditCustomer(customer: Customer) {
    setEditingCustomerId(customer.id);
    setCustomerForm({
      customerNumber: customer.customerNumber,
      companyName: customer.companyName,
      city: customer.city ?? "",
      country: customer.country ?? "DE",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      addressLine1: customer.addressLine1 ?? "",
      notes: customer.notes ?? "",
      branches: customer.branches.map((branch) => ({
        name: branch.name,
        city: branch.city ?? "",
        phone: branch.phone ?? "",
        email: branch.email ?? "",
      })),
      contacts: customer.contacts.map((contact) => ({
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: contact.role ?? "",
        email: contact.email ?? "",
        phoneMobile: contact.phoneMobile ?? "",
        branchName:
          customer.branches.find((branch) => branch.id === contact.branchId)?.name ??
          "",
      })),
    });
  }

  function startEditProject(project: Project) {
    setEditingProjectId(project.id);
    setProjectForm({
      projectNumber: project.projectNumber,
      title: project.title,
      customerId: project.customerId ?? "",
      siteCity: project.siteCity ?? "",
      siteCountry: project.siteCountry ?? "DE",
      serviceType: "VIDEO",
      status: project.status,
    });
  }

  function startEditWorker(worker: Worker) {
    setEditingWorkerId(worker.id);
    setWorkerForm({
      workerNumber: worker.workerNumber,
      firstName: worker.firstName,
      lastName: worker.lastName,
      email: worker.email ?? "",
      phone: worker.phone ?? "",
      pin: "",
    });
  }

  function startEditDocument(document: DocumentItem) {
    setEditingDocumentId(document.id);
    setDocumentForm({
      projectId:
        document.links.find((link) => link.entityType === "project")?.entityId ?? "",
      documentType: document.documentType,
      title: document.title ?? "",
      description: document.description ?? "",
    });
    setDocumentFile(null);
  }

  function addBranch() {
    setCustomerForm((current) => ({
      ...current,
      branches: [
        ...current.branches,
        { name: "", city: "", phone: "", email: "" },
      ],
    }));
  }

  function updateBranch(
    index: number,
    field: "name" | "city" | "phone" | "email",
    value: string,
  ) {
    setCustomerForm((current) => ({
      ...current,
      branches: current.branches.map((branch, branchIndex) =>
        branchIndex === index ? { ...branch, [field]: value } : branch,
      ),
    }));
  }

  function removeBranch(index: number) {
    setCustomerForm((current) => ({
      ...current,
      branches: current.branches.filter((_, branchIndex) => branchIndex !== index),
    }));
  }

  function addContact() {
    setCustomerForm((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        {
          firstName: "",
          lastName: "",
          role: "",
          email: "",
          phoneMobile: "",
          branchName: "",
        },
      ],
    }));
  }

  function updateContact(
    index: number,
    field:
      | "firstName"
      | "lastName"
      | "role"
      | "email"
      | "phoneMobile"
      | "branchName",
    value: string,
  ) {
    setCustomerForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [field]: value } : contact,
      ),
    }));
  }

  function removeContact(index: number) {
    setCustomerForm((current) => ({
      ...current,
      contacts: current.contacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  }

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const result = await apiFetch<{
        accessToken: string;
        user: { displayName: string; roles: string[] };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(login),
      });

      const nextAuth: AuthState = {
        accessToken: result.accessToken,
        type: "user",
        roles: result.user.roles,
        label: result.user.displayName,
      };

      setAuth(nextAuth);
      setStatus("Admin eingeloggt");
      await loadData(nextAuth);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login fehlgeschlagen");
    }
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const result = await apiFetch<{
        accessToken: string;
        worker: { id: string; name: string };
        projects: Project[];
      }>("/auth/pin-login", {
        method: "POST",
        body: JSON.stringify(pinLogin),
      });

      const nextAuth: AuthState = {
        accessToken: result.accessToken,
        type: "worker",
        roles: ["WORKER"],
        label: result.worker.name,
        workerId: result.worker.id,
      };

      setAuth(nextAuth);
      setClockForm((previous) => ({
        ...previous,
        workerId: result.worker.id,
        projectId: result.projects[0]?.id ?? "",
      }));
      setTimesheetForm((previous) => ({
        ...previous,
        workerId: result.worker.id,
        projectId: result.projects[0]?.id ?? "",
      }));
      setProjects(result.projects);
      setStatus("Monteur eingeloggt");
      await loadData(nextAuth);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PIN-Login fehlgeschlagen");
    }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(editingCustomerId ? `/customers/${editingCustomerId}` : "/customers", {
      method: editingCustomerId ? "PATCH" : "POST",
      body: JSON.stringify({
        customerNumber: customerForm.customerNumber,
        companyName: customerForm.companyName,
        city: customerForm.city,
        country: customerForm.country,
        email: customerForm.email || undefined,
        phone: customerForm.phone || undefined,
        addressLine1: customerForm.addressLine1 || undefined,
        notes: customerForm.notes || undefined,
        branches: customerForm.branches
          .filter((branch) => branch.name.trim().length > 0)
          .map((branch) => ({
            name: branch.name,
            city: branch.city || undefined,
            phone: branch.phone || undefined,
            email: branch.email || undefined,
          })),
        contacts: customerForm.contacts
          .filter(
            (contact) =>
              contact.firstName.trim().length > 0 &&
              contact.lastName.trim().length > 0,
          )
          .map((contact) => ({
            firstName: contact.firstName,
            lastName: contact.lastName,
            role: contact.role || undefined,
            email: contact.email || undefined,
            phoneMobile: contact.phoneMobile || undefined,
            branchName: contact.branchName || undefined,
          })),
      }),
    });
    resetCustomerForm();
    await loadData();
    setStatus(editingCustomerId ? "Kunde aktualisiert" : "Kunde angelegt");
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(editingProjectId ? `/projects/${editingProjectId}` : "/projects", {
      method: editingProjectId ? "PATCH" : "POST",
      body: JSON.stringify(projectForm),
    });
    resetProjectForm();
    await loadData();
    setStatus(editingProjectId ? "Projekt aktualisiert" : "Projekt angelegt");
  }

  async function submitWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(editingWorkerId ? `/workers/${editingWorkerId}` : "/workers", {
      method: editingWorkerId ? "PATCH" : "POST",
      body: JSON.stringify({
        ...workerForm,
        pin: workerForm.pin || undefined,
      }),
    });
    resetWorkerForm();
    await loadData();
    setStatus(editingWorkerId ? "Monteur aktualisiert" : "Monteur angelegt");
  }

  async function submitClock(mode: "clock-in" | "clock-out") {
    await apiFetch(`/time/${mode}`, {
      method: "POST",
      body: JSON.stringify({
        ...clockForm,
        latitude: Number(clockForm.latitude),
        longitude: Number(clockForm.longitude),
      }),
    });

    if (auth?.type === "user" && clockForm.workerId) {
      const recentEntries = await apiFetch<TimeEntry[]>(
        `/time/my-entries?workerId=${clockForm.workerId}`,
      );
      setEntries(recentEntries);
    }

    await loadData();
    setStatus(mode === "clock-in" ? "Eingestempelt" : "Ausgestempelt");
  }

  async function submitTimesheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/timesheets/weekly", {
      method: "POST",
      body: JSON.stringify({
        ...timesheetForm,
        weekYear: Number(timesheetForm.weekYear),
        weekNumber: Number(timesheetForm.weekNumber),
      }),
    });
    await loadData();
    setStatus("Wochenzettel generiert");
  }

  async function submitSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signatureForm.signatureImagePath) {
      setStatus("Bitte zuerst eine Signatur zeichnen.");
      return;
    }

    const endpoint =
      signatureForm.signerType === "customer" ? "customer-sign" : "worker-sign";

    await apiFetch(`/timesheets/${signatureForm.timesheetId}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({
        signerName: signatureForm.signerName,
        signerRole: signatureForm.signerRole,
        signatureImagePath: signatureForm.signatureImagePath,
        deviceInfo: "next-web",
      }),
    });

    await loadData();
    setStatus("Signatur gespeichert");
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingDocumentId) {
      await apiFetch(`/documents/${editingDocumentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          documentType: documentForm.documentType,
          title: documentForm.title,
          description: documentForm.description || undefined,
        }),
      });
      resetDocumentForm();
      await loadData();
      setStatus("Dokument aktualisiert");
      return;
    }

    if (!documentFile || !documentForm.projectId) {
      setStatus("Bitte Projekt und Datei fuer den Upload waehlen.");
      return;
    }

    const body = new FormData();
    body.append("file", documentFile);
    body.append("documentType", documentForm.documentType);
    body.append("title", documentForm.title || documentFile.name);
    body.append("description", documentForm.description || "");
    body.append("entityType", "project");
    body.append("entityId", documentForm.projectId);

    await apiUpload("/documents/upload", body);
    resetDocumentForm();
    await loadData();
    setStatus("Dokument hochgeladen");
  }

  async function deleteCustomer(id: string) {
    await apiFetch(`/customers/${id}`, { method: "DELETE" });
    if (editingCustomerId === id) {
      resetCustomerForm();
    }
    await loadData();
    setStatus("Kunde geloescht");
  }

  async function deleteProject(id: string) {
    await apiFetch(`/projects/${id}`, { method: "DELETE" });
    if (editingProjectId === id) {
      resetProjectForm();
    }
    await loadData();
    setStatus("Projekt geloescht");
  }

  async function deleteWorker(id: string) {
    await apiFetch(`/workers/${id}`, { method: "DELETE" });
    if (editingWorkerId === id) {
      resetWorkerForm();
    }
    await loadData();
    setStatus("Monteur deaktiviert");
  }

  async function deleteDocument(id: string) {
    await apiFetch(`/documents/${id}`, { method: "DELETE" });
    if (editingDocumentId === id) {
      resetDocumentForm();
    }
    await loadData();
    setStatus("Dokument geloescht");
  }

  async function downloadDocument(documentId: string, filename: string) {
    const blob = await apiBlob(`/documents/${documentId}/download`);
    triggerDownload(blob, filename);
  }

  async function downloadTimesheetPdf() {
    if (!mailForm.timesheetId) {
      setStatus("Bitte zuerst einen Wochenzettel auswaehlen.");
      return;
    }

    const blob = await apiBlob(`/timesheets/${mailForm.timesheetId}/pdf`);
    triggerDownload(blob, `wochenzettel-${mailForm.timesheetId}.pdf`);
  }

  async function sendTimesheetEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!mailForm.timesheetId || !mailForm.recipient) {
      setStatus("Bitte Wochenzettel und Empfaenger angeben.");
      return;
    }

    await apiFetch(`/timesheets/${mailForm.timesheetId}/send-email`, {
      method: "POST",
      body: JSON.stringify({
        recipients: [mailForm.recipient],
        subject: mailForm.subject || undefined,
        message: mailForm.message || undefined,
      }),
    });

    setStatus("E-Mail verarbeitet");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,#0f172a,transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">
                CRM Monteur Plattform
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                CRM, Projekte, Monteure, Zeiterfassung und Wochenzettel
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                MVP-Oberflaeche fuer Admins und Monteure mit JWT-Login, PIN-Flow,
                Projektdaten, Zeitbuchungen und Signatur-Workflow.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-white dark:bg-slate-100 dark:text-slate-950">
              API: {apiBase}
            </span>
            <span>Status: {status}</span>
            {auth ? (
              <span>
                Eingeloggt als <strong>{auth.label}</strong>
              </span>
            ) : (
              <span>Demo-Zugang: `admin@example.local / admin12345` oder `M-1000 / 1234`</span>
            )}
          </div>
        </header>

        {!auth ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <LoginCard
              title="Admin Login"
              onSubmit={handleAdminLogin}
              fields={
                <>
                  <input
                    className={inputClass}
                    suppressHydrationWarning
                    value={login.email}
                    onChange={(event) =>
                      setLogin((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="E-Mail"
                  />
                  <input
                    className={inputClass}
                    suppressHydrationWarning
                    type="password"
                    value={login.password}
                    onChange={(event) =>
                      setLogin((current) => ({ ...current, password: event.target.value }))
                    }
                    placeholder="Passwort"
                  />
                </>
              }
            />
            <LoginCard
              title="Monteur PIN Login"
              onSubmit={handlePinLogin}
              fields={
                <>
                  <input
                    className={inputClass}
                    suppressHydrationWarning
                    value={pinLogin.workerNumber}
                    onChange={(event) =>
                      setPinLogin((current) => ({
                        ...current,
                        workerNumber: event.target.value,
                      }))
                    }
                    placeholder="Monteurnummer"
                  />
                  <input
                    className={inputClass}
                    suppressHydrationWarning
                    type="password"
                    value={pinLogin.pin}
                    onChange={(event) =>
                      setPinLogin((current) => ({ ...current, pin: event.target.value }))
                    }
                    placeholder="PIN"
                  />
                </>
              }
            />
          </section>
        ) : null}

        {auth ? (
          <>
            {summary ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Users} label="Kunden" value={summary.customers} />
                <StatCard icon={BriefcaseBusiness} label="Projekte" value={summary.projects} />
                <StatCard icon={HardHat} label="Monteure" value={summary.workers} />
                <StatCard icon={FileSignature} label="Offene Wochenzettel" value={summary.openTimesheets} />
              </section>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                {canManage ? (
                  <>
                    <SectionCard icon={Users} title="Kunden">
                      <form className="grid gap-3" onSubmit={submitCustomer}>
                        <div className="grid gap-3 md:grid-cols-4">
                          <input
                            className={inputClass}
                            placeholder="Kundennummer"
                            value={customerForm.customerNumber}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                customerNumber: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Firmenname"
                            value={customerForm.companyName}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                companyName: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="E-Mail"
                            value={customerForm.email}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                email: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Telefon"
                            value={customerForm.phone}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                phone: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Adresse"
                            value={customerForm.addressLine1}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                addressLine1: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Stadt"
                            value={customerForm.city}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                city: event.target.value,
                              }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Land"
                            value={customerForm.country}
                            onChange={(event) =>
                              setCustomerForm((current) => ({
                                ...current,
                                country: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <textarea
                          className="min-h-24 rounded-xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                          placeholder="Notizen"
                          value={customerForm.notes}
                          onChange={(event) =>
                            setCustomerForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-medium">Niederlassungen</h3>
                            <button
                              className={secondaryButtonClass}
                              type="button"
                              onClick={addBranch}
                            >
                              Niederlassung hinzufügen
                            </button>
                          </div>
                          <div className="space-y-3">
                            {customerForm.branches.map((branch, index) => (
                              <div
                                key={`branch-${index}`}
                                className="grid gap-3 rounded-2xl border border-black/10 p-3 md:grid-cols-5 dark:border-white/10"
                              >
                                <input
                                  className={inputClass}
                                  placeholder="Name"
                                  value={branch.name}
                                  onChange={(event) =>
                                    updateBranch(index, "name", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="Stadt"
                                  value={branch.city}
                                  onChange={(event) =>
                                    updateBranch(index, "city", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="Telefon"
                                  value={branch.phone}
                                  onChange={(event) =>
                                    updateBranch(index, "phone", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="E-Mail"
                                  value={branch.email}
                                  onChange={(event) =>
                                    updateBranch(index, "email", event.target.value)
                                  }
                                />
                                <button
                                  className={secondaryButtonClass}
                                  type="button"
                                  onClick={() => removeBranch(index)}
                                >
                                  Entfernen
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-medium">Ansprechpartner</h3>
                            <button
                              className={secondaryButtonClass}
                              type="button"
                              onClick={addContact}
                            >
                              Ansprechpartner hinzufügen
                            </button>
                          </div>
                          <div className="space-y-3">
                            {customerForm.contacts.map((contact, index) => (
                              <div
                                key={`contact-${index}`}
                                className="grid gap-3 rounded-2xl border border-black/10 p-3 md:grid-cols-6 dark:border-white/10"
                              >
                                <input
                                  className={inputClass}
                                  placeholder="Vorname"
                                  value={contact.firstName}
                                  onChange={(event) =>
                                    updateContact(index, "firstName", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="Nachname"
                                  value={contact.lastName}
                                  onChange={(event) =>
                                    updateContact(index, "lastName", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="Rolle"
                                  value={contact.role}
                                  onChange={(event) =>
                                    updateContact(index, "role", event.target.value)
                                  }
                                />
                                <input
                                  className={inputClass}
                                  placeholder="E-Mail"
                                  value={contact.email}
                                  onChange={(event) =>
                                    updateContact(index, "email", event.target.value)
                                  }
                                />
                                <select
                                  className={inputClass}
                                  value={contact.branchName}
                                  onChange={(event) =>
                                    updateContact(index, "branchName", event.target.value)
                                  }
                                >
                                  <option value="">Hauptfirma</option>
                                  {customerForm.branches.map((branch) => (
                                    <option key={branch.name} value={branch.name}>
                                      {branch.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className={secondaryButtonClass}
                                  type="button"
                                  onClick={() => removeContact(index)}
                                >
                                  Entfernen
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className={primaryButtonClass} type="submit">
                            {editingCustomerId ? "Kunde speichern" : "Kunde anlegen"}
                          </button>
                          {editingCustomerId ? (
                            <button
                              className={secondaryButtonClass}
                              type="button"
                              onClick={resetCustomerForm}
                            >
                              Abbrechen
                            </button>
                          ) : null}
                        </div>
                      </form>
                      <div className="mt-4 space-y-3">
                        {customers.map((customer) => (
                          <EntityRow
                            key={customer.id}
                            title={`${customer.customerNumber} - ${customer.companyName}`}
                            subtitle={`${customer.city ?? "-"} · ${customer.branches.length} Niederlassungen · ${customer.contacts.length} Ansprechpartner`}
                            onEdit={() => startEditCustomer(customer)}
                            onDelete={() => void deleteCustomer(customer.id)}
                          />
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard icon={BriefcaseBusiness} title="Projekte">
                      <form className="grid gap-3 md:grid-cols-4" onSubmit={submitProject}>
                        <input
                          className={inputClass}
                          placeholder="Projektnummer"
                          value={projectForm.projectNumber}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              projectNumber: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Projekttitel"
                          value={projectForm.title}
                          onChange={(event) =>
                            setProjectForm((current) => ({ ...current, title: event.target.value }))
                          }
                        />
                        <select
                          className={inputClass}
                          value={projectForm.customerId}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              customerId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Kunde waehlen</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.companyName}
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputClass}
                          placeholder="Ort"
                          value={projectForm.siteCity}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              siteCity: event.target.value,
                            }))
                          }
                        />
                        <select
                          className={inputClass}
                          value={projectForm.status}
                          onChange={(event) =>
                            setProjectForm((current) => ({
                              ...current,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="DRAFT">Entwurf</option>
                          <option value="PLANNED">Geplant</option>
                          <option value="ACTIVE">Aktiv</option>
                          <option value="PAUSED">Pausiert</option>
                          <option value="COMPLETED">Abgeschlossen</option>
                          <option value="CANCELED">Storniert</option>
                        </select>
                        <button className={primaryButtonClass} type="submit">
                          {editingProjectId ? "Projekt speichern" : "Projekt anlegen"}
                        </button>
                        {editingProjectId ? (
                          <button
                            className={secondaryButtonClass}
                            type="button"
                            onClick={resetProjectForm}
                          >
                            Abbrechen
                          </button>
                        ) : null}
                      </form>
                      <div className="mt-4 space-y-3">
                        {projects.map((project) => (
                          <EntityRow
                            key={project.id}
                            title={`${project.projectNumber} - ${project.title}`}
                            subtitle={`${project.customer?.companyName ?? "-"} · ${project.status}`}
                            onEdit={() => startEditProject(project)}
                            onDelete={() => void deleteProject(project.id)}
                          />
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard icon={HardHat} title="Monteure">
                      <form className="grid gap-3 md:grid-cols-6" onSubmit={submitWorker}>
                        <input
                          className={inputClass}
                          placeholder="Monteurnummer"
                          value={workerForm.workerNumber}
                          onChange={(event) =>
                            setWorkerForm((current) => ({
                              ...current,
                              workerNumber: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Vorname"
                          value={workerForm.firstName}
                          onChange={(event) =>
                            setWorkerForm((current) => ({
                              ...current,
                              firstName: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Nachname"
                          value={workerForm.lastName}
                          onChange={(event) =>
                            setWorkerForm((current) => ({
                              ...current,
                              lastName: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="E-Mail"
                          value={workerForm.email}
                          onChange={(event) =>
                            setWorkerForm((current) => ({ ...current, email: event.target.value }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Telefon"
                          value={workerForm.phone}
                          onChange={(event) =>
                            setWorkerForm((current) => ({ ...current, phone: event.target.value }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder={editingWorkerId ? "Neuer PIN optional" : "PIN"}
                          value={workerForm.pin}
                          onChange={(event) =>
                            setWorkerForm((current) => ({ ...current, pin: event.target.value }))
                          }
                        />
                        <button className={primaryButtonClass} type="submit">
                          {editingWorkerId ? "Monteur speichern" : "Monteur anlegen"}
                        </button>
                        {editingWorkerId ? (
                          <button
                            className={secondaryButtonClass}
                            type="button"
                            onClick={resetWorkerForm}
                          >
                            Abbrechen
                          </button>
                        ) : null}
                      </form>
                      <div className="mt-4 space-y-3">
                        {workers.map((worker) => (
                          <EntityRow
                            key={worker.id}
                            title={`${worker.workerNumber} - ${worker.firstName} ${worker.lastName}`}
                            subtitle={`${worker.email ?? "-"} · ${worker.active ? "aktiv" : "inaktiv"}`}
                            onEdit={() => startEditWorker(worker)}
                            onDelete={() => void deleteWorker(worker.id)}
                          />
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard icon={FileText} title="Dokumente">
                      <form className="grid gap-3 md:grid-cols-4" onSubmit={submitDocument}>
                        <select
                          className={inputClass}
                          value={documentForm.projectId}
                          onChange={(event) =>
                            setDocumentForm((current) => ({
                              ...current,
                              projectId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Projekt waehlen</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.title}
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputClass}
                          placeholder="Titel"
                          value={documentForm.title}
                          onChange={(event) =>
                            setDocumentForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={inputClass}
                          placeholder="Beschreibung"
                          value={documentForm.description}
                          onChange={(event) =>
                            setDocumentForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                        <input
                          className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-white`}
                          type="file"
                          onChange={(event) =>
                            setDocumentFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <button className={primaryButtonClass} type="submit">
                          {editingDocumentId ? "Dokument speichern" : "Upload"}
                        </button>
                        {editingDocumentId ? (
                          <button
                            className={secondaryButtonClass}
                            type="button"
                            onClick={resetDocumentForm}
                          >
                            Abbrechen
                          </button>
                        ) : null}
                      </form>
                      <div className="mt-4 space-y-3">
                        {documents.length > 0 ? (
                          documents.map((document) => (
                            <div
                              key={document.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/10"
                            >
                              <div>
                                <p className="font-medium">
                                  {document.title || document.originalFilename}
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  {document.originalFilename} ·{" "}
                                  {new Date(document.createdAt).toLocaleString("de-DE")}
                                </p>
                              </div>
                              <button
                                className={secondaryButtonClass}
                                type="button"
                                onClick={() =>
                                  void downloadDocument(
                                    document.id,
                                    document.originalFilename,
                                  )
                                }
                              >
                                Download
                              </button>
                              <button
                                className={secondaryButtonClass}
                                type="button"
                                onClick={() => startEditDocument(document)}
                              >
                                Bearbeiten
                              </button>
                              <button
                                className={secondaryButtonClass}
                                type="button"
                                onClick={() => void deleteDocument(document.id)}
                              >
                                Löschen
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Noch keine Dokumente hochgeladen.
                          </p>
                        )}
                      </div>
                    </SectionCard>
                  </>
                ) : null}

                {canTrackTime ? (
                  <SectionCard icon={Clock3} title="Zeiterfassung">
                    <form
                      className="grid gap-3 md:grid-cols-5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitClock("clock-in");
                      }}
                    >
                      <select
                        className={inputClass}
                        value={clockForm.workerId}
                        onChange={(event) =>
                          setClockForm((current) => ({ ...current, workerId: event.target.value }))
                        }
                        disabled={auth.type === "worker"}
                      >
                        <option value="">Monteur waehlen</option>
                        {workers.map((worker) => (
                          <option key={worker.id} value={worker.id}>
                            {worker.firstName} {worker.lastName}
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={clockForm.projectId}
                        onChange={(event) =>
                          setClockForm((current) => ({
                            ...current,
                            projectId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Projekt waehlen</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        value={clockForm.latitude}
                        onChange={(event) =>
                          setClockForm((current) => ({
                            ...current,
                            latitude: event.target.value,
                          }))
                        }
                        placeholder="Breitengrad"
                      />
                      <input
                        className={inputClass}
                        value={clockForm.longitude}
                        onChange={(event) =>
                          setClockForm((current) => ({
                            ...current,
                            longitude: event.target.value,
                          }))
                        }
                        placeholder="Laengengrad"
                      />
                      <div className="flex gap-2">
                        <button className={primaryButtonClass} type="submit">
                          Clock-In
                        </button>
                        <button
                          className={secondaryButtonClass}
                          type="button"
                          onClick={() => void submitClock("clock-out")}
                        >
                          Clock-Out
                        </button>
                      </div>
                    </form>
                    <SimpleTable
                      rows={entries.map((entry) => [
                        entry.project?.title ?? "-",
                        entry.entryType,
                        new Date(entry.occurredAtServer).toLocaleString("de-DE"),
                      ])}
                      headers={["Projekt", "Typ", "Zeitpunkt"]}
                    />
                  </SectionCard>
                ) : null}
              </div>

              <div className="space-y-6">
                {canManage ? (
                  <SectionCard icon={LayoutDashboard} title="Wochenzettel generieren">
                    <form className="grid gap-3" onSubmit={submitTimesheet}>
                      <select
                        className={inputClass}
                        value={timesheetForm.workerId}
                        onChange={(event) =>
                          setTimesheetForm((current) => ({
                            ...current,
                            workerId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Monteur waehlen</option>
                        {workers.map((worker) => (
                          <option key={worker.id} value={worker.id}>
                            {worker.firstName} {worker.lastName}
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={timesheetForm.projectId}
                        onChange={(event) =>
                          setTimesheetForm((current) => ({
                            ...current,
                            projectId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Projekt waehlen</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          className={inputClass}
                          value={timesheetForm.weekYear}
                          onChange={(event) =>
                            setTimesheetForm((current) => ({
                              ...current,
                              weekYear: event.target.value,
                            }))
                          }
                          placeholder="Jahr"
                        />
                        <input
                          className={inputClass}
                          value={timesheetForm.weekNumber}
                          onChange={(event) =>
                            setTimesheetForm((current) => ({
                              ...current,
                              weekNumber: event.target.value,
                            }))
                          }
                          placeholder="KW"
                        />
                      </div>
                      <button className={primaryButtonClass} type="submit">
                        Wochenzettel erzeugen
                      </button>
                    </form>
                  </SectionCard>
                ) : null}

                <SectionCard icon={FileSignature} title="Signatur">
                  <form className="grid gap-3" onSubmit={submitSignature}>
                    <select
                      className={inputClass}
                      value={signatureForm.timesheetId}
                      onChange={(event) =>
                        setSignatureForm((current) => ({
                          ...current,
                          timesheetId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Wochenzettel waehlen</option>
                      {timesheets.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          KW {sheet.weekNumber}/{sheet.weekYear} - {sheet.project?.title ?? "-"}
                        </option>
                      ))}
                    </select>
                    <select
                      className={inputClass}
                      value={signatureForm.signerType}
                      onChange={(event) =>
                        setSignatureForm((current) => ({
                          ...current,
                          signerType: event.target.value,
                        }))
                      }
                    >
                      <option value="worker">Monteur</option>
                      <option value="customer">Kunde</option>
                    </select>
                    <input
                      className={inputClass}
                      placeholder="Name"
                      value={signatureForm.signerName}
                      onChange={(event) =>
                        setSignatureForm((current) => ({
                          ...current,
                          signerName: event.target.value,
                        }))
                      }
                    />
                    <input
                      className={inputClass}
                      placeholder="Rolle"
                      value={signatureForm.signerRole}
                      onChange={(event) =>
                        setSignatureForm((current) => ({
                          ...current,
                          signerRole: event.target.value,
                        }))
                      }
                    />
                    <SignaturePad
                      onChange={(value) =>
                        setSignatureForm((current) => ({
                          ...current,
                          signatureImagePath: value,
                        }))
                      }
                    />
                    <button className={primaryButtonClass} type="submit">
                      Signatur speichern
                    </button>
                  </form>
                </SectionCard>

                {canManage ? (
                  <SectionCard icon={Mail} title="PDF & E-Mail">
                    <form className="grid gap-3" onSubmit={sendTimesheetEmail}>
                      <select
                        className={inputClass}
                        value={mailForm.timesheetId}
                        onChange={(event) =>
                          setMailForm((current) => ({
                            ...current,
                            timesheetId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Wochenzettel waehlen</option>
                        {timesheets.map((sheet) => (
                          <option key={sheet.id} value={sheet.id}>
                            KW {sheet.weekNumber}/{sheet.weekYear} -{" "}
                            {sheet.project?.title ?? "-"}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        placeholder="Empfaenger E-Mail"
                        value={mailForm.recipient}
                        onChange={(event) =>
                          setMailForm((current) => ({
                            ...current,
                            recipient: event.target.value,
                          }))
                        }
                      />
                      <input
                        className={inputClass}
                        placeholder="Betreff optional"
                        value={mailForm.subject}
                        onChange={(event) =>
                          setMailForm((current) => ({
                            ...current,
                            subject: event.target.value,
                          }))
                        }
                      />
                      <textarea
                        className="min-h-28 rounded-xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                        placeholder="Nachricht optional"
                        value={mailForm.message}
                        onChange={(event) =>
                          setMailForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          className={secondaryButtonClass}
                          type="button"
                          onClick={() => void downloadTimesheetPdf()}
                        >
                          PDF laden
                        </button>
                        <button className={primaryButtonClass} type="submit">
                          E-Mail senden
                        </button>
                      </div>
                    </form>
                  </SectionCard>
                ) : null}

                <SectionCard icon={LayoutDashboard} title="Wochenzettel Liste">
                  <SimpleTable
                    rows={timesheets.map((sheet) => [
                      `${sheet.weekNumber}/${sheet.weekYear}`,
                      sheet.project?.title ?? "-",
                      `${(sheet.totalMinutesNet / 60).toFixed(2)} h`,
                      sheet.status,
                    ])}
                    headers={["KW", "Projekt", "Netto", "Status"]}
                  />
                </SectionCard>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function LoginCard({
  title,
  onSubmit,
  fields,
}: {
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  fields: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
      <h2 className="text-xl font-semibold">{title}</h2>
      <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
        {fields}
        <button className={primaryButtonClass} type="submit">
          Einloggen
        </button>
      </form>
    </section>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-3 text-white dark:bg-slate-100 dark:text-slate-950">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function EntityRow({
  title,
  subtitle,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 dark:border-white/10">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <button className={secondaryButtonClass} type="button" onClick={onEdit}>
          Bearbeiten
        </button>
        <button className={secondaryButtonClass} type="button" onClick={onDelete}>
          Löschen
        </button>
      </div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-black/5 dark:bg-white/5">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr
                key={`${row.join("-")}-${index}`}
                className={cn(
                  "border-t border-black/5 dark:border-white/5",
                  index % 2 === 0 ? "bg-white/60 dark:bg-slate-950/50" : "bg-transparent",
                )}
              >
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-5 text-center text-slate-500 dark:text-slate-400"
              >
                Noch keine Daten vorhanden.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function getIsoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

const primaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-medium text-white transition hover:bg-sky-500";

const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-medium text-slate-700 transition hover:bg-black/5 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5";
