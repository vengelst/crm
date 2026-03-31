"use client";

import { useEffect, useRef, useState } from "react";
import { cx, SecondaryButton } from "../shared";

export function DrawingEditorModal({
  title,
  sourceUrl,
  sourceDocumentId,
  onClose,
  onSave,
}: {
  title: string;
  sourceUrl?: string;
  sourceDocumentId?: string;
  onClose: () => void;
  onSave: (file: File, mode: "copy" | "replace") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#dc2626");
  const [lineWidth, setLineWidth] = useState(4);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const pendingFileRef = useRef<File | null>(null);

  const colors = [
    { value: "#dc2626", label: "Rot" },
    { value: "#16a34a", label: "Gruen" },
    { value: "#2563eb", label: "Blau" },
    { value: "#000000", label: "Schwarz" },
  ];
  const widths = [
    { value: 2, label: "Duenn" },
    { value: 4, label: "Mittel" },
    { value: 8, label: "Dick" },
  ];

  // Refs fuer aktuelle Tool-Einstellungen (damit der Effect nicht neu bindet)
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const lineWidthRef = useRef(lineWidth);

  useEffect(() => {
    toolRef.current = tool;
    colorRef.current = color;
    lineWidthRef.current = lineWidth;
  }, [tool, color, lineWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let drawing = false;

    const drawBase = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const img = baseImageRef.current;
      if (img) {
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      }
    };

    if (sourceUrl) {
      const img = new window.Image();
      img.onload = () => { baseImageRef.current = img; drawBase(); };
      img.src = sourceUrl;
    } else {
      baseImageRef.current = null;
      drawBase();
    }

    const getPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    const onDown = (event: PointerEvent) => {
      drawing = true;
      const p = getPoint(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const onMove = (event: PointerEvent) => {
      if (!drawing) return;
      const p = getPoint(event);
      ctx.lineTo(p.x, p.y);
      if (toolRef.current === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = lineWidthRef.current * 4;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = lineWidthRef.current;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    const onUp = () => {
      drawing = false;
      ctx.globalCompositeOperation = "source-over";
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
    };
  }, [sourceUrl]);

  function clearDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = baseImageRef.current;
    if (img) {
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
  }

  async function createFile(): Promise<File | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Fuer den Export: weissen Hintergrund unter die Zeichnung legen
    const exportCanvas = window.document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ectx = exportCanvas.getContext("2d");
    if (!ectx) return null;
    ectx.fillStyle = "#ffffff";
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ectx.drawImage(canvas, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      exportCanvas.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) return null;
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "zeichnung";
    return new File([blob], `${safeName}.png`, { type: "image/png" });
  }

  async function handleSave() {
    const file = await createFile();
    if (!file) return;
    if (sourceDocumentId) {
      // Bild-Anmerkung: Dialog zeigen
      pendingFileRef.current = file;
      setShowSaveDialog(true);
    } else {
      // Freie Zeichnung: direkt als Kopie
      onSave(file, "copy");
    }
  }

  function confirmSave(mode: "copy" | "replace") {
    const file = pendingFileRef.current;
    if (!file) return;
    pendingFileRef.current = null;
    setShowSaveDialog(false);
    onSave(file, mode);
  }

  const toolBtn = (active: boolean) =>
    cx("flex h-10 min-w-[2.5rem] items-center justify-center rounded-xl border text-sm font-medium transition",
      active
        ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-200 dark:bg-slate-200 dark:!text-slate-950"
        : "border-black/10 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-slate-700"
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col gap-3 rounded-3xl bg-white p-3 shadow-2xl dark:bg-slate-900 sm:p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{title}</h3>
            <p className="text-xs text-slate-500">Mit Maus oder Finger zeichnen.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void handleSave()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">Speichern</button>
            <SecondaryButton onClick={onClose}>Abbrechen</SecondaryButton>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-950">
          {/* Werkzeuge */}
          <button type="button" onClick={() => setTool("pen")} className={toolBtn(tool === "pen")} title="Stift">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button type="button" onClick={() => setTool("eraser")} className={toolBtn(tool === "eraser")} title="Radierer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>

          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />

          {/* Farben */}
          {colors.map((c) => (
            <button key={c.value} type="button" onClick={() => { setColor(c.value); setTool("pen"); }} title={c.label}
              className={cx("h-8 w-8 rounded-full border-2 transition", color === c.value && tool === "pen" ? "border-slate-900 ring-2 ring-slate-900/30 dark:border-white dark:ring-white/30" : "border-black/20 dark:border-white/20")}
              style={{ backgroundColor: c.value }}
            />
          ))}

          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />

          {/* Strichstaerke */}
          {widths.map((w) => (
            <button key={w.value} type="button" onClick={() => setLineWidth(w.value)} title={w.label}
              className={toolBtn(lineWidth === w.value)}>
              <span className="rounded-full bg-current" style={{ width: w.value * 2, height: w.value * 2 }} />
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-black/10 dark:bg-white/10" />

          <button type="button" onClick={clearDrawing} className={toolBtn(false)} title="Zuruecksetzen">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>

        {/* Canvas */}
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-black/10 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-950">
          <canvas
            ref={canvasRef}
            width={1200}
            height={800}
            className="mx-auto max-h-[65vh] w-full rounded-xl bg-white"
            style={{ touchAction: "none" }}
          />
        </div>
      </div>

      {/* Speicherdialog bei Bild-Anmerkung */}
      {showSaveDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="mb-2 text-lg font-semibold">Anmerkung speichern</h3>
            <p className="mb-5 text-sm text-slate-500">Soll das bestehende Bild mit der Anmerkung aktualisiert werden, oder soll eine Kopie angelegt werden?</p>
            <div className="grid gap-3">
              <button type="button" onClick={() => confirmSave("replace")}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                Original aktualisieren
              </button>
              <button type="button" onClick={() => confirmSave("copy")}
                className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-slate-700">
                Als Kopie speichern
              </button>
              <button type="button" onClick={() => setShowSaveDialog(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
