import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR_BUILD?.trim() === 'true';

const nextConfig: NextConfig = {
  output: isCapacitor ? 'export' : undefined,
  env: {
    // PocketBase now sits behind Caddy at pb.delcargo.us with a proper
    // HTTPS certificate, instead of the old bare-IP plain-HTTP address —
    // see src/lib/pocketbase.ts for why that mattered for the native app.
    // The web rewrite below is a server-to-server hop (Vercel → PocketBase)
    // so it was never a browser security issue, but pointing it at the
    // domain too means it keeps working even if the droplet's IP ever
    // changes — no redeploy needed, just a DNS update.
    NEXT_PUBLIC_PB_URL: 'https://pb.delcargo.us',
  },

  images: {
    unoptimized: isCapacitor,
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'pb.delcargo.us' },
      // Current production host (moved off Vercel to Cloudflare, 2026-08-20
      // — see src/lib/apiBase.ts). Kept the old Vercel hostname below too,
      // harmless to leave in, in case anything (old cached pages, old email
      // links) still references an image URL on that host.
      { protocol: 'https', hostname: 'hub.delcargo.us' },
      { protocol: 'https', hostname: 'delcargo-io.vercel.app' },
    ],
  },
  /* config options here */
};

export default nextConfig;
