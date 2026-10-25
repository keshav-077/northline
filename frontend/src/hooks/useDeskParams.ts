import { useEffect, useState } from "react";

const DEFAULTS = { date: "2026-01-14", cutoff: "09:20", strategy: "single_vintage" };

export function useDeskParams() {
  const read = () => new URLSearchParams(window.location.search);
  const [params, setParams] = useState(read);
  useEffect(() => {
    const onPop = () => setParams(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = (key: keyof typeof DEFAULTS) => params.get(key) || DEFAULTS[key];
  const update = (next: Partial<Record<keyof typeof DEFAULTS, string>>) => {
    const updated = new URLSearchParams(window.location.search);
    (Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>).forEach((key) => {
      updated.set(key, next[key] ?? updated.get(key) ?? DEFAULTS[key]);
    });
    window.history.pushState(null, "", `?${updated.toString()}`);
    setParams(updated);
  };
  return {
    date: value("date"),
    cutoff: value("cutoff"),
    strategy: value("strategy"),
    update,
  };
}
