import { useLayoutEffect, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
}

export function Segment({ label, value, options, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, x: 0 });
  const signature = options.map((option) => `${option.id}:${option.label}:${option.count ?? ""}`).join("|");

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!active) return;
      const width = active.offsetWidth;
      const x = active.offsetLeft;
      setBox((prev) => (prev.width === width && prev.x === x ? prev : { width, x }));
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(root);
    }
    let cancel = false;
    void document.fonts?.ready.then(() => {
      if (!cancel) measure();
    });
    return () => {
      cancel = true;
      observer?.disconnect();
    };
  }, [signature, value]);

  return (
    <div className="seg" role="group" aria-label={label} ref={ref}>
      <i className="ind" aria-hidden="true" style={{ width: box.width, transform: `translateX(${box.x}px)` }} />
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={selected ? "on" : undefined}
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {option.count != null ? <em>{option.count}</em> : null}
          </button>
        );
      })}
    </div>
  );
}
