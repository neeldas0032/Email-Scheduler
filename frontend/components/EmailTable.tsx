'use client';

import { Inbox, MailCheck, ExternalLink } from 'lucide-react';
import type { EmailRecord } from '@/lib/types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { StatusBadge } from './ui/StatusBadge';
import { EmptyState, ErrorState, Spinner } from './ui/States';
import { Button } from './ui/Button';

interface Props {
  tab: 'scheduled' | 'sent';
  rows: EmailRecord[];
  loading: boolean;
  error: string | null;
  searching: boolean;
  onRetry: () => void;
  onCompose: () => void;
  onCancel: (id: string) => void;
}

export function EmailTable({ tab, rows, loading, error, searching, onRetry, onCompose, onCancel }: Props) {
  if (loading) return <Spinner label={tab === 'sent' ? 'Loading sent emails' : 'Loading scheduled emails'} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (rows.length === 0) {
    if (searching) {
      return (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No matches"
          description="No email matches that search. Try a different address or subject."
        />
      );
    }
    return tab === 'scheduled' ? (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title="Nothing scheduled"
        description="Upload a lead list and pick a start time. Emails will queue here until they go out."
        action={<Button onClick={onCompose}>Compose new email</Button>}
      />
    ) : (
      <EmptyState
        icon={<MailCheck className="h-5 w-5" />}
        title="No emails sent yet"
        description="Once the worker delivers your first scheduled email it will show up here with its Ethereal preview link."
      />
    );
  }

  const timeColumn = tab === 'sent' ? 'Sent' : 'Scheduled for';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-muted">
            <th className="px-5 py-3 font-medium">Recipient</th>
            <th className="px-5 py-3 font-medium">Subject</th>
            <th className="px-5 py-3 font-medium">{timeColumn}</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 text-right font-medium">{tab === 'sent' ? 'Preview' : 'Action'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const time = tab === 'sent' ? row.sent_at ?? row.scheduled_at : row.scheduled_at;
            return (
              <tr key={row.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60">
                <td className="max-w-[220px] truncate px-5 py-3">
                  <span className="text-body">{row.to_email}</span>
                  {row.sender_email && (
                    <span className="mt-0.5 block truncate text-xs text-muted">from {row.sender_email}</span>
                  )}
                </td>
                <td className="max-w-[260px] truncate px-5 py-3 text-muted">{row.subject}</td>
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted">
                  {formatDateTime(time)}
                  <span className="ml-2 text-xs text-muted/70">{relativeTime(time)}</span>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.status} />
                  {row.error && <p className="mt-1 max-w-[220px] truncate text-xs text-danger">{row.error}</p>}
                </td>
                <td className="px-5 py-3 text-right">
                  {tab === 'sent' ? (
                    row.preview_url ? (
                      <a
                        href={row.preview_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-[13px] text-muted">—</span>
                    )
                  ) : (
                    <button
                      onClick={() => onCancel(row.id)}
                      className="text-[13px] font-medium text-muted transition-colors hover:text-danger"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
