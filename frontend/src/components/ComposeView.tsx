'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';
import { api } from '@/lib/api';
import { Sender } from '@/types';
import { SendLaterPopover } from './SendLaterPopover';

import 'react-quill-new/dist/quill.snow.css';

// Dynamic import — react-quill is client-only
const ReactQuill = dynamic(() => import('react-quill-new'), {
  ssr: false,
  loading: () => (
    <div className="skeleton h-[200px] m-3 rounded" />
  ),
});

interface ComposeViewProps {
  onBack: () => void;
  onScheduled?: (isImmediate?: boolean) => void;
  userId?: string;
}

interface RecipientChip {
  email: string;
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ComposeView — Full-page compose screen matching Figma Screens 5, 6, 7
// - From: sender dropdown
// - To: text input + CSV upload + recipient chips
// - Subject, Delay, Hourly Limit inputs
// - Rich text body (react-quill)
// - Send button + Send Later popover with date picker + presets
// ─────────────────────────────────────────────────────────────────────────────
export function ComposeView({ onBack, onScheduled, userId }: ComposeViewProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [attachments, setAttachments] = useState<{ file: File; id: string }[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [startTime, setStartTime] = useState('');
  const [showSendLater, setShowSendLater] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Load senders
  useEffect(() => {
    api.getSenders().then(({ data }) => {
      if (data?.senders) {
        setSenders(data.senders);
        if (data.senders.length > 0) setSelectedSenderId(data.senders[0].id);
      }
    });
  }, []);

  // Add recipient from input (on comma or Enter)
  const addRecipientFromInput = useCallback(() => {
    const email = recipientInput.trim().toLowerCase();
    if (!email) return;
    if (!isValidEmail(email)) {
      setError(`Invalid email: ${email}`);
      return;
    }
    if (recipients.some((r) => r.email === email)) return;

    setRecipients((prev) => [...prev, { email, id: crypto.randomUUID() }]);
    setRecipientInput('');
    setError(null);
  }, [recipientInput, recipients]);

  const handleRecipientKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipientFromInput();
    }
    if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  };

