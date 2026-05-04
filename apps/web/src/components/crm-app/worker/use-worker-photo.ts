"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../types";

export function useWorkerPhoto(
  workerId: string | null | undefined,
  photoPath: string | null | undefined,
  authToken: string,
): string | null {
  const photoKey =
    workerId && photoPath && authToken ? `${workerId}|${photoPath}` : null;
  const [loaded, setLoaded] = useState<{ key: string; src: string } | null>(
    null,
  );

  useEffect(() => {
    if (!photoKey || !workerId || !authToken) return;
    let canceled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/workers/${workerId}/photo/file`), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!canceled) setLoaded({ key: photoKey, src: objectUrl });
      } catch {
        // ignore
      }
    })();
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoKey, workerId, authToken]);

  return loaded && loaded.key === photoKey ? loaded.src : null;
}
