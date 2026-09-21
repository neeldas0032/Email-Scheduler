'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { EmailRecord, StatsResponse, User } from '@/lib/types';
import { Sidebar } from '@/components/Sidebar';
import { EmailList } from '@/components/EmailList';
import { useToast } from '@/components/ui/Toast';

type Tab = 'scheduled' | 'sent';

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
  const firstLoad = useRef(true);

  useEffect(() => { api.me().then((res) => setUser(res.user)).catch(() => router.replace('/')); }, [router]);
  useEffect(() => { const id = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(id); }, [search]);

  const load = useCallback(async () => {
    try {
      const [list, statsRes] = await Promise.all([api.listEmails(tab, debounced || undefined), api.stats()]);
      setRows(list.rows); setStats(statsRes); setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { router.replace('/'); return; }
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally { setLoading(false); firstLoad.current = false; }
  }, [tab, debounced, router]);

  useEffect(() => { if (!user) return; setLoading(firstLoad.current); void load(); }, [user, tab, debounced, load]);
  useEffect(() => { if (!user) return; const id = setInterval(() => void load(), 5000); return () => clearInterval(id); }, [user, load]);

  const cancel = async (id: string) => {
    try { await api.cancel(id); toast.success('Cancelled.'); void load(); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not cancel.'); }
  };

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar user={user} tab={tab} onTabChange={setTab} stats={stats}
        onCompose={() => router.push('/compose')}
        onLogout={() => api.logout().finally(() => router.replace('/'))} />
      <EmailList tab={tab} rows={rows} loading={loading} error={error}
        search={search} onSearchChange={setSearch}
        onRetry={() => void load()} onCompose={() => router.push('/compose')} onCancel={cancel} />
    </div>
  );
}
