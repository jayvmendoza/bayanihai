import type { MetadataRoute } from "next";

// Makes BAYANIHAI installable ("Add to Home screen" / "Install app"). Opens on the buyer app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BAYANIHAI",
    short_name: "BAYANIHAI",
    description: "Sama-samang bili. Protektadong bayad. AI-powered group buying with blockchain escrow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f8f6",
    theme_color: "#0a4d24",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mamimili (Buyer)", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Magsasaka (Farmer)", url: "/farmer", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
