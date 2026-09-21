'use client';
import { useState } from 'react';
import { Clock, Send, LogOut, ChevronDown } from 'lucide-react';
import { api, slackInstallUrl } from '@/lib/api';
import type { User, StatsResponse } from '@/lib/types';

type Tab = 'scheduled' | 'sent';
interface Props {
  user: User; tab: Tab;
  onTabChange: (tab: Tab) => void;
  stats: StatsResponse | null;
  onCompose: () => void;
  onLogout: () => void;
}

export function Sidebar({ user, tab, onTabChange, stats, onCompose, onLogout }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const scheduledCount = stats ? stats.stats.scheduled + stats.stats.rate_limited + stats.stats.processing : 0;
  const sentCount = stats?.stats.sent ?? 0;
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="px-5 pt-5 pb-4"><span className="text-2xl font-black tracking-tight text-gray-900">ONB</span></div>
      <div className="relative mx-4 mb-4">
        <button onClick={() => setShowDropdown(!showDropdown)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-600">{user.name.charAt(0)}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <a href={slackInstallUrl} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Connect Slack</a>
            <button onClick={() => { setShowDropdown(false); onLogout(); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><LogOut className="h-3.5 w-3.5" />Log out</button>
          </div>
        )}
      </div>
      <div className="px-4 mb-5">
        <button onClick={onCompose} className="flex h-10 w-full items-center justify-center rounded-lg border-2 border-green-500 text-sm font-semibold text-green-600 hover:bg-green-50">Compose</button>
      </div>
      <div className="px-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Core</p>
        <nav className="space-y-0.5">
          <button onClick={() => onTabChange('scheduled')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'scheduled' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
            <Clock className="h-4 w-4" /><span className="flex-1 text-left">Scheduled</span><span className="text-xs text-gray-400">{scheduledCount}</span>
          </button>
          <button onClick={() => onTabChange('sent')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'sent' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
            <Send className="h-4 w-4" /><span className="flex-1 text-left">Sent</span><span className="text-xs text-gray-400">{sentCount}</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
