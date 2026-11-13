"use client";
import { useCallback, useEffect, useState } from "react";
import type { AppState } from "./types";

/** Polls /api/state so every open screen (buyer, farmer, demo panel) stays in sync. */
export function useAppState(intervalMs = 2000) {
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = (await res.json()) as AppState & { fatal?: string };
      if (data.fatal) setError(data.fatal);
      else setState(data);
    } catch {
      /* keep last good state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) setError(data.error ?? "Something went wrong.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [refresh]
  );

  return { state, busy, error, act };
}

export const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
