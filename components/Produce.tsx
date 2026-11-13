// Produce artwork from the BAYANIHAI prototype (carrots, cabbage, tomatoes, potatoes) as one inline SVG sprite.
// The carrot tops are generated (6 stems x 9 leaflet pairs) so the file stays small.
import type { CropKey } from "@/lib/listing";

const GREENS = ["#3F8A2C", "#4E9F34", "#5FB33E", "#74C247"];

type Stem = { c: [number, number]; e: [number, number] };
const STEMS_A: Stem[] = [
  { c: [-11.6, -15.7], e: [-21.7, -26.2] },
  { c: [-11.5, -23.4], e: [-15.8, -38.9] },
  { c: [2.1, -27.6], e: [-2.7, -45.9] },
  { c: [9.2, -25.2], e: [9.0, -42.0] },
  { c: [10.2, -21.0], e: [14.8, -35.0] },
  { c: [11.3, -14.6], e: [20.9, -24.3] },
];
const STEMS_B: Stem[] = [
  { c: [-11.4, -16.0], e: [-21.0, -26.7] },
  { c: [-11.6, -23.3], e: [-16.0, -38.8] },
  { c: [2.3, -27.6], e: [-2.1, -46.0] },
  { c: [8.5, -25.4], e: [7.1, -42.4] },
  { c: [10.9, -20.5], e: [16.8, -34.1] },
  { c: [11.0, -15.0], e: [20.1, -24.9] },
];

const f1 = (n: number) => n.toFixed(1);

function carrotTop(stems: Stem[], seed: number): string {
  let out = "";
  let k = seed;
  const pick = () => GREENS[(k = (k * 7 + 3) % 11) % 4];
  for (const { c, e } of stems) {
    out += `<path d="M0 -1Q${c[0]} ${c[1]} ${e[0]} ${e[1]}" stroke="url(#bh-stemG)" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 9; i++) {
      const t = 0.28 + i * 0.09;
      const x = 2 * (1 - t) * t * c[0] + t * t * e[0];
      const y = (1 - t) * (1 - t) * -1 + 2 * (1 - t) * t * c[1] + t * t * e[1];
      const dx = 2 * (1 - t) * (c[0] - 0) + 2 * t * (e[0] - c[0]);
      const dy = 2 * (1 - t) * (c[1] + 1) + 2 * t * (e[1] - c[1]);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const rx = 6.4 - i * 0.375;
      const ry = 2.0 - i * 0.11;
      for (const off of [52, -52]) {
        out += `<ellipse cx="${f1(rx * 0.55)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="translate(${f1(x)} ${f1(y)}) rotate(${Math.round(ang + off)})" fill="${pick()}"/>`;
      }
    }
    const tang = (Math.atan2(e[1] - c[1], e[0] - c[0]) * 180) / Math.PI;
    out += `<ellipse cx="3" rx="6" ry="2" transform="translate(${e[0]} ${e[1]}) rotate(${Math.round(tang)})" fill="#74C247"/>`;
  }
  return out;
}

