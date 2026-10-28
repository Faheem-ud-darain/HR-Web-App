import { useEffect, useRef, useState } from 'react';

// True while the page scrolls up or sits at the top; false while it scrolls down. The phone tab bar uses it to slide
// away while you read and come back as soon as you scroll up. Listens in the capture phase so it also hears the
// page's own scrolling container (<main>), not only the window.
export function useHideOnScroll(resetKey: unknown): boolean {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      let y = 0;
      if (target === document || target === document.documentElement || (target as unknown) === window) {
        y = window.scrollY || document.documentElement.scrollTop || 0;
      } else if (target instanceof HTMLElement && (target.tagName === 'MAIN' || target.classList.contains('overflow-y-auto'))) {
        y = target.scrollTop;
      } else {
        return;
      }
      if (y <= 10) setVisible(true);
      else if (y - lastY.current > 5) setVisible(false);
      else if (y - lastY.current < -5) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [resetKey]);

  return visible;
}
