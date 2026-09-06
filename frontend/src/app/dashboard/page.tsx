'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { EmailList } from '@/components/EmailList';
import { EmailDetail } from '@/components/EmailDetail';
import { ComposeView } from '@/components/ComposeView';
import { api } from '@/lib/api';
import { EmailJob } from '@/types';

type View = 'list' | 'detail' | 'compose';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — Main application shell
// Layout: Sidebar (260px) | TopBar + Content
// Content: EmailList | EmailDetail | ComposeView
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [view, setView] = useState<View>('list');
  const [selectedEmail, setSelectedEmail] = useState<EmailJob | null>(null);

  const [scheduledEmails, setScheduledEmails] = useState<EmailJob[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailJob[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchResults, setSearchResults] = useState<EmailJob[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  // Load emails on mount and tab change
  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduledRes, sentRes] = await Promise.all([
        api.getScheduled(),
        api.getSent(),
      ]);

      if (scheduledRes.data) {
        setScheduledEmails(scheduledRes.data.jobs);
        setScheduledTotal(scheduledRes.data.pagination.total);
      }
      if (sentRes.data) {
        setSentEmails(sentRes.data.jobs);
        setSentTotal(sentRes.data.pagination.total);
      }
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      loadEmails();
    }
  }, [status, loadEmails]);

  // Poll for updates every 3s (for real-time status changes)
  useEffect(() => {
    if (status !== 'authenticated') return;
    const interval = setInterval(loadEmails, 3_000);
    return () => clearInterval(interval);
  }, [status, loadEmails]);

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    if (!query) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const { data } = await api.searchEmails(query);
      if (data && !data.degraded) {
        // Convert ES results to EmailJob-like objects for rendering
        setSearchResults(
          data.results.map((r) => ({
            id: r.id,
            recipientEmail: r.recipientEmail,
            subject: r.subject,
            body: r.bodySnippet || '',
            status: r.status,
            scheduledAt: r.scheduledAt,
            sentAt: r.sentAt,
            userId: '',
            senderId: '',
            bullJobId: null,
            idempotencyKey: '',
            error: null,
            createdAt: '',
            updatedAt: '',
          }))
        );
      } else {
        setSearchResults([]); // degraded — show empty
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9F9]">
        <div className="w-8 h-8 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayEmails = searchResults !== null
    ? searchResults
    : activeTab === 'scheduled' ? scheduledEmails : sentEmails;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9F9F9]">
      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <Suspense fallback={<div className="w-[260px] bg-white border-r border-[#E8E8E8]" />}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setView('list');
            setSelectedEmail(null);
            setSearchResults(null);
          }}
          onCompose={() => setView('compose')}
          scheduledCount={scheduledTotal}
          sentCount={sentTotal}
          userId={session?.userId}
        />
      </Suspense>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (always visible except in compose) */}
        {view !== 'compose' && (
          <TopBar onSearch={handleSearch} onRefresh={loadEmails} isSearching={isSearching} />
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden bg-white">
          {view === 'compose' ? (
            <ComposeView
              onBack={() => {
                setView('list');
                setSelectedEmail(null);
              }}
              onScheduled={(isImmediate) => {
                if (isImmediate) setActiveTab('sent');
                loadEmails();
              }}
              userId={session?.userId}
            />
          ) : view === 'detail' && selectedEmail ? (
            <EmailDetail
              email={selectedEmail}
              onBack={() => {
                setView('list');
                setSelectedEmail(null);
              }}
            />
          ) : (
            <EmailList
              emails={displayEmails}
              loading={loading}
              tab={activeTab}
              selectedId={selectedEmail?.id}
              onSelect={(email) => {
                setSelectedEmail(email);
                setView('detail');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
