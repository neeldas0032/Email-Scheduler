import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? 'Loading'}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-muted">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-body">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h3 className="text-sm font-semibold text-danger">Could not load emails</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-[13px] font-medium text-accent hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
