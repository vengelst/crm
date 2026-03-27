"use client";

import Link from "next/link";

export function DashboardList<T>({
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

