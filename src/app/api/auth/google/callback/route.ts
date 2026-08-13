import { NextResponse } from 'next/server';

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

    // Save to PocketBase server KV store via internal API
    const pbUrl = process.env.NEXT_PUBLIC_PB_URL || 'https://pb.delcargo.us';
    const storeKey = `google_integration_${String(targetEmail).toLowerCase()}`;

    // Find existing or create
    const checkRes = await fetch(`${pbUrl}/api/collections/hr_delcargo_store/records?filter=(key='${storeKey}')`);
    const checkData = await checkRes.json();
    const existing = checkData.items?.[0];

    if (existing) {
      await fetch(`${pbUrl}/api/collections/hr_delcargo_store/records/${existing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: kvValue }),
      });
    } else {
      await fetch(`${pbUrl}/api/collections/hr_delcargo_store/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: storeKey, value: kvValue }),
      });
    }

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