const RINGS = [12, 22, 33.5, 44.5, 54.5, 65, 78, 89.5]
  .map((y, i) => {
    const w = [12, 11.5, 10.5, 9, 7.5, 5.5, 3.5, 1.5][i];
    return `<path d="M${-w} ${y}Q${f1(-w * 0.45)} ${y + 2.6} ${f1(-w * 0.06)} ${y + 1}M${f1(w * 0.22)} ${y + 1.4}Q${f1(w * 0.62)} ${y + 3} ${w} ${y}" stroke="#A84608" stroke-opacity=".5" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  })
  .join("");

const CARROT_BODY = `<path d="M-13 0C-15 6-14 20-11 38C-8 60-4 84 0 100C4 84 8 60 11 38C14 20 15 6 13 0C8-3-8-3-13 0Z" fill="url(#bh-crtG)"/><path d="M-13 0C-15 6-14 20-11 38C-8 60-4 84 0 100C4 84 8 60 11 38C14 20 15 6 13 0C8-3-8-3-13 0Z" fill="url(#bh-shG)"/>${RINGS}<path d="M-6 6C-6 30-3 60-1 88" stroke="#fff" stroke-opacity=".38" stroke-width="3" fill="none" stroke-linecap="round" filter="url(#bh-bl)"/><path d="M0 100q2 6-1 11" stroke="#D98A3A" stroke-width=".9" fill="none"/><ellipse rx="13" ry="4.5" fill="#B5560C"/><ellipse cy="-.5" rx="8.5" ry="2.8" fill="#6E8F2B"/><ellipse cy="-.8" rx="4" ry="1.4" fill="#4C7A22"/>`;

const TOMATO = `<path d="M0-20C16-26 30-14 30 2C30 20 16 30 0 30C-16 30-30 20-30 2C-30-14-16-26 0-20Z" fill="url(#bh-tmG)"/><ellipse cy="-18" rx="11" ry="3" fill="#7A0F08" opacity=".35"/>${[0, 60, 120, 180, 240, 300]
  .map((r) => `<ellipse cx="0" cy="-7" rx="3" ry="9" transform="translate(0 -19) scale(1 .5) rotate(${r})" fill="url(#bh-calG)"/>`)
  .join("")}<path d="M0-19v-8" stroke="#4E8A2E" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="-14" cy="-3" rx="5" ry="10" transform="rotate(-22 -14 -3)" fill="#fff" opacity=".5" filter="url(#bh-bl)"/>`;

const POTATO = `<path d="M-30 4C-32-12-16-22 2-21C22-20 34-8 32 8C30 22 12 28-6 26C-22 24-29 16-30 4Z" fill="url(#bh-ptG)"/><g fill="#6B4520"><ellipse cx="-12" cy="6" rx="2.6" ry="1.5"/><ellipse cx="10" cy="-6" rx="2.4" ry="1.4"/><ellipse cx="14" cy="14" rx="2.6" ry="1.5"/></g><g fill="#A87C42"><circle cx="-4" cy="-8" r="1.2"/><circle cx="-20" cy="-3" r="1"/><circle cx="2" cy="16" r="1.2"/><circle cx="22" cy="2" r="1"/><circle cx="-14" cy="18" r="1"/></g><ellipse cx="-12" cy="-10" rx="9" ry="4" transform="rotate(-20 -12 -10)" fill="#fff" opacity=".4" filter="url(#bh-bl)"/>`;

const CABBAGE = `<circle r="36" fill="url(#bh-cbG)"/><path d="M-34 6C-40-20-14-38 6-34C-10-22-14 0-6 30C-22 30-32 22-34 6Z" fill="url(#bh-lfG)" stroke="#4E8426" stroke-width="1.2"/><path d="M-6 30C-14 0-10-22 6-34C26-30 36-8 32 10C28 24 14 32-6 30Z" fill="#9CCB62" opacity=".92"/><g stroke="#E4F2C4" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"><path d="M-6 30C-6 10-2-8 6-30"/><path d="M-5 16L-17 6M-4 4L-15-8M-1-8L-9-20M-4 20L9 10M-1 6L13-2M3-10L14-16"/></g><ellipse cx="-14" cy="-14" rx="10" ry="14" transform="rotate(-30 -14 -14)" fill="#fff" opacity=".3" filter="url(#bh-bl)"/>`;

const SPRITE = `<defs>
<linearGradient id="bh-crtG" x1="0" x2="1"><stop offset="0" stop-color="#D2640A"/><stop offset=".3" stop-color="#FFA03A"/><stop offset=".45" stop-color="#FFB85A"/><stop offset=".75" stop-color="#EF7F12"/><stop offset="1" stop-color="#BD520A"/></linearGradient>
<linearGradient id="bh-shG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A2E00" stop-opacity=".5"/><stop offset=".35" stop-color="#7A2E00" stop-opacity="0"/><stop offset=".85" stop-color="#7A2E00" stop-opacity="0"/><stop offset="1" stop-color="#7A2E00" stop-opacity=".3"/></linearGradient>
<linearGradient id="bh-stemG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3F7F2A"/><stop offset="1" stop-color="#6DBE45"/></linearGradient>
<linearGradient id="bh-calG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7BC24A"/><stop offset="1" stop-color="#3E7F26"/></linearGradient>
<linearGradient id="bh-lfG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B5DB7E"/><stop offset="1" stop-color="#5F9A30"/></linearGradient>
<radialGradient id="bh-tmG" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FF7B64"/><stop offset=".45" stop-color="#E4372D"/><stop offset="1" stop-color="#9E150E"/></radialGradient>
<radialGradient id="bh-ptG" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#E6C58E"/><stop offset=".55" stop-color="#C49A5B"/><stop offset="1" stop-color="#8A5F2C"/></radialGradient>
<radialGradient id="bh-cbG" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#C9E79A"/><stop offset=".5" stop-color="#86BC4A"/><stop offset="1" stop-color="#4E8426"/></radialGradient>
<linearGradient id="bh-agLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E24B1A" stop-opacity=".35"/><stop offset="1" stop-color="#E24B1A" stop-opacity="0"/></linearGradient>
<linearGradient id="bh-agMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9A21B" stop-opacity=".35"/><stop offset="1" stop-color="#D9A21B" stop-opacity="0"/></linearGradient>
<linearGradient id="bh-agBig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F9D52" stop-opacity=".35"/><stop offset="1" stop-color="#1F9D52" stop-opacity="0"/></linearGradient>
<filter id="bh-bl" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter>
<g id="bh-crt">${carrotTop(STEMS_A, 1)}${CARROT_BODY}</g>
<g id="bh-crt2">${carrotTop(STEMS_B, 5)}${CARROT_BODY}</g>
<g id="bh-tom">${TOMATO}</g><g id="bh-pot">${POTATO}</g><g id="bh-cab">${CABBAGE}</g>
<symbol id="bh-carrots" viewBox="0 0 120 110"><g transform="translate(78 40) rotate(-14) scale(.62)"><use href="#bh-crt2"/></g><g transform="translate(38 40) rotate(-32) scale(.8)"><use href="#bh-crt"/></g></symbol>
<symbol id="bh-cabbage" viewBox="0 0 120 110"><g transform="translate(60 56)"><use href="#bh-cab"/></g></symbol>
<symbol id="bh-tomatoes" viewBox="0 0 120 110"><g transform="translate(46 64) scale(.95)"><use href="#bh-tom"/></g><g transform="translate(84 72) rotate(8) scale(.76)"><use href="#bh-tom"/></g></symbol>
<symbol id="bh-potatoes" viewBox="0 0 120 110"><g transform="translate(44 62) scale(.95)"><use href="#bh-pot"/></g><g transform="translate(84 58) rotate(14) scale(.78)"><use href="#bh-pot"/></g></symbol>
</defs>`;

/** Render once per page; every <Produce> below references it. */
export function ProduceDefs() {
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden dangerouslySetInnerHTML={{ __html: SPRITE }} />;
}

export function Produce({ crop, w = 76, className, style }: { crop: CropKey; w?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={w} height={Math.round(w * 0.92)} viewBox="0 0 120 110" className={className} style={style} aria-hidden>
      <use href={`#bh-${crop}`} />
    </svg>
  );
}
