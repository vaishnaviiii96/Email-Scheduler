'use client';

import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import clsx from 'clsx';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SidebarProps {
  activeTab: 'scheduled' | 'sent';
  onTabChange: (tab: 'scheduled' | 'sent') => void;
  onCompose: () => void;
  scheduledCount?: number;
  sentCount?: number;
  userId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — matches Figma left nav exactly
// - ON8 logo (top-left, handled by TopBar)
// - User card: avatar + name + email + dropdown
// - + Compose button (green outline pill)
// - CORE section: Scheduled (clock icon) + Sent (paper plane icon)
// - Connect Slack button with live status
// ─────────────────────────────────────────────────────────────────────────────
export function Sidebar({ activeTab, onTabChange, onCompose, scheduledCount, sentCount, userId }: SidebarProps) {
  const { data: session } = useSession();
  const user = session;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [slackConnected, setSlackConnected] = useState(false);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackNotice, setSlackNotice] = useState<'connected' | 'error' | null>(null);

  // Fetch Slack connection status on mount
  const fetchSlackStatus = useCallback(async () => {
    setSlackLoading(true);
    const { data } = await api.getSlackStatus();
    if (data) setSlackConnected(data.connected);
    setSlackLoading(false);
  }, []);

  useEffect(() => {
    fetchSlackStatus();
  }, [fetchSlackStatus]);

  // Handle redirect back from Slack OAuth
  useEffect(() => {
    if (searchParams.get('slack_connected') === 'true') {
      setSlackConnected(true);
      setSlackNotice('connected');
      setTimeout(() => setSlackNotice(null), 4000);
      router.replace('/dashboard'); // clean up query param
    }
    if (searchParams.get('slack_error') === 'true') {
      setSlackNotice('error');
      setTimeout(() => setSlackNotice(null), 4000);
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  const handleConnectSlack = () => {
    if (!userId) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    window.location.href = `${backendUrl}/auth/slack?userId=${userId}`;
  };

  const handleDisconnectSlack = async () => {
    await api.disconnectSlack();
    setSlackConnected(false);
  };

  return (
    <aside className="w-[260px] min-h-screen bg-white border-r border-[#E8E8E8] flex flex-col flex-shrink-0">
      {/* ON8 Logo */}
      <div className="px-5 pt-5 pb-4">
        <span className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">ON8</span>
      </div>

      {/* User Card */}
      <div className="px-4 pb-4">
        <div 
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#F9F9F9] cursor-pointer transition-colors"
          title="Sign Out"
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-[#00A859] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {user?.user?.image ? (
              <Image
                src={user.user.image}
                alt={user.user.name || 'User'}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : (
              <span className="text-white text-[13px] font-semibold">
                {user?.user?.name?.[0]?.toUpperCase() || 'U'}
              </span>
            )}
          </div>

          {/* Name + Email */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[#1A1A1A] truncate leading-tight">
              {user?.user?.name || 'User'}
            </p>
            <p className="text-[11px] text-[#9E9E9E] truncate leading-tight">
              {user?.user?.email || ''}
            </p>
          </div>

          {/* Dropdown chevron */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#9E9E9E] flex-shrink-0">
            <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Compose Button */}
      <div className="px-4 pb-5">
        <button
          onClick={onCompose}
          className="w-full h-[36px] rounded-full border border-[#00A859] bg-white text-[#00A859]
                     text-[13px] font-medium hover:bg-[#E8F7EF] transition-colors duration-150
                     flex items-center justify-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.75V12.25M1.75 7H12.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
          Compose
        </button>
      </div>

      {/* Core Navigation */}
      <div className="px-4 flex-1">
        {/* Section label */}
        <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-2 px-2">
          Core
        </p>

        <nav className="space-y-0.5">
          {/* Scheduled */}
          <button
            onClick={() => onTabChange('scheduled')}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
              activeTab === 'scheduled'
                ? 'bg-[#E8F7EF] text-[#00A859]'
                : 'text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
            )}
          >
            {/* Clock icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="flex-1 text-left">Scheduled</span>
            {scheduledCount !== undefined && (
              <span className={clsx(
                'text-[11px] font-medium',
                activeTab === 'scheduled' ? 'text-[#00A859]' : 'text-[#9E9E9E]'
              )}>
                {scheduledCount}
              </span>
            )}
          </button>

          {/* Sent */}
          <button
            onClick={() => onTabChange('sent')}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
              activeTab === 'sent'
                ? 'bg-[#E8F7EF] text-[#00A859]'
                : 'text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
            )}
          >
            {/* Paper plane icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path d="M2 2L14 8L2 14V9.5L10 8L2 6.5V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="flex-1 text-left">Sent</span>
            {sentCount !== undefined && (
              <span className={clsx(
                'text-[11px] font-medium',
                activeTab === 'sent' ? 'text-[#00A859]' : 'text-[#9E9E9E]'
              )}>
                {sentCount}
              </span>
            )}
          </button>
        </nav>

        {/* Integrations section */}
        <p className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest mb-2 px-2 mt-6">
          Integrations
        </p>

        {/* Slack notice banner */}
        {slackNotice === 'connected' && (
          <div className="mb-2 px-3 py-2 bg-[#E8F7EF] border border-[#A8DFC0] rounded-lg text-[11px] text-[#00A859]">
            ✓ Slack connected! You'll receive rate-limit alerts.
          </div>
        )}
        {slackNotice === 'error' && (
          <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-600">
            Slack connection failed. Please try again.
          </div>
        )}

        {/* Connect / Disconnect Slack button */}
        {slackLoading ? (
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="w-3 h-3 border border-[#9E9E9E] border-t-transparent rounded-full animate-spin" />
            <span className="text-[12px] text-[#9E9E9E]">Checking Slack...</span>
          </div>
        ) : slackConnected ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F5F5F5]">
            {/* Slack logo */}
            <svg width="16" height="16" viewBox="0 0 122.8 122.8" className="flex-shrink-0">
              <path d="M25.8,77.6c0,7.1-5.8,12.9-12.9,12.9S0,84.7,0,77.6s5.8-12.9,12.9-12.9h12.9V77.6z" fill="#E01E5A"/>
              <path d="M32.3,77.6c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9v32.3c0,7.1-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/>
              <path d="M45.2,25.8c-7.1,0-12.9-5.8-12.9-12.9S38.1,0,45.2,0s12.9,5.8,12.9,12.9v12.9H45.2z" fill="#36C5F0"/>
              <path d="M45.2,32.3c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H12.9C5.8,58.1,0,52.3,0,45.2s5.8-12.9,12.9-12.9H45.2z" fill="#36C5F0"/>
              <path d="M97,45.2c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H97V45.2z" fill="#2EB67D"/>
              <path d="M90.5,45.2c0,7.1-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V12.9C64.7,5.8,70.5,0,77.6,0s12.9,5.8,12.9,12.9V45.2z" fill="#2EB67D"/>
              <path d="M77.6,97c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V97H77.6z" fill="#ECB22E"/>
              <path d="M77.6,90.5c-7.1,0-12.9-5.8-12.9-12.9s5.8-12.9,12.9-12.9h32.3c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H77.6z" fill="#ECB22E"/>
            </svg>
            <span className="text-[12px] text-[#1A1A1A] font-medium flex-1">Slack connected</span>
            <button
              onClick={handleDisconnectSlack}
              className="text-[11px] text-[#9E9E9E] hover:text-red-500 transition-colors"
              title="Disconnect Slack"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectSlack}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                       text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-all duration-150"
          >
            {/* Slack logo */}
            <svg width="16" height="16" viewBox="0 0 122.8 122.8" className="flex-shrink-0 opacity-60">
              <path d="M25.8,77.6c0,7.1-5.8,12.9-12.9,12.9S0,84.7,0,77.6s5.8-12.9,12.9-12.9h12.9V77.6z" fill="#E01E5A"/>
              <path d="M32.3,77.6c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9v32.3c0,7.1-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/>
              <path d="M45.2,25.8c-7.1,0-12.9-5.8-12.9-12.9S38.1,0,45.2,0s12.9,5.8,12.9,12.9v12.9H45.2z" fill="#36C5F0"/>
              <path d="M45.2,32.3c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H12.9C5.8,58.1,0,52.3,0,45.2s5.8-12.9,12.9-12.9H45.2z" fill="#36C5F0"/>
              <path d="M97,45.2c0-7.1,5.8-12.9,12.9-12.9s12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H97V45.2z" fill="#2EB67D"/>
              <path d="M90.5,45.2c0,7.1-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V12.9C64.7,5.8,70.5,0,77.6,0s12.9,5.8,12.9,12.9V45.2z" fill="#2EB67D"/>
              <path d="M77.6,97c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9s-12.9-5.8-12.9-12.9V97H77.6z" fill="#ECB22E"/>
              <path d="M77.6,90.5c-7.1,0-12.9-5.8-12.9-12.9s5.8-12.9,12.9-12.9h32.3c7.1,0,12.9,5.8,12.9,12.9s-5.8,12.9-12.9,12.9H77.6z" fill="#ECB22E"/>
            </svg>
            <span className="flex-1 text-left">Connect Slack</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#9E9E9E]">
              <path d="M4.5 2.5L7.5 6L4.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Logout at bottom */}
      <div className="px-4 pb-5 mt-auto">
        {/* Bull Board link */}
        <a
          href={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/admin/queues`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg text-[13px] text-[#9E9E9E]
                     hover:bg-[#F5F5F5] hover:text-[#666666] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4.5 4.5V3.5C4.5 2.4 5.4 1.5 6.5 1.5H9.5C10.6 1.5 11.5 2.4 11.5 3.5V4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M8 8V10M6 9H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Bull Board
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-auto">
            <path d="M3 2H8M8 2V7M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </a>

        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#9E9E9E]
                     hover:bg-[#F5F5F5] hover:text-[#666666] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H6M11 11L14 8M14 8L11 5M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
