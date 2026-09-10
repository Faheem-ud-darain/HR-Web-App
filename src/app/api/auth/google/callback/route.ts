import { NextResponse } from 'next/server';
import { adminSetKV } from '@/lib/pbAdmin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !stateRaw) {
    return new Response(
      `<html><body><script>
        window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error || 'Missing code or state'}' }, '*');
      </script></body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  }

  let state: any = {};
  try {
    state = JSON.parse(decodeURIComponent(stateRaw));
  } catch (err) {
    // fallback
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = `${new URL(request.url).origin}/api/auth/google/callback`;

  try {
    // 1. Exchange auth code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || 'Token exchange failed');
    }

    // 2. Fetch user profile from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    const targetEmail = state.email || userData.email;

    // 3. Store Google integration overlay payload server side in PocketBase KV
    const kvValue = {
      connectedEmail: userData.email,
      connectedAt: new Date().toISOString(),
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      },
      syncCalendar: true,
      useFor2FA: true,
      useForPasswordReset: true,
    };

    // Save via the server-only PocketBase admin (superuser) connection —
    // this used to be a raw, unauthenticated fetch straight to
    // hr_delcargo_store's public REST endpoint, meaning anyone on the
    // internet could read (and overwrite) every employee's Google OAuth
    // access/refresh tokens by listing that collection directly. See plan
    // 012's hr_delcargo_store investigation notes for the full context —
    // this route was the single worst exposure found there.
    const storeKey = `google_integration_${String(targetEmail).toLowerCase()}`;
    // adminSetKV itself checks for an existing row (via adminGetKV) and
    // PATCHes it, or POSTs a new one — no need to duplicate that check here.
    await adminSetKV(storeKey, kvValue);

    return new Response(
      `<html><body><script>
        window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', email: '${userData.email}' }, '*');
      </script></body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  } catch (err: any) {
    return new Response(
      `<html><body><script>
        window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: ${JSON.stringify(err.message)} }, '*');
      </script></body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  }
}
