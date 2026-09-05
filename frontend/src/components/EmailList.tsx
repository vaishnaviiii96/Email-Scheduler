'use client';

import { EmailJob, EmailJobStatus } from '@/types';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

interface EmailListProps {
  emails: EmailJob[];
  loading?: boolean;
  tab: 'scheduled' | 'sent';
  onSelect?: (email: EmailJob) => void;
  selectedId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmailList — Matches Figma email list exactly
// Scheduled: orange timestamp badge + subject bold + snippet gray + star icon
// Sent: gray "Sent" badge + same layout
// ─────────────────────────────────────────────────────────────────────────────
export function EmailList({ emails, loading, tab, onSelect, selectedId }: EmailListProps) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-[#CFCFCF]">
          <rect x="5" y="10" width="30" height="22" rx="3" stroke="currentColor" strokeWidth="2"/>
          <path d="M5 14L20 24L35 14" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <p className="text-[14px] text-[#9E9E9E] font-medium">
          {tab === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
        </p>
        <p className="text-[12px] text-[#BDBDBD]">
          {tab === 'scheduled' ? 'Use Compose to schedule your first email' : 'Sent emails will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto fade-in">
      {emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          tab={tab}
          selected={email.id === selectedId}
          onClick={() => onSelect?.(email)}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual email row
// ─────────────────────────────────────────────────────────────────────────────
function EmailRow({
  email,
  tab,
  selected,
  onClick,
}: {
  email: EmailJob;
  tab: 'scheduled' | 'sent';
  selected: boolean;
  onClick: () => void;
}) {
  const timestamp = tab === 'scheduled' ? email.scheduledAt : (email.sentAt || email.scheduledAt);
  const formattedTime = formatTimestamp(timestamp);

  // Extract plain text snippet from body (strip HTML)
  const snippet = stripHtml(email.body).slice(0, 80) + '…';

  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex items-start gap-0 px-5 py-3.5 border-b border-[#F0F0F0] cursor-pointer',
        'hover:bg-[#FAFAFA] transition-colors duration-100 group',
        selected && 'bg-[#F0FAF5]'
      )}
    >
      <div className="flex-1 min-w-0">
        {/* Recipient */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-medium text-[#1A1A1A]">
            To: {email.recipientEmail}
          </span>
        </div>

        {/* Timestamp badge + Subject + Snippet */}
        <div className="flex items-baseline gap-2 min-w-0">
          <StatusBadge status={email.status} time={formattedTime} tab={tab} />
          <span className="text-[13px] font-medium text-[#1A1A1A] truncate flex-shrink-0">
            {email.subject}
          </span>
          <span className="text-[12px] text-[#9E9E9E] truncate flex-1">
            &ndash; {snippet}
          </span>
        </div>
      </div>

      {/* Star icon (right) */}
      <button
        className="ml-3 mt-0.5 flex-shrink-0 text-[#D0D0D0] hover:text-[#FF9500] transition-colors opacity-0 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L8.545 5.09H13L9.727 7.545L10.909 12L7 9.273L3.091 12L4.273 7.545L1 5.09H5.455L7 1Z"
            stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge — Orange for scheduled/rate_limited, gray for sent, red for failed
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({
  status,
  time,
  tab,
}: {
  status: EmailJobStatus;
  time: string;
  tab: 'scheduled' | 'sent';
}) {
  if (tab === 'scheduled' && (status === 'scheduled' || status === 'rate_limited')) {
    return (
      <span className="inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full
                       bg-[#FFF3E0] text-[#FF9500] text-[11px] font-medium border border-[#FFE0A0]">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <circle cx="4" cy="4" r="4"/>
        </svg>
        {status === 'rate_limited' ? 'Rate Limited' : time}
      </span>
    );
  }

  if (status === 'sent') {
    return (
      <span className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-full
                       bg-[#EFEFEF] text-[#666666] text-[11px] font-medium">
        Sent
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-full
                       bg-red-50 text-red-500 text-[11px] font-medium">
        Failed
      </span>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton row for loading state
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-[#F0F0F0]">
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="flex items-center gap-2">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE h:mm:ss a');
  } catch {
    return iso;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
