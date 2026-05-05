"use client";

import { ChevronDown, MapPinned } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type MouseEventHandler, type ReactNode, useState } from "react";
import { useI18n } from "../../i18n-context";

// ── Utility-Funktionen ──────────────────────────────────────

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatAddress(parts: Array<string | null | undefined>) {
  return parts.filter((part) => Boolean(part && part.trim())).join(", ");
}

export function mapsUrlFromParts(parts: Array<string | null | undefined>) {
  const query = formatAddress(parts);
  if (!query) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function sanitizeForApi<T>(value: T): T {
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

// ── Kleine UI-Bausteine ─────────────────────────────────────

export function NavLink({
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
          ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-300 dark:bg-slate-200 dark:!text-slate-950"
          : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </Link>
  );
}

export function IconNavLink({
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
        "group relative inline-flex h-11 w-11 items-center justify-center rounded-xl border transition",
        active
          ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-300 dark:bg-slate-200 dark:!text-slate-950"
          : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
      )}
    >
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow transition group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-950">
        {label}
      </span>
    </Link>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
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

export function SectionCard({
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

export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard title={title}>
      <p className="text-sm text-slate-500">{children}</p>
    </SectionCard>
  );
}

export function MessageBar({
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

export function MiniStat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-semibold">{value}</p>
    </div>
  );
}

export function MapLinkButton({ href, children }: { href: string; children: ReactNode }) {
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

export function CollapseIndicator({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={cx(
        "-ml-1 h-5 w-5 shrink-0 stroke-[3] text-emerald-600 transition-transform dark:text-emerald-400",
        open ? "rotate-180" : "rotate-0",
      )}
    />
  );
}

export function CollapsibleContent({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid transition-all duration-300 ease-out",
        open ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cx("min-h-0 overflow-hidden", className)}>
        {children}
      </div>
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
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
          autoComplete={autoComplete}
          placeholder={placeholder}
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

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
      >
        <option value="">{placeholder ?? t("common.selectPlaceholder")}</option>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextArea({
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

// ── Druckfunktion ───────────────────────────────────

export function PrintButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t: tShared } = useI18n();
  const resolvedLabel = label ?? tShared("common.print");
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
      {resolvedLabel}
    </button>
  );
}

export function openPrintWindow(title: string, htmlContent: string) {
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 20px; color: #1e293b; font-size: 13px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  th { font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; }
  .meta { color: #64748b; font-size: 12px; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 16px; }
  .label { color: #64748b; }
  @media print { body { margin: 0; } }
</style></head><body>${htmlContent}</body></html>`);
  win.document.close();
  win.setTimeout(() => { win.print(); }, 300);
}
