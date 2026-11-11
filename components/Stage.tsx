"use client";
import { useEffect, type ReactNode } from "react";

/** Centers a phone on the page; inside the demo panel's iframes (?embed=1) it drops the padding. */
export function Stage({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("embed")) document.body.classList.add("embed");
  }, []);
  return <main className="stage">{children}</main>;
}
