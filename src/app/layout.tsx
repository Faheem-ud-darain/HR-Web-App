import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastNotification } from "@/components/ui/ToastNotification";
import { PushWebScript } from "@/components/PushWebScript";
import { SplashScreenOverlay } from "@/components/SplashScreenOverlay";
import Providers from "./providers";


// Display font — headings, page titles, stat numbers. Space Grotesk's
// distinctive grotesk character (wide apertures, technical feel) is what
// gives the app a less "default SaaS template" identity than a plain
// system-ui stack, without sacrificing legibility.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body font — everything else (labels, table data, form copy, nav links).
// Plus Jakarta Sans is a clean, highly legible grotesque that pairs with
// Space Grotesk without competing with it (same x-height family, different
// enough personality to read as a deliberate pairing, not two similar
// geometric sans-serifs).
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DelCargo HR Platform",
  description: "Dynamic human resources & operations portal.",
  // Links public/manifest.webmanifest (previously unreferenced anywhere —
  // it existed in public/ but nothing emitted a <link rel="manifest">, so
  // it was never actually read by any browser). This plus the icons/
  // theme-color below is what lets Android Chrome build a native-like
  // splash screen when the site is added to the home screen (it composites
  // one from the manifest's name, background_color, and the largest icon —
  // there's no separate image to author for that case).
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.webp",
    shortcut: "/icons/icon-192.webp",
    apple: "/icons/icon-192.webp",
  },
  // iOS's home-screen "standalone" mode + its (more limited) auto-generated
  // launch screen keys off these apple-mobile-web-app-* tags rather than
  // the web manifest.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DelCargo HR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Navy — matches capacitor.config.ts's native SplashScreen background
  // and SplashScreenOverlay.tsx's overlay (both updated to the real "DC
  // HUB" navy/gold brand mark), so the browser chrome (address bar on
  // Android, PWA title bar) and the boot splash read as one consistent
  // color instead of a jarring mismatch. This used to be the old brand
  // orange (#EA580C) and was never updated when the splash screen was
  // redone.
  themeColor: "#0B0F1A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <SplashScreenOverlay />
        <PushWebScript />
        <Providers>
          <ToastNotification />
          {children}
        </Providers>
      </body>
    </html>
  );
}
