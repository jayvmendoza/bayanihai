// Optional presenter lock for public deployments (e.g. Vercel).
// If DEMO_PASSWORD is set, /demo asks for it once (browser login prompt, any username) and remembers
// it in a cookie; the presenter-only actions below then require that cookie. Locally (no password) nothing changes.
// Runs in both middleware (edge) and API routes (Node), so it only uses Web Crypto.

export const PRESENTER_COOKIE = "bayanihai_presenter";

/** Actions only the presenter console may trigger. Buyer/farmer phone actions stay open. */
export const PRESENTER_ONLY = new Set(["reset", "deal-maker", "confirm", "fast-forward", "cash-received"]);

export function isPresenterOnly(action: string, who?: string): boolean {
  return PRESENTER_ONLY.has(action) || (action === "pay" && who === "neighbors");
}

/** Cookie value: SHA-256 of the password, so the password itself is never stored in the browser. */
export async function presenterToken(password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bayanihai:${password}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
