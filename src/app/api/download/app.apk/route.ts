import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get('url');

    if (!encodedUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

    const res = await fetch(targetUrl);
    if (!res.ok) {
      return new NextResponse('Failed to fetch file from source', { status: res.status });
    }

    const headers = new Headers();
    
    // CRITICAL for Android: Prevents Chrome and Android DownloadManager from sniffing PK zip signature and renaming .apk to .zip
    headers.set('X-Content-Type-Options', 'nosniff');
    
    // Forcibly set the Android Package MIME type so Android system installer recognizes it as an APK file, not a ZIP archive
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    
    // Forcibly tell the browser/downloader this is an APK attachment file named DelCargo-HR.apk
    headers.set('Content-Disposition', 'attachment; filename="DelCargo-HR.apk"; filename*=UTF-8\'\'DelCargo-HR.apk');

    const contentLength = res.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new NextResponse(res.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Proxy download failed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
