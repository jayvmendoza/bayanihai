import type { ReactNode } from "react";

export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <div className="screen">
        <div className="notch" />
        <header className="brand">
          <img src="/logo.svg" alt="" width={40} height={40} />
          <span>
            BAYANIH<b>AI</b>
          </span>
        </header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

export function Carrots({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 120 110" aria-hidden>
      <g transform="rotate(-30 60 60)">
        <path d="M48 30 L72 30 L62 104 Q60 108 58 104 Z" fill="#F08A24" />
        <path d="M50 44 H58 M52 58 H60 M54 72 H60 M56 86 H60" stroke="#C9661A" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 30 C54 18 50 12 44 8 M60 30 C60 16 62 10 64 4 M60 30 C66 18 72 14 78 12" stroke="#7BC86C" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      <g transform="rotate(-10 90 70) translate(30 8)">
        <path d="M48 30 L72 30 L62 104 Q60 108 58 104 Z" fill="#F5A04A" />
        <path d="M60 30 C54 18 50 12 44 8 M60 30 C66 18 72 14 78 12" stroke="#7BC86C" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

export function LockIcon({ color = "#E9B949", size = 32 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
