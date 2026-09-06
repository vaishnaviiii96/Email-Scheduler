'use client';

import { EmailJob } from '@/types';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';

interface EmailDetailProps {
  email: EmailJob | null;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmailDetail — Full email detail view (Screen 4 in Figma)
// Back arrow, sender info, body, optional attachments
// ─────────────────────────────────────────────────────────────────────────────
export function EmailDetail({ email, onBack }: EmailDetailProps) {
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#9E9E9E] text-[14px]">
        Select an email to view details
      </div>
    );
  }

  const formattedDate = (() => {
    try {
      return format(parseISO(email.sentAt || email.scheduledAt), 'MMM d, h:mm a');
    } catch {
      return '';
    }
  })();

  return (
    <div className="flex-1 flex flex-col overflow-hidden fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E8E8E8] flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[#666666] hover:text-[#1A1A1A] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      </div>

      {/* Subject */}
      <div className="px-6 py-4 border-b border-[#E8E8E8]">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A] leading-snug">
          {email.subject}
        </h2>
      </div>

      {/* Sender info row */}
      <div className="px-6 py-3.5 border-b border-[#E8E8E8] flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-[#6B7FCC] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[13px] font-semibold">
            {(email.sender?.email || 'S')[0].toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
              {email.sender?.email || 'Sender'}
            </span>
            <span className="text-[12px] text-[#9E9E9E]">&lt;{email.sender?.email}&gt;</span>
            <span className="text-[12px] text-[#9E9E9E] flex items-center gap-0.5">
              to me
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </span>
          </div>
          <p className="text-[11px] text-[#9E9E9E]">To: {email.recipientEmail}</p>
        </div>

        <span className="text-[12px] text-[#9E9E9E] flex-shrink-0">{formattedDate}</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Status callout for rate_limited */}
        {email.status === 'rate_limited' && (
          <div className="mb-4 px-4 py-3 bg-[#FFF9D6] border border-[#FFE58F] rounded-lg flex items-start gap-2">
            <span className="text-[14px]">⚡</span>
            <div>
              <p className="text-[13px] font-medium text-[#7A6400]">Rate Limited</p>
              <p className="text-[12px] text-[#8A7400] mt-0.5">
                This email exceeded the hourly limit and will be sent in the next hour window.
              </p>
            </div>
          </div>
        )}

        {/* Error callout */}
        {email.status === 'failed' && email.error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-[13px] font-medium text-red-700">Send Failed</p>
            <p className="text-[12px] text-red-500 mt-0.5 font-mono">{email.error}</p>
          </div>
        )}

        {/* Email body */}
        <div className="text-[14px] text-[#1A1A1A] leading-relaxed max-w-none">
          <style>{`
            .email-body blockquote {
              background-color: #FFF9E6 !important;
              border-left: 4px solid #FFCC00 !important;
              padding: 12px 16px !important;
              margin: 16px 0 !important;
              color: #1A1A1A !important;
            }
          `}</style>
          <div
            className="email-body"
            dangerouslySetInnerHTML={{ __html: email.body }}
          />

          {/* Render Inline Images */}
          {email.attachments && email.attachments.filter(a => a.contentType.startsWith('image/')).length > 0 && (
            <div className="mt-6 flex flex-col gap-4">
              {email.attachments
                .filter(a => a.contentType.startsWith('image/'))
                .map((a, i) => (
                  <img
                    key={i}
                    src={`data:${a.contentType};base64,${a.content}`}
                    alt={a.filename}
                    className="max-w-full rounded-lg"
                  />
                ))}
            </div>
          )}

          {/* Render Non-Image Attachments */}
          {email.attachments && email.attachments.filter(a => !a.contentType.startsWith('image/')).length > 0 && (
            <div className="mt-8 border-t border-[#E8E8E8] pt-4 flex gap-3 flex-wrap">
              {email.attachments
                .filter(a => !a.contentType.startsWith('image/'))
                .map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 border border-[#E8E8E8] rounded-lg bg-[#F5F5F5]">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[#9E9E9E]">
                      <path d="M13 8L7.5 13.5C6.12 14.88 3.88 14.88 2.5 13.5C1.12 12.12 1.12 9.88 2.5 8.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <div>
                      <p className="text-[11px] text-[#1A1A1A] font-medium">{a.filename}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Metadata footer */}
      <div className="px-6 py-3 border-t border-[#E8E8E8] bg-[#FAFAFA]">
        <div className="flex items-center gap-6 text-[11px] text-[#9E9E9E]">
          <span>Status: <strong className="text-[#666666]">{email.status}</strong></span>
          <span>Scheduled: <strong className="text-[#666666]">{format(parseISO(email.scheduledAt), 'MMM d, h:mm a')}</strong></span>
          {email.sentAt && (
            <span>Sent: <strong className="text-[#666666]">{format(parseISO(email.sentAt), 'MMM d, h:mm a')}</strong></span>
          )}
        </div>
      </div>
    </div>
  );
}
