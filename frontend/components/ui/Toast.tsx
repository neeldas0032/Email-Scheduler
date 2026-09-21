'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
type ToastTone = 'success' | 'error';
interface Toast { id: number; tone: ToastTone; message: string; }
const ToastContext = createContext<{ success: (m: string) => void; error: (m: string) => void; }>({ success: () => {}, error: () => {} });
export function useToast() { return useContext(ToastContext); }
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${toast.tone === 'success' ? 'border-green-200 bg-white text-gray-900' : 'border-red-200 bg-white text-gray-900'}`}>
            {toast.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} className="text-muted hover:text-gray-900"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
