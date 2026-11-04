// The one place the PocketBase address is written. Server code may override it with NEXT_PUBLIC_PB_URL; the browser and native app use the default.
export const DEFAULT_PB_URL = 'https://pb.delcargo.us';
export const PB_URL = process.env.NEXT_PUBLIC_PB_URL || DEFAULT_PB_URL;
