'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { extractEmails, toLocalInputValue } from '@/lib/format';
import type { StatsResponse } from '@/lib/types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FieldError, Input, Label, Textarea } from './ui/Field';
import { useToast } from './ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  defaults: StatsResponse['limits'] | null;
}

export function ComposeModal({ open, onClose, onScheduled, defaults }: Props) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date(Date.now() + 60_000)));
  const [delaySeconds, setDelaySeconds] = useState(() => (defaults ? defaults.minDelayMs / 1000 : 2));
  const [hourlyLimit, setHourlyLimit] = useState(() => defaults?.perSenderPerHour ?? 100);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const minDelaySeconds = useMemo(() => (defaults ? defaults.minDelayMs / 1000 : 0), [defaults]);
  const touched = useRef(false);

  // Adopt the server's configured throttle/limit once stats arrive, unless the
  // user has already typed their own values.
  useEffect(() => {
    if (!defaults || touched.current) return;
    setDelaySeconds(defaults.minDelayMs / 1000);
    setHourlyLimit(defaults.perSenderPerHour);
  }, [defaults]);

  const reset = () => {
    setSubject('');
    setBody('');
    setRecipients([]);
    setFileName(null);
    setErrors({});
    setStartAt(toLocalInputValue(new Date(Date.now() + 60_000)));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const found = extractEmails(text);
      setRecipients(found);
      setFileName(file.name);
      setErrors((prev) => ({ ...prev, recipients: '' }));
      if (found.length === 0) {
        toast.error('No email addresses found in that file.');
      }
    } catch {
      toast.error('Could not read that file.');
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!subject.trim()) next.subject = 'Add a subject line.';
    if (!body.trim()) next.body = 'Write the email body.';
    if (recipients.length === 0) next.recipients = 'Upload a CSV or text file of leads.';
    if (!startAt) next.startAt = 'Pick when sending should begin.';
    if (delaySeconds < minDelaySeconds) next.delay = `The server enforces a minimum of ${minDelaySeconds}s.`;
    if (hourlyLimit < 1) next.hourlyLimit = 'Must be at least 1.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await api.schedule({
        subject: subject.trim(),
        body: body.trim(),
        recipients,
        startAt: new Date(startAt).toISOString(),
        delayMs: Math.round(delaySeconds * 1000),
        hourlyLimit,
      });
      toast.success(
        `Scheduled ${result.count} email${result.count === 1 ? '' : 's'}` +
          (result.skippedDuplicates ? `, skipped ${result.skippedDuplicates} duplicate addresses` : '') +
          '.'
      );
      reset();
      onScheduled();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not schedule these emails.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Compose new email"
      description="One message, one lead list. The scheduler spaces the sends for you."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Schedule {recipients.length > 0 ? `${recipients.length} email${recipients.length === 1 ? '' : 's'}` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question about your outbound setup"
          />
          <FieldError>{errors.subject}</FieldError>
        </div>

        <div>
          <Label hint={`${body.length} characters`}>Body</Label>
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'Hi there,\n\nI noticed your team is scaling outbound...'}
          />
          <FieldError>{errors.body}</FieldError>
        </div>

        <div>
          <Label hint="CSV or TXT">Lead list</Label>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line bg-ink px-4 py-4 text-left transition-colors hover:border-accent/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-muted">
              {fileName ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-body">{fileName ?? 'Choose a file of leads'}</span>
              <span className="block text-[13px] text-muted">
                {fileName
                  ? `${recipients.length} unique address${recipients.length === 1 ? '' : 'es'} detected`
                  : 'Every address in the file is extracted and deduplicated'}
              </span>
            </span>
          </button>
          <FieldError>{errors.recipients}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Start time</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <FieldError>{errors.startAt}</FieldError>
          </div>
          <div>
            <Label hint={`min ${minDelaySeconds}s`}>Delay between emails</Label>
            <Input
              type="number"
              min={minDelaySeconds}
              step={1}
              value={delaySeconds}
              onChange={(e) => {
                touched.current = true;
                setDelaySeconds(Number(e.target.value));
              }}
            />
            <FieldError>{errors.delay}</FieldError>
          </div>
          <div>
            <Label>Emails per hour</Label>
            <Input
              type="number"
              min={1}
              value={hourlyLimit}
              onChange={(e) => {
                touched.current = true;
                setHourlyLimit(Number(e.target.value));
              }}
            />
            <FieldError>{errors.hourlyLimit}</FieldError>
          </div>
        </div>

        {recipients.length > 0 && (
          <p className="rounded-lg border border-line bg-raised px-4 py-3 text-[13px] leading-relaxed text-muted">
            Sending starts {new Date(startAt).toLocaleString()} and takes about{' '}
            {Math.max(1, Math.round((recipients.length * delaySeconds) / 60))} minutes at this spacing. Anything over{' '}
            {hourlyLimit} in an hour rolls into the next hour automatically.
          </p>
        )}
      </div>
    </Modal>
  );
}
