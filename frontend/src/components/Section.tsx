import type { ReactNode } from "react";

export function Section({ children }: { children: ReactNode }) {
  return <section className="sec">{children}</section>;
}
