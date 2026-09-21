'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const base =
  'w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-body placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none disabled:opacity-60';

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label className="text-[13px] font-medium text-body">{children}</label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} h-10 ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} resize-y leading-relaxed ${className}`} {...props} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}
