import PocketBase from 'pocketbase';

// The web app and native app now both talk to PocketBase directly over HTTPS
// via pb.delcargo.us (Caddy reverse proxy in front of PocketBase on the droplet).
// Bypassing Vercel's Edge API route proxy avoids massive Vercel compute usage 
// (especially for long-lived realtime SSE connections).
const PB_URL = 'https://pb.delcargo.us';

export const pb = new PocketBase(PB_URL);

// Optional: Automatically disable auto-cancellation globally if requests are rapid
pb.autoCancellation(false);
