import type { EmailStatus } from '@/lib/types';

const styles: Record<EmailStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'border-accent/40 text-accent' },
  processing: { label: 'Sending', className: 'border-accent/40 text-accent' },
  rate_limited: { label: 'Waiting on limit', className: 'border-amber/40 text-amber' },
  sent: { label: 'Sent', className: 'border-green/40 text-green' },
  failed: { label: 'Failed', className: 'border-danger/40 text-danger' },
  cancelled: { label: 'Cancelled', className: 'border-line text-muted' },
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  const style = styles[status] ?? styles.scheduled;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
