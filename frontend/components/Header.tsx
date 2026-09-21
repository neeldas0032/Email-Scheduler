'use client';

import { useState } from 'react';
import { LogOut, ExternalLink } from 'lucide-react';
import { api, queueDashboardUrl } from '@/lib/api';
import type { User } from '@/lib/types';
import { Button } from './ui/Button';
import { SlackConnect } from './SlackConnect';

export function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  };

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            R
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Email Scheduler</p>
            <p className="text-xs text-muted">ReachInbox</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SlackConnect />
          <a
            href={queueDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[13px] font-medium leading-8 text-muted transition-colors hover:border-accent/60 hover:text-body sm:inline-flex"
          >
            Queue monitor
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-raised py-1 pl-1 pr-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-line text-xs font-semibold">
                {initials}
              </span>
            )}
            <div className="hidden leading-tight sm:block">
              <p className="text-[13px] font-medium">{user.name}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={logout} loading={busy} aria-label="Log out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
