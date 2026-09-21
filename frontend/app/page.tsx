'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, googleLoginUrl } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError('Sign-in did not complete. Please try again.');

    api
      .me()
      .then(() => router.replace('/dashboard'))
      .catch(() => setChecking(false));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-base font-bold text-white">
            R
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Email Scheduler</p>
            <p className="text-[13px] text-muted">ReachInbox</p>
          </div>
        </div>

        <h1 className="text-2xl font-semibold leading-snug">
          Queue thousands of emails. Send them at a human pace.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Schedule a lead list, set an hourly ceiling, and watch every send land on time — even after a restart.
        </p>

        <a
          href={googleLoginUrl}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-lg bg-body font-medium text-ink transition-colors hover:bg-white"
        >
          <GoogleMark />
          Continue with Google
        </a>

        {checking && <p className="mt-4 text-center text-[13px] text-muted">Checking your session…</p>}
        {error && <p className="mt-4 text-center text-[13px] text-danger">{error}</p>}

        <p className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-muted">
          Emails are delivered through Ethereal, a fake SMTP service. Nothing reaches a real inbox — every message
          gets a preview link instead.
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
