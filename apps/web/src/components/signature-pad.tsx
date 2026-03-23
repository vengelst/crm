"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type SignaturePadProps = {
  onChange: (value: string) => void;
};

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.strokeStyle = "#0f172a";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPosition(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const { x, y } = getPosition(event);
    context.beginPath();
    context.moveTo(x, y);
    setDrawing(true);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const { x, y } = getPosition(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function stopDrawing() {
    if (!drawing) {
      return;
    }

    const canvas = canvasRef.current;
    setDrawing(false);

    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={420}
        height={180}
        className="w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-700"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <button
        type="button"
        onClick={clearCanvas}
        className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-black/5 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
      >
        Signatur leeren
      </button>
    </div>
  );
}
