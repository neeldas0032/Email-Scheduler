'use client';

import type { StatsResponse } from '@/lib/types';

/**
 * The operational heart of the dashboard: how much hourly budget each sender
 * has left, plus the throttle settings the worker is running with. This is what
 * makes the rate limiter visible instead of a number in a config file.
 */
export function CapacityStrip({ data }: { data: StatsResponse | null }) {
  if (!data) {
    return <div className="h-[104px] animate-pulse rounded-xl border border-line bg-surface" />;
  }

  const { stats, senders, limits, usage } = data;
  const resetsAt = usage.windowEndsAt
    ? new Date(usage.windowEndsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  const counters = [
    { label: 'Scheduled', value: stats.scheduled + stats.processing, tone: 'text-accent' },
    { label: 'Waiting on limit', value: stats.rate_limited, tone: 'text-amber' },
    { label: 'Sent', value: stats.sent, tone: 'text-green' },
    { label: 'Failed', value: stats.failed, tone: 'text-danger' },
  ];

  return (
    <section className="rounded-xl border border-line bg-surface shadow-panel">
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-4 sm:divide-x">
        {counters.map((counter) => (
          <div key={counter.label} className="px-5 py-4">
            <p className={`text-2xl font-semibold tabular-nums ${counter.tone}`}>{counter.value}</p>
            <p className="mt-0.5 text-[13px] text-muted">{counter.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-5 px-5 py-4">
        <div className="min-w-[220px] flex-1">
          <p className="mb-3 text-[13px] font-medium text-body">
            Sending capacity this hour
            {resetsAt && <span className="ml-2 font-normal text-muted">resets {resetsAt}</span>}
          </p>
          <div className="space-y-2.5">
            {senders.length === 0 && (
              <p className="text-[13px] text-muted">No sender configured yet.</p>
            )}
            {senders.map((sender) => {
              const pct = Math.min(100, Math.round((sender.usedThisHour / sender.hourlyLimit) * 100));
              const full = pct >= 100;
              return (
                <div key={sender.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate text-muted">{sender.fromEmail}</span>
                    <span className={`tabular-nums ${full ? 'text-amber' : 'text-muted'}`}>
                      {sender.usedThisHour}/{sender.hourlyLimit}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        full ? 'bg-amber' : 'bg-accent'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <dt className="text-muted">Worker concurrency</dt>
          <dd className="tabular-nums">{limits.concurrency}</dd>
          <dt className="text-muted">Min gap between sends</dt>
          <dd className="tabular-nums">{limits.minDelayMs / 1000}s</dd>
          <dt className="text-muted">Account limit</dt>
          <dd className="tabular-nums">
            {usage.globalThisHour}/{limits.globalPerHour} per hour
          </dd>
        </dl>
      </div>
    </section>
  );
}
