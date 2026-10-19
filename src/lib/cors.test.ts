import { describe, it, expect } from 'vitest';
import { allowedOrigin, corsHeaders } from './cors';

describe('allowedOrigin', () => {
  it.each([
    'https://hub.delcargo.us',
    'capacitor://localhost',
    'https://localhost',
    'http://localhost:3100',
    'https://hr-web-app.pages.dev',
    'https://96a85205.hr-web-app.pages.dev',
  ])('allows %s', origin => expect(allowedOrigin(origin)).toBe(origin));

  it.each([
    'https://evil.example',
    'https://hub.delcargo.us.evil.example',
    'https://evilhub.delcargo.us',
    'http://hub.delcargo.us', // wrong scheme
    'https://other.pages.dev',
    'https://xhr-web-app.pages.dev',
    'http://localhost.evil.example',
    'null',
  ])('rejects %s', origin => expect(allowedOrigin(origin)).toBeNull());

  it('treats a missing Origin (same-origin / non-browser) as not needing CORS', () => {
    expect(allowedOrigin(null)).toBeNull();
    expect(allowedOrigin(undefined)).toBeNull();
  });
});

describe('corsHeaders', () => {
  it('echoes an allowed origin (never *) and varies on Origin', () => {
    const h = corsHeaders('capacitor://localhost');
    expect(h['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    expect(h.Vary).toBe('Origin');
  });
  it('sends no allow-origin for a disallowed origin', () => {
    const h = corsHeaders('https://evil.example');
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
    expect(h.Vary).toBe('Origin');
  });
});
