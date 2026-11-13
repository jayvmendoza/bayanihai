"use client";
import { useEffect } from "react";

// Registers the service worker in production builds only, so `npm run dev` never serves stale cached pages.
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is a bonus; the app works without it */
    });
  }, []);
  return null;
}
