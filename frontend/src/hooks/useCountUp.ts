import { useEffect, useRef, useState } from "react";

export function useCountUp(value: number | null, reduced: boolean): number | null {
  const [shown, setShown] = useState<number | null>(reduced || value == null ? value : 0);
  const from = useRef(reduced ? (value ?? 0) : 0);

  useEffect(() => {
    if (value == null) {
      setShown(null);
      return;
    }
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / 500);
      const eased = 1 - (1 - progress) ** 3;
      const next = start + (value - start) * eased;
      from.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);

  return shown;
}
