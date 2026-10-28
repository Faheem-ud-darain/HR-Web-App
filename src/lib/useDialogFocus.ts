import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keyboard users: move focus into a dialog when it opens, keep Tab inside it while it is open, and give focus
// back to whatever opened it when it closes. Only the topmost dialog traps, so dialogs can open over each other.
// `openedFrom` is what had focus when it opened, if the caller read that before the dialog's own content took focus.
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, active: boolean, openedFrom?: HTMLElement | null) {
  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const opener = openedFrom ?? (document.activeElement as HTMLElement | null);
    if (dialog && !dialog.contains(document.activeElement)) {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      (first || dialog).focus();
    }
    const trap = (e: KeyboardEvent) => {
      const dlg = dialogRef.current;
      if (e.key !== 'Tab' || !dlg) return;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dlg) return;
      const current = document.activeElement;
      // Focus is inside some other overlay (a popup): leave it alone.
      if (current && current !== document.body && !dlg.contains(current)) return;
      const items = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (current === first || !dlg.contains(current))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (current === last || !dlg.contains(current))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [dialogRef, active, openedFrom]);
}
