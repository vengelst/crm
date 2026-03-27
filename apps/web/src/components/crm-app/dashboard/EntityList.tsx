"use client";

import Link from "next/link";
import { cx, SecondaryButton } from "../shared";

export function EntityList<T extends { id: string }>({
  items,
  title,
  subtitle,
  href,
  editLabel,
  deleteLabel,
  onOpen,
  onEdit,
  onDelete,
}: {
  items: T[];
  title: (item: T) => string;
  subtitle: (item: T) => string;
  href?: (item: T) => string;
  editLabel?: string;
  deleteLabel: string;
  onOpen?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete: (item: T) => void;
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
            <SecondaryButton
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
              }}
            >
              {deleteLabel}
            </SecondaryButton>
          </div>
        </div>
      ))}
    </div>
  );
}
