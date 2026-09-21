'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, Clock, X, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { extractEmails, toLocalInputValue } from '@/lib/format';
import type { StatsResponse, User } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

export default function ComposePage() {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60_000)));
  const [showSchedule, setShowSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.me().then((res) => setUser(res.user)).catch(() => router.replace('/'));
    api.stats().then((res) => {
      setDelaySeconds(res.limits.minDelayMs / 1000);
      setHourlyLimit(res.limits.perSenderPerHour);
      if (res.senders.length > 0) setSenderEmail(res.senders[0].fromEmail);
    }).catch(() => {});
  }, [router]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const found = extractEmails(text);
      setRecipients(found);
      if (found.length === 0) toast.error('No email addresses found.');
      else toast.success(`${found.length} addresses detected`);
    } catch { toast.error('Could not read file.'); }
  };

  const submit = async () => {
    if (!subject.trim()) { toast.error('Add a subject.'); return; }
    if (!body.trim()) { toast.error('Write the body.'); return; }
    if (recipients.length === 0) { toast.error('Upload a lead list first.'); return; }
    setSubmitting(true);
    try {
      const result = await api.schedule({ subject: subject.trim(), body: body.trim(), recipients, startAt: new Date(startAt).toISOString(), delayMs: Math.round(delaySeconds * 1000), hourlyLimit });
      toast.success(`Scheduled ${result.count} email${result.count === 1 ? '' : 's'}`);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not schedule.');
    } finally { setSubmitting(false); }
  };

  const quickSlots = [
    { label: 'Tomorrow', h: 9 }, { label: 'Tomorrow, 10:00 AM', h: 10 },
    { label: 'Tomorrow, 11:00 AM', h: 11 }, { label: 'Tomorrow, 3:00 PM', h: 15 },
  ];

  const visible = recipients.slice(0, 3);
  const extra = recipients.length - 3;
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInput.current?.click()} className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <Paperclip className="h-5 w-5" />
            {recipients.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">{recipients.length > 9 ? '9+' : recipients.length}</span>}
          </button>
          <div className="relative">
            <button onClick={() => setShowSchedule(!showSchedule)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><Clock className="h-5 w-5" /></button>
            {showSchedule && (
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                <p className="mb-3 text-sm font-semibold text-gray-900">Send Later</p>
                <p className="mb-1 text-xs text-gray-400">Pick date & time</p>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mb-3 h-8 w-full rounded border border-gray-200 px-2 text-xs focus:border-green-400 focus:outline-none" />
                <div className="space-y-0.5">
                  {quickSlots.map((qs) => (
                    <button key={qs.label} onClick={() => { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(qs.h,0,0,0); setStartAt(toLocalInputValue(d)); }} className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{qs.label}</button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setShowSchedule(false)} className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50">Cancel</button>
                  <button onClick={() => setShowSchedule(false)} className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600">Done</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={submit} disabled={submitting} className="rounded-lg border-2 border-green-500 px-5 py-1.5 text-sm font-semibold text-green-600 hover:bg-green-50 disabled:opacity-50">
            {submitting ? 'Scheduling…' : 'Send Later'}
          </button>
        </div>
      </header>
      <input ref={fileInput} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-4">
        <div className="flex items-center gap-4 border-b border-gray-100 py-3">
          <label className="w-16 shrink-0 text-sm text-gray-400">From</label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
            {senderEmail || user.email}
            <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="flex items-center gap-4 border-b border-gray-100 py-3">
          <label className="w-16 shrink-0 text-sm text-gray-400">To</label>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {recipients.length === 0 ? <span className="text-sm text-gray-300">recipient@example.com</span> : (
              <>
                {visible.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {email}<button onClick={() => setRecipients((p) => p.filter((r) => r !== email))} className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {extra > 0 && <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-gray-700">+{extra}</span>}
              </>
            )}
          </div>
          <button onClick={() => fileInput.current?.click()} className="shrink-0 flex items-center gap-1 text-sm font-medium text-green-600 hover:underline"><Upload className="h-3.5 w-3.5" />Upload List</button>
        </div>
        <div className="flex items-center gap-4 border-b border-gray-100 py-3">
          <label className="w-16 shrink-0 text-sm text-gray-400">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none" />
        </div>
        <div className="flex items-center gap-6 border-b border-gray-100 py-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Delay between 2 emails</label>
            <input type="number" min={0} value={delaySeconds} onChange={(e) => setDelaySeconds(Number(e.target.value))} className="h-8 w-16 rounded border border-gray-200 px-2 text-center text-sm focus:border-green-400 focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Hourly Limit</label>
            <input type="number" min={1} value={hourlyLimit} onChange={(e) => setHourlyLimit(Number(e.target.value))} className="h-8 w-16 rounded border border-gray-200 px-2 text-center text-sm focus:border-green-400 focus:outline-none" />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-gray-100 pb-2">
            {['↩','↪','Tt','B','I','U','≡','⊞','⊟','❝','S'].map((icon, i) => (
              <button key={i} className="flex h-7 w-7 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-100">{icon}</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type Your Reply..." rows={16} className="w-full resize-none text-sm leading-relaxed text-gray-900 placeholder:text-gray-300 focus:outline-none" />
        </div>
      </div>
    </div>
  );
}
