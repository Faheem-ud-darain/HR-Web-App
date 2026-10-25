import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMobileDevice } from './trackerSetup';

type Env = { ua: string; platform?: string; touch?: number; coarse?: boolean; hover?: boolean; capacitor?: boolean };

function setEnv({ ua, platform = '', touch = 0, coarse = false, hover = true, capacitor = false }: Env) {
  vi.stubGlobal('navigator', { userAgent: ua, platform, maxTouchPoints: touch });
  vi.stubGlobal('window', {
    Capacitor: capacitor ? { isNativePlatform: () => true } : undefined,
    matchMedia: (q: string) => ({ matches: q.includes('pointer: coarse') ? coarse : q.includes('hover: none') ? !hover : false }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('isMobileDevice (Pakistan manual shifts must never start from a phone or tablet)', () => {
  it('blocks the native app, phones and tablets', () => {
    setEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', capacitor: true });
    expect(isMobileDevice()).toBe(true);
    setEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' });
    expect(isMobileDevice()).toBe(true);
    setEnv({ ua: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126 Safari/537.36' }); // Android tablet, no "Mobile"
    expect(isMobileDevice()).toBe(true);
  });

  it('blocks an iPad, which reports itself as a Mac', () => {
    setEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', platform: 'MacIntel', touch: 5 });
    expect(isMobileDevice()).toBe(true);
  });

  it('blocks "Request desktop site" on an Android phone or tablet', () => {
    setEnv({ ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36', touch: 5, coarse: true, hover: false });
    expect(isMobileDevice()).toBe(true);
  });

  it('allows desktops, touch laptops and Chromebooks', () => {
    setEnv({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' });
    expect(isMobileDevice()).toBe(false);
    setEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', platform: 'MacIntel', touch: 0 });
    expect(isMobileDevice()).toBe(false);
    setEnv({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126', touch: 10 }); // touch laptop: fine pointer, can hover
    expect(isMobileDevice()).toBe(false);
    setEnv({ ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126', touch: 10, coarse: true, hover: false });
    expect(isMobileDevice()).toBe(false);
  });
});
