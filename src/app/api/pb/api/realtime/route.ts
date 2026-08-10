import { NextRequest, NextResponse } from 'next/server';

// Dedicated proxy for PocketBase's realtime endpoint only. Everything else
// under /api/pb/* still goes through the blanket rewrite in next.config.ts
// (source: '/api/pb/:path*' -> https://pb.delcargo.us/:path*), which works
// fine for normal REST calls (quick request/response). Realtime is
// different: the PocketBase JS SDK opens a long-lived EventSource (SSE) GET
// to {baseUrl}/api/realtime to receive events, then POSTs to the same path
// to register {clientId, subscriptions}. A plain next.config.ts rewrite is
// not documented or guaranteed to stream a long-lived response through —
// in practice it can buffer the connection until it "completes" (which,
// for an SSE stream, is never), so the SDK's EventSource just sits there
// until its own connect timeout fires: "EventSource connect took too long."
// This route handler exists specifically to stream the GET response back
// chunk-by-chunk instead of buffering it, which is what actually fixes it.
// Placing this file at the exact same path the generic rewrite would
// otherwise match means Next.js's filesystem route takes precedence for
// this one path; every other /api/pb/* path is untouched.

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const UPSTREAM = 'https://pb.delcargo.us/api/realtime';

export async function GET(req: NextRequest) {
  const upstream = await fetch(`${UPSTREAM}${req.nextUrl.search}`, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
    // @ts-expect-error - Node's fetch types don't yet know about this,
    // but the runtime accepts it: without it, some Node versions try to
    // buffer/duplex-check the (bodyless GET) request in a way that can
    // delay the response stream starting.
    duplex: 'half',
  });

  // Passing upstream.body straight through as the Response body streams it
  // chunk-by-chunk as PocketBase emits events, instead of waiting for the
  // (never-ending) stream to finish before sending anything to the browser.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disables buffering on any intermediary (e.g. nginx) that respects
      // this header — harmless no-op otherwise.
      'X-Accel-Buffering': 'no',
    },
  });
}

// The SDK also POSTs {clientId, subscriptions} to this same path to
// register which collections/records this connection wants events for.
// That's a quick, ordinary request/response (not streaming), so a simple
// pass-through is enough here — no special handling needed.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': req.headers.get('Content-Type') || 'application/json',
      ...(req.headers.get('Authorization') ? { Authorization: req.headers.get('Authorization')! } : {}),
    },
    body,
    cache: 'no-store',
  });

  const text = await upstream.text();

  // PocketBase returns 204 No Content on a successful subscribe. Per the
  // Fetch spec, a Response with a null-body status (204/205/304) must have
  // a literal null body — passing even an empty string throws
  // "Invalid response status code 204" from the Response constructor.
  // This was the actual cause of the 500s the PocketBase SDK was seeing
  // (confirmed via a manual EventSource + subscribe test against this
  // route): the GET/SSE half of this proxy was already working, but every
  // successful subscribe crashed the handler right after.
  const isNullBodyStatus = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;

  return new NextResponse(isNullBodyStatus ? null : text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    },
  });
}
