import type { ReactNode } from "react";

export function DeskLayout({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <>
      {header}
      <main className="w">{children}</main>
    </>
  );
}
