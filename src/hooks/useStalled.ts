import { useEffect, useState } from 'react';

// True once `active` has stayed true for `ms` milliseconds without a break: lets a loading screen admit it is taking too long.
export function useStalled(active: boolean, ms: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStalled(active), active ? ms : 0);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && stalled;
}
