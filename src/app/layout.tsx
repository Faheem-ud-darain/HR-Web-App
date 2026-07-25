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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
      <body className="min-h-full flex flex-col">
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
