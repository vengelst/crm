"use client";

import Image from "next/image";
import type { DocumentPreviewState } from "../types";
import { SecondaryButton } from "../shared";

export function DocumentPreviewModal({
  preview,
  onPrint,
  onClose,
}: {
  preview: DocumentPreviewState;
  onPrint: () => void;
  onClose: () => void;
}) {
  const isImage = preview.mimeType.startsWith("image/");
  const isPdf = preview.mimeType === "application/pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-3xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{preview.title}</h3>
            <p className="text-sm text-slate-500">{preview.mimeType}</p>
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={onPrint}>Drucken</SecondaryButton>
            <SecondaryButton onClick={onClose}>Schliessen</SecondaryButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-black/10 bg-slate-50 p-2 dark:border-white/10 dark:bg-slate-950">
          {isImage ? (
            <Image
              src={preview.url}
              alt={preview.title}
              width={1200}
              height={1600}
              unoptimized
              className="mx-auto max-h-[72vh] w-auto rounded-xl object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={preview.url}
              title={preview.title}
              className="h-[72vh] w-full rounded-xl"
            />
          ) : (
            <div className="flex h-[72vh] items-center justify-center">
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-white/10 dark:hover:bg-slate-800"
              >
                Dokument in neuem Tab oeffnen
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
