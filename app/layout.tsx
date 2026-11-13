import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "BAYANIHAI",
  description: "AI-powered group buying with blockchain escrow for Filipino farmers.",
  applicationName: "BAYANIHAI",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "BAYANIHAI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0a4d24",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={jakarta.className}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
