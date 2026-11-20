// Anything (a menu item, an error screen) can ask the one "Report a problem" popup to open.
const EVENT = 'delcargo:report-problem';
export const openProblemReport = (): void => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };
export const onOpenProblemReport = (fn: () => void): (() => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};
