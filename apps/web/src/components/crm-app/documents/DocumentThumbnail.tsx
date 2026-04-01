"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { DocumentItem } from "../types";
import { cx } from "../shared";
import { useI18n } from "../../../i18n-context";

export function DocumentThumbnail({
  document,
  thumbnailUrl,
  hasError,
}: {
  document: DocumentItem;
  thumbnailUrl?: string;
  hasError?: boolean;
}) {
  const { t: l } = useI18n();
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
        <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">{l("doc.fileMissingBadge")}</span>
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
    label = ext || l("doc.imageLabel");
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
    label = ext || l("doc.fileLabel");
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
