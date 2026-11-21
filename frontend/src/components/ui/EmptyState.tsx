import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center rounded-2xl px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">
        <Icon className="h-8 w-8" aria-hidden />
      </div>
      <h3 className="mt-5 font-display text-lg font-bold uppercase tracking-wide">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
