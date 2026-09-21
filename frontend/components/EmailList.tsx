'use client';
import { Search, Filter, RefreshCw, Star, Inbox, MailCheck } from 'lucide-react';
import type { EmailRecord } from '@/lib/types';

interface Props {
  tab: 'scheduled' | 'sent'; rows: EmailRecord[]; loading: boolean; error: string | null;
  search: string; onSearchChange: (v: string) => void;
  onRetry: () => void; onCompose: () => void; onCancel: (id: string) => void;
}

function TimeBadge({ time, status }: { time: string; status: string }) {
  const d = new Date(time);
  const label = d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (status === 'sent') return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Sent</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600"><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>{label}</span>;
}

export function EmailList({ tab, rows, loading, error, search, onSearchChange, onRetry, onCompose, onCancel }: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-green-400 focus:outline-none" />
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50"><Filter className="h-4 w-4" /></button>
        <button onClick={onRetry} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading…</div>}
        {error && <div className="flex flex-col items-center justify-center py-20 text-center"><p className="text-sm text-red-500">{error}</p><button onClick={onRetry} className="mt-2 text-sm font-medium text-green-600 hover:underline">Try again</button></div>}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {tab === 'scheduled' ? (<><Inbox className="mb-3 h-10 w-10 text-gray-300" /><p className="text-sm font-medium text-gray-900">Nothing scheduled</p><button onClick={onCompose} className="mt-4 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600">Compose</button></>) : (<><MailCheck className="mb-3 h-10 w-10 text-gray-300" /><p className="text-sm font-medium text-gray-900">No emails sent yet</p></>)}
          </div>
        )}
        {!loading && !error && rows.map((row) => {
          const time = tab === 'sent' ? (row.sent_at ?? row.scheduled_at) : row.scheduled_at;
          const name = row.to_email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <div key={row.id} className="group flex items-center gap-4 border-b border-gray-100 px-6 py-3.5 hover:bg-gray-50">
              <div className="w-36 shrink-0"><span className="text-sm font-medium text-gray-900">To: {name}</span></div>
              <TimeBadge time={time} status={row.status} />
              <div className="min-w-0 flex-1"><span className="text-sm font-semibold text-gray-900">{row.subject}</span><span className="text-sm text-gray-400"> - {row.body?.slice(0, 70)}…</span></div>
              <div className="flex shrink-0 items-center gap-2">
                {tab === 'scheduled' && (row.status === 'scheduled' || row.status === 'rate_limited') && <button onClick={() => onCancel(row.id)} className="invisible text-xs font-medium text-red-500 hover:underline group-hover:visible">Cancel</button>}
                {tab === 'sent' && row.preview_url && <a href={row.preview_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-green-600 hover:underline">Preview</a>}
                <Star className="h-4 w-4 text-gray-200 hover:text-yellow-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
