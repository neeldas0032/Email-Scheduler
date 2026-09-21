import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />{label ?? 'Loading'}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-gray-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm text-red-500">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 text-sm font-medium text-green-600 hover:underline">Try again</button>}
    </div>
  );
}
