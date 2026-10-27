// Not a client module on purpose: layout.tsx (a server component) reads this string.
export const THEME_KEY = 'dc-theme';

// Runs in <head> before the first paint, so a dark-mode user never sees a white flash. Keep it
// dependency-free and in step with resolveTheme() in theme.ts.
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');if(p!=='light'&&p!=='dark')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;
