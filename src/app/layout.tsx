import { THEME_BOOT_SCRIPT } from "@/lib/themeBoot";
import type { Metadata, Viewport } from "next";
import { Questrial } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ToastNotification } from "@/components/ui/ToastNotification";
import { ActionToastHost } from "@/components/ui/ActionToastHost";
import { PushWebScript } from "@/components/PushWebScript";
import { SplashScreenOverlay } from "@/components/SplashScreenOverlay";
import Providers from "./providers";


// Display font — headings, page titles, stat numbers. Xmind is a variable font (weights 100–900), so every
// heading weight the app asks for is a real weight, never a synthesised one.
// It is bundled with the app (src/app/fonts) rather than fetched from Google, because Xmind is newer than the font
// list this version of Next.js knows about; the file is Google Fonts' own latin subset (SIL Open Font License).
const xmind = localFont({
  src: [{ path: "./fonts/Xmind-latin-variable.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-display",
  display: "swap",
});

// Body font — everything else (labels, table data, form copy, nav links). Questrial ships a single regular
// weight (400); where the app asks for bold text in the body face, the browser thickens it.
const questrial = Questrial({
  variable: "--font-body",
  subsets: ["latin"],
  weight: "400",
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
      className={`${xmind.variable} ${questrial.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets light/dark before the first paint so there is no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <SplashScreenOverlay />
        <PushWebScript />
        <Providers>
          <ActionToastHost>
            <ToastNotification />
            {children}
          </ActionToastHost>
        </Providers>
      </body>
    </html>
  );
}
