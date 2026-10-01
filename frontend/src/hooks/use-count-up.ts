import { useEffect, useState } from 'react';

// Zählt cubic-ease-out von 0 zum Zielwert hoch
export function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    }
    raf = requestAnimationFrame(tick);
    // Reset im Cleanup statt synchron im Effect: ein neues Ziel startet so wieder bei 0
    return () => {
      cancelAnimationFrame(raf);
      setValue(0);
    };
  }, [target, duration]);
  return target ? value : 0;
}
