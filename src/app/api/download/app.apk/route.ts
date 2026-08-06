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

    const headers = new Headers(res.headers);
    
    // Forcibly set the Android Package MIME type
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    
    // Forcibly tell the browser this is an attachment download, not a web page
    const fallbackName = targetUrl.split('/').pop() || 'app-release.apk';
    let filename = fallbackName.split('?')[0]; // remove query params
    filename = filename.toLowerCase().endsWith('.apk') ? filename : `${filename}.apk`;
    
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (error) {
    console.error('Proxy download failed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
