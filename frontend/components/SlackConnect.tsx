'use client';

import { useEffect, useState } from 'react';
import { Slack } from 'lucide-react';
import { api, slackInstallUrl } from '@/lib/api';
import type { SlackStatus } from '@/lib/types';
import { useToast } from './ui/Toast';

export function SlackConnect() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const toast = useToast();

  const load = () => {
    api
      .slackStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      toast.success('Slack connected. Rate-limit alerts will post to your channel.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('slack') === 'error') {
      toast.error('Slack connection failed. Check the app credentials and try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) return null;

  if (!status.connected) {
    return (
      <a
        href={slackInstallUrl}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[13px] font-medium leading-8 text-muted transition-colors hover:border-accent/60 hover:text-body"
      >
        <Slack className="h-3.5 w-3.5" />
        Connect Slack
      </a>
    );
  }

  const sendTest = async () => {
    try {
      const res = await api.slackTest();
      if (res.ok) toast.success('Test message posted to Slack.');
      else toast.error('Slack rejected the message. Reconnect the workspace.');
    } catch {
      toast.error('Could not reach Slack.');
    }
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-green/30 bg-raised pl-3 pr-1 leading-8">
      <Slack className="h-3.5 w-3.5 text-green" />
      <span className="text-[13px] text-muted">{status.channel ?? status.teamName ?? 'Slack'}</span>
      <button onClick={sendTest} className="rounded px-2 text-[13px] font-medium text-accent hover:underline">
        Test
      </button>
    </div>
  );
}
