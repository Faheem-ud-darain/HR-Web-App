// Cloudflare Worker that runs the app's scheduled jobs. It does nothing but call the app's own
// authenticated cron routes at the right times; all of the logic (and its tests) lives in the app
// repo under src/app/api/cron/* and src/lib/core/*.
//
// Schedules (UTC) — see wrangler.toml:
//   0 11 7 * *        07:00 New York (EDT) on the 7th: warn HR/Admin what will be deleted on the 10th
//   */5 * 10-20 * *   every 5 minutes from the 10th to the 20th: delete one small batch of last
//                     month's (and older) screenshots. The route refuses to delete before the
//                     10th New York time, does nothing when nothing is due, and the window is wide
//                     only so a large first-time backlog finishes at a gentle pace.
//
// Secrets (never in the repo): CRON_SECRET — the same value must be set on the Pages project.
// Minimal shapes of the Workers runtime types, so this file needs no extra type packages.
interface ScheduledController { cron: string }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void }

export interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

const WARN_CRON = '0 11 7 * *';

async function call(env: Env, mode: 'warn' | 'delete'): Promise<void> {
  const res = await fetch(`${env.APP_URL}/api/cron/screenshot-retention?mode=${mode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const text = await res.text();
  console.log(`[cron] screenshot-retention ${mode} -> ${res.status} ${text.slice(0, 300)}`);
  // A non-2xx marks the run as failed in the Worker's logs/dashboard so it is noticed.
  if (!res.ok) throw new Error(`screenshot-retention ${mode} failed: ${res.status}`);
}

const worker = {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(call(env, event.cron === WARN_CRON ? 'warn' : 'delete'));
  },
  // Visiting the Worker's address does nothing but say it exists — no job can be started from here.
  async fetch(): Promise<Response> {
    return new Response('delcargo-cron: scheduled jobs only', { status: 200 });
  },
};

export default worker;
