"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx, SecondaryButton } from "../shared";

export function EntityList<T extends { id: string }>({
  items,
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  href,
  editLabel,
  deleteLabel,
  onOpen,
  onEdit,
  onDelete,
  badges,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  items: T[];
  title: (item: T) => string;
  subtitle: (item: T) => string;
  titleClassName?: (item: T) => string | undefined;
  subtitleClassName?: (item: T) => string | undefined;
  href?: (item: T) => string;
  editLabel?: string;
  deleteLabel: string;
  onOpen?: (item: T) => void;
  onEdit?: (item: T) => void;
  /** Optional — wenn nicht gesetzt, wird der Delete-Button nicht
   *  gerendert. Frontend-Gating erfolgt durch das Aufrufer-Modul (z. B.
   *  per `hasPermission(auth, "*.delete")`). */
  onDelete?: (item: T) => void;
  /** Optionaler Render-Slot fuer kleine Kennzahlen / Badges neben dem Titel. */
  badges?: (item: T) => ReactNode;
  /** Optional: Checkboxen zur Mehrfachauswahl je Eintrag. */
  selectable?: boolean;
  /** Optional: derzeit selektierte IDs. */
  selectedIds?: Set<string>;
  /** Optional: Callback bei Checkbox-Toggle. */
  onToggleSelect?: (item: T, checked: boolean) => void;
}) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={onOpen ? () => onOpen(item) : undefined}
          onKeyDown={onOpen ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(item);
            }
          } : undefined}
          role={onOpen ? "button" : undefined}
          tabIndex={onOpen ? 0 : undefined}
          className={cx(
            "flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between",
            onOpen && "cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70",
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {selectable ? (
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300"
                checked={selectedIds?.has(item.id) ?? false}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onToggleSelect?.(item, event.target.checked)}
                aria-label="Select item"
              />
            ) : null}
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {href ? (
                <Link href={href(item)} className={cx("text-lg font-semibold hover:underline", titleClassName?.(item))}>
                  {title(item)}
                </Link>
              ) : (
                <div className={cx("text-lg font-semibold", titleClassName?.(item))}>{title(item)}</div>
              )}
              {badges ? badges(item) : null}
            </div>
            <p className={cx("text-sm text-slate-500", subtitleClassName?.(item))}>{subtitle(item)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {onEdit && editLabel ? (
              <SecondaryButton
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(item);
                }}
              >
                {editLabel}
              </SecondaryButton>
            ) : null}
            {onDelete ? (
              <SecondaryButton
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item);
                }}
              >
                {deleteLabel}
              </SecondaryButton>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
