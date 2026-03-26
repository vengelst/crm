"use client";

import { type FormEvent, useState } from "react";
import { ThemeToggle } from "../theme-toggle";
import { cx, MessageBar } from "./shared";

export function KioskLoginScreen({
  loginPin, setLoginPin,
  loginEmail, setLoginEmail,
  loginPassword, setLoginPassword,
  submitting, error, success,
  onKioskLogin, onAdminLogin,
}: {
  loginPin: string;
  setLoginPin: (v: string) => void;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onKioskLogin: (e: FormEvent<HTMLFormElement>) => void;
  onAdminLogin: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [showAdmin, setShowAdmin] = useState(false);
  const maxPinLength = 8;

  function addDigit(d: string) {
    if (loginPin.length < maxPinLength) setLoginPin(loginPin + d);
  }

  function removeDigit() {
    setLoginPin(loginPin.slice(0, -1));
  }

  function clearPin() {
    setLoginPin("");
  }

  // Auto-submit bei voller PIN-Länge (optional, hier bei 4+ Stellen + Bestätigungsbutton)
  const pinDots = Array.from({ length: maxPinLength }, (_, i) => i < loginPin.length);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-200">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">CRM Monteur Plattform</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">Kiosk-Anmeldung</h1>
      </div>

      {/* PIN-Bereich */}
      <div className="w-full max-w-sm">
        {/* PIN-Punkte */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {pinDots.map((filled, i) => (
            <div
              key={i}
              className={cx(
                "h-4 w-4 rounded-full border-2 transition-all duration-150",
                filled
                  ? "scale-110 border-emerald-400 bg-emerald-400"
                  : "border-slate-300 bg-transparent dark:border-slate-600",
              )}
            />
          ))}
        </div>

        {/* Fehlermeldung */}
        {error || success ? (
          <div className="mb-4">
            <MessageBar error={error} success={success} />
          </div>
        ) : null}

        {/* Ladeanzeige */}
        {submitting ? (
          <div className="mb-4 text-center text-sm text-emerald-600 dark:text-emerald-400">Anmeldung wird geprueft...</div>
        ) : null}

        {/* Zahlentastatur */}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={submitting}
              onClick={() => addDigit(d)}
              className="flex h-16 items-center justify-center rounded-2xl border border-black/10 bg-white text-2xl font-semibold text-slate-950 shadow-sm transition-all hover:bg-slate-100 active:scale-95 active:bg-slate-200 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 dark:active:bg-slate-700"
            >
              {d}
            </button>
          ))}

          {/* Löschen */}
          <button
            type="button"
            disabled={submitting}
            onClick={clearPin}
            className="flex h-16 items-center justify-center rounded-2xl border border-black/10 bg-slate-200/70 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-200 hover:text-slate-950 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            Loeschen
          </button>

          {/* 0 */}
          <button
            type="button"
            disabled={submitting}
            onClick={() => addDigit("0")}
            className="flex h-16 items-center justify-center rounded-2xl border border-black/10 bg-white text-2xl font-semibold text-slate-950 shadow-sm transition-all hover:bg-slate-100 active:scale-95 active:bg-slate-200 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 dark:active:bg-slate-700"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            disabled={submitting}
            onClick={removeDigit}
            className="flex h-16 items-center justify-center rounded-2xl border border-black/10 bg-slate-200/70 text-slate-600 shadow-sm transition-all hover:bg-slate-200 hover:text-slate-950 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H21a1 1 0 011 1v12a1 1 0 01-1 1H10.828a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Anmelden-Button */}
        <form onSubmit={onKioskLogin} className="mt-4">
          <input type="hidden" name="pin" value={loginPin} />
          <button
            type="submit"
            disabled={submitting || loginPin.length < 4}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-semibold text-white transition-all active:scale-[0.98] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Wird geprueft..." : "Anmelden"}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-600">
          PIN-Eingabe fuer Monteure und Projektleiter
        </p>
      </div>

      {/* Trennlinie */}
      <div className="my-8 flex w-full max-w-sm items-center gap-4">
        <div className="h-px flex-1 bg-slate-300 dark:bg-slate-800" />
        <button
          type="button"
          onClick={() => setShowAdmin(!showAdmin)}
          className="text-xs text-slate-500 transition hover:text-slate-700 dark:text-slate-600 dark:hover:text-slate-400"
        >
          {showAdmin ? "Admin ausblenden" : "Admin-Login"}
        </button>
        <div className="h-px flex-1 bg-slate-300 dark:bg-slate-800" />
      </div>

      {/* Admin-Login (kompakt, eingeklappt) */}
      {showAdmin ? (
        <form
          onSubmit={onAdminLogin}
          className="w-full max-w-sm rounded-2xl border border-black/10 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
        >
          <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-400">Benutzer-Anmeldung</h2>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label className="text-xs text-slate-500">E-Mail</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="username"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-600"
                placeholder="admin@example.local"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-slate-500">Passwort</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-600"
                placeholder="Passwort"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              {submitting ? "Anmeldung..." : "Admin anmelden"}
            </button>
          </div>
          {error || success ? (
            <div className="mt-3"><MessageBar error={error} success={success} /></div>
          ) : null}
        </form>
      ) : null}

      {/* Theme Toggle */}
      <div className="mt-6">
        <ThemeToggle />
      </div>
    </div>
  );
}
