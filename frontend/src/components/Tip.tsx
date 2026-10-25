import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  x: number;
  y: number;
  lines: string[];
}

export function Tip({ x, y, lines }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 14, top: y - 12 });
  const signature = lines.join("|");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({
      left: Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 8, x + 14)),
      top: Math.max(6, y - el.offsetHeight - 12),
    });
  }, [signature, x, y]);

  return (
    <div ref={ref} className="tip m" style={{ left: pos.left, top: pos.top }}>
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
