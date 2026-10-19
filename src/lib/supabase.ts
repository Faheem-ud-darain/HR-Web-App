
import type { PbRow } from '@/lib/pbTypes';// This file previously contained the Supabase client used during the
// Supabase → PocketBase migration. The app now runs entirely on the
// self-hosted PocketBase instance at https://pb.delcargo.us.
//
// This file is kept as a stub to avoid breaking any stray imports while the
// codebase is being cleaned up. The supabase export below is intentionally
// a no-op object — nothing in the active codebase reads from it.
//
// TODO: once all call sites have been confirmed removed, delete this file and
// remove @supabase/supabase-js from package.json.

export const supabase = {
  // Stub — not connected. Use src/lib/pocketbase.ts (pb) instead.
} as PbRow;
