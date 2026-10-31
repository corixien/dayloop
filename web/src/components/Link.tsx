import type { AnchorHTMLAttributes } from "react";

/** Hash-route link. */
export function Link({ to, ...p }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={`#${to}`} {...p} />;
}
