'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { EmailRecord, StatsResponse, User } from '@/lib/types';
import { Header } from '@/components/Header';
import { CapacityStrip } from '@/components/CapacityStrip';
import { EmailTable } from '@/components/EmailTable';
import { ComposeModal } from '@/components/ComposeModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Tab = 'scheduled' | 'sent';
const POLL_MS = 5000;

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [rows, setRows] = useState<EmailRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const firstLoad = useRef(true);

  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => router.replace('/'));
  }, [router]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const [list, statsRes] = await Promise.all([
        api.listEmails(tab, debounced || undefined),
        api.stats(),
      ]);
      setRows(list.rows);
      setStats(statsRes);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [tab, debounced, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(firstLoad.current);
    void load();
  }, [user, tab, debounced, load]);

  // Keep the table live so scheduled -> sent transitions appear on their own.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [user, load]);

  const cancel = async (id: string) => {
    try {
      await api.cancel(id);
      toast.success('Email cancelled.');
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel that email.');
    }
  };

  if (!user) return <Spinner label="Loading your dashboard" />;

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'scheduled', label: 'Scheduled', count: (stats?.stats.scheduled ?? 0) + (stats?.stats.rate_limited ?? 0) },
    { id: 'sent', label: 'Sent', count: stats?.stats.sent ?? 0 },
  ];

  return (
    <>
      <Header user={user} onLogout={() => router.replace('/')} />

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Campaigns</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              Everything queued, throttled and delivered from your senders.
            </p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4" />
            Compose new email
          </Button>
        </div>

        <CapacityStrip data={stats} />

        <section className="rounded-xl border border-line bg-surface shadow-panel">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
            <div className="flex rounded-lg border border-line bg-ink p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    tab === item.id ? 'bg-raised text-body' : 'text-muted hover:text-body'
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 tabular-nums text-muted">{item.count}</span>
                </button>
              ))}
            </div>

            <div className="relative ml-auto w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipients or subjects"
                className="pl-9"
                aria-label="Search emails"
              />
            </div>
          </div>

          <EmailTable
            tab={tab}
            rows={rows}
            loading={loading}
            error={error}
            searching={Boolean(debounced)}
            onRetry={() => void load()}
            onCompose={() => setComposeOpen(true)}
            onCancel={cancel}
          />
        </section>
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={() => {
          setTab('scheduled');
          void load();
        }}
        defaults={stats?.limits ?? null}
      />
    </>
  );
}