  const removeRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  };

  // CSV upload — parse and extract email addresses
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<string[]>(file, {
      complete: (result) => {
        const emails: string[] = [];

        result.data.forEach((row) => {
          // Check every cell in the row for valid emails
          row.forEach((cell) => {
            const trimmed = cell.trim().toLowerCase();
            if (isValidEmail(trimmed) && !recipients.some((r) => r.email === trimmed)) {
              emails.push(trimmed);
            }
          });
        });

        if (emails.length > 0) {
          setRecipients((prev) => [
            ...prev,
            ...emails.map((email) => ({ email, id: crypto.randomUUID() })),
          ]);
          setSuccess(`${emails.length} email address${emails.length !== 1 ? 'es' : ''} detected from file`);
          setTimeout(() => setSuccess(null), 4000);
        } else {
          setError('No valid email addresses found in the file');
        }
      },
      error: () => setError('Failed to parse file'),
    });

    // Reset file input
    e.target.value = '';
  };

  // Attachment upload handler
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachments((prev) => [
        ...prev,
        ...files.map((f) => ({ file: f, id: crypto.randomUUID() })),
      ]);
    }
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Handle schedule submission
  const handleSchedule = async (scheduleTime?: string) => {
    setError(null);

    if (recipients.length === 0) {
      setError('Add at least one recipient');
      return;
    }
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!body.trim()) {
      setError('Email body is required');
      return;
    }
    if (!selectedSenderId) {
      setError('Select a sender');
      return;
    }

    const effectiveStartTime = scheduleTime || new Date().toISOString();

    setSending(true);
    try {
      const apiAttachments = await Promise.all(
        attachments.map(async ({ file }) => {
          const base64 = await fileToBase64(file);
          return {
            filename: file.name,
            content: base64,
            contentType: file.type,
          };
        })
      );

      const { data, error: apiError } = await api.scheduleEmails({
        subject,
        body,
        recipients: recipients.map((r) => r.email),
        senderId: selectedSenderId,
        startTime: effectiveStartTime,
        delayBetweenEmailsMs: delayMs,
        maxEmailsPerHour: hourlyLimit,
        attachments: apiAttachments.length > 0 ? apiAttachments : undefined,
      });

      if (apiError) {
        setError(apiError);
        return;
      }

      const isImmediate = !scheduleTime;
      setSuccess(`${data?.scheduled} email${(data?.scheduled || 0) !== 1 ? 's' : ''} ${isImmediate ? 'queued for delivery!' : 'scheduled successfully!'}`);
      setTimeout(() => {
        onScheduled?.(isImmediate);
        onBack();
      }, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Visible chips: show first 3 then "+N"
  const visibleChips = recipients.slice(0, 3);
  const overflowCount = recipients.length - 3;

  return (
    <div className="flex-1 flex flex-col bg-white fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E8E8]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A] hover:text-[#00A859] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Compose New Email
        </button>

        <div className="flex items-center gap-2">
          {/* Attachment icon */}
          <div className="relative">
            <button
              onClick={() => attachmentInputRef.current?.click()}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F5F5] text-[#00A859] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M13 8L7.5 13.5C6.12 14.88 3.88 14.88 2.5 13.5C1.12 12.12 1.12 9.88 2.5 8.5L8 3C8.94 2.06 10.46 2.06 11.4 3C12.34 3.94 12.34 5.46 11.4 6.4L6 11.8C5.5 12.3 4.7 12.3 4.2 11.8C3.7 11.3 3.7 10.5 4.2 10L9 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
            {attachments.length > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[9px] font-bold text-[#00A859] bg-white px-1">
                {attachments.length}
              </span>
            )}
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.csv"
            className="hidden"
            onChange={handleAttachmentUpload}
          />

          {/* Clock icon (triggers Send Later) */}
          <button
            onClick={() => setShowSendLater(!showSendLater)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F5F5F5] text-[#9E9E9E] hover:text-[#666666] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Send / Send Later button */}
          <div className="relative">
            <button
              onClick={() => showSendLater ? undefined : handleSchedule()}
              disabled={sending}
              className="h-[32px] px-4 rounded-full border border-[#00A859] text-[#00A859]
                         text-[13px] font-medium hover:bg-[#E8F7EF] transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {sending ? (
                <div className="w-3 h-3 border border-[#00A859] border-t-transparent rounded-full animate-spin" />
              ) : null}
              {showSendLater ? 'Send Later' : 'Send'}
            </button>

            {/* Send Later Popover */}
            {showSendLater && (
              <SendLaterPopover
                onClose={() => setShowSendLater(false)}
                onConfirm={(time) => {
                  setShowSendLater(false);
                  handleSchedule(time);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Error/Success banners */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-5 mt-3 px-4 py-2.5 bg-[#E8F7EF] border border-[#A8DFC0] rounded-lg text-[13px] text-[#00A859]">
          ✓ {success}
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        {/* From */}
        <div className="flex items-center px-5 py-2.5 border-b border-[#F0F0F0] gap-4">
          <span className="text-[13px] text-[#9E9E9E] w-14 flex-shrink-0">From</span>
          <select
            value={selectedSenderId}
            onChange={(e) => setSelectedSenderId(e.target.value)}
            className="flex-1 text-[13px] text-[#1A1A1A] bg-transparent border-none outline-none cursor-pointer
                       appearance-none"
          >
            {senders.map((s) => (
              <option key={s.id} value={s.id}>{s.email}</option>
            ))}
            {senders.length === 0 && <option value="">No senders configured</option>}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9E9E9E] flex-shrink-0">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </div>

        {/* To */}
        <div className="flex items-start px-5 py-2.5 border-b border-[#F0F0F0] gap-4">
          <span className="text-[13px] text-[#9E9E9E] w-14 flex-shrink-0 pt-1">To</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[28px]">
            {/* Recipient chips */}
            {visibleChips.map((chip) => (
              <RecipientChip
                key={chip.id}
                email={chip.email}
                onRemove={() => removeRecipient(chip.id)}
              />
            ))}
            {overflowCount > 0 && (
              <span className="text-[12px] text-[#00A859] font-medium cursor-pointer hover:underline"
                onClick={() => {}}>
                +{overflowCount}
              </span>
            )}
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={handleRecipientKeyDown}
              onBlur={addRecipientFromInput}
              placeholder={recipients.length === 0 ? 'recipient@example.com' : ''}
              className="flex-1 min-w-[160px] text-[13px] text-[#1A1A1A] placeholder-[#9E9E9E] bg-transparent border-none outline-none"
            />
          </div>
          {/* Upload List */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-[12px] text-[#00A859] hover:underline flex-shrink-0 pt-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1V8M3 4L6 1L9 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1.5 10H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Upload List
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleCSVUpload}
          />
        </div>

        {/* Subject */}
        <div className="flex items-center px-5 py-2.5 border-b border-[#F0F0F0] gap-4">
          <span className="text-[13px] text-[#9E9E9E] w-14 flex-shrink-0">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-[13px] text-[#1A1A1A] placeholder-[#9E9E9E] bg-transparent border-none outline-none"
          />
        </div>



        {/* Delay + Hourly Limit */}
        <div className="flex items-center px-5 py-2.5 border-b border-[#F0F0F0] gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#9E9E9E]">Delay between 2 emails</span>
            <input
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              min={0}
              className="w-14 h-7 px-2 text-[13px] text-[#1A1A1A] bg-[#F5F5F5] rounded border-none outline-none text-center"
            />
            <span className="text-[12px] text-[#9E9E9E]">ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#9E9E9E]">Hourly Limit</span>
            <input
              type="number"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              min={1}
              className="w-14 h-7 px-2 text-[13px] text-[#1A1A1A] bg-[#F5F5F5] rounded border-none outline-none text-center"
            />
          </div>
        </div>

        {/* Rich text body */}
        <div className="flex-1 flex flex-col min-h-[300px]">
          <ReactQuill
            theme="snow"
            value={body}
            onChange={setBody}
            placeholder="Type Your Reply..."
            className="flex-1 flex flex-col"
            modules={{
              toolbar: [
                [{ font: [] }, { size: [] }],
                ['bold', 'italic', 'underline'],
                [{ align: [] }, { indent: '-1' }, { indent: '+1' }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                ['clean'],
              ],
            }}
          />

          {/* Attachment Thumbnails (Bottom) */}
          {attachments.length > 0 && (
            <div className="px-5 py-4 border-t border-[#F0F0F0] flex gap-3 flex-wrap">
              {attachments.map((att) => {
                const isImage = att.file.type.startsWith('image/');
                return (
                  <div key={att.id} className="relative group w-[180px] rounded-lg border border-[#E8E8E8] overflow-hidden bg-white shadow-sm flex flex-col">
                    {/* Thumbnail */}
                    <div className="h-[100px] bg-[#F5F5F5] w-full flex items-center justify-center overflow-hidden">
                      {isImage ? (
                        <img src={URL.createObjectURL(att.file)} alt={att.file.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" className="text-[#9E9E9E]">
                          <path d="M13 8L7.5 13.5C6.12 14.88 3.88 14.88 2.5 13.5C1.12 12.12 1.12 9.88 2.5 8.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-2 border-t border-[#E8E8E8]">
                      <p className="text-[11px] text-[#1A1A1A] truncate font-medium">{att.file.name}</p>
                      <p className="text-[10px] text-[#9E9E9E] mt-0.5">{(att.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    {/* Remove button (hover) */}
                    <button 
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipient chip — green pill with email + remove button
// ─────────────────────────────────────────────────────────────────────────────
function RecipientChip({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                     bg-[#E8F7EF] border border-[#A8DFC0] text-[12px] text-[#00A859] font-medium">
      {email}
      <button
        onClick={onRemove}
        className="hover:text-[#008F4C] transition-colors leading-none"
      >
        ×
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
