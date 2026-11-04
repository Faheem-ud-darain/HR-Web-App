import PocketBase from 'pocketbase';
import { DEFAULT_PB_URL } from './pbUrl';

// The web app and native app now both talk to PocketBase directly over HTTPS
// via pb.delcargo.us (Caddy reverse proxy in front of PocketBase on the droplet).
// Bypassing Vercel's Edge API route proxy avoids massive Vercel compute usage 
// (especially for long-lived realtime SSE connections).

export const pb = new PocketBase(DEFAULT_PB_URL);

// Optional: Automatically disable auto-cancellation globally if requests are rapid
pb.autoCancellation(false);
