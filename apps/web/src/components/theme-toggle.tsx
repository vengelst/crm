"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() =>
        mounted && setTheme(resolvedTheme === "dark" ? "light" : "dark")
      }
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white/80 text-slate-900 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      aria-label="Theme umschalten"
    >
      {!mounted ? (
        <div className="h-4 w-4" />
      ) : resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
