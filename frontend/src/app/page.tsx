'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

import { Suspense } from 'react';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  // Show error messages from OAuth callback
  useEffect(() => {
    const errParam = searchParams.get('error');
    if (errParam === 'auth_failed') setError('Google sign-in failed. Please try again.');
    if (searchParams.get('logged_out') === 'true') setError(null);
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center">
      {/* Login Card — matches Figma exactly */}
      <div className="bg-white rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] w-[380px] p-10">
        {/* Title */}
        <h1 className="text-[28px] font-bold text-[#1A1A1A] text-center mb-7 tracking-tight">
          Login
        </h1>

        {/* Error banner */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        {/* Google Login Button */}
        <a
          href={`${BACKEND_URL}/auth/google`}
          className="flex items-center justify-center gap-2.5 w-full h-[42px] rounded-lg
                     bg-[#E8F7EF] border border-[#00A859] text-[14px] font-medium text-[#1A1A1A]
                     hover:bg-[#D4F0E4] transition-colors duration-150 cursor-pointer"
        >
          {/* Google G icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z" fill="#4285F4"/>
            <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z" fill="#34A853"/>
            <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
            <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
          </svg>
          Login with Google
        </a>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#E8E8E8]" />
          <span className="text-[12px] text-[#9E9E9E]">or sign up through email</span>
          <div className="flex-1 h-px bg-[#E8E8E8]" />
        </div>

        {/* Email/Password fields — UI only (Google OAuth is primary) */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email ID"
            disabled
            className="w-full h-[42px] px-4 bg-[#F3F3F3] border border-transparent rounded-lg
                       text-[14px] text-[#9E9E9E] placeholder-[#9E9E9E]
                       focus:outline-none cursor-not-allowed"
          />
          <input
            type="password"
            placeholder="Password"
            disabled
            className="w-full h-[42px] px-4 bg-[#F3F3F3] border border-transparent rounded-lg
                       text-[14px] text-[#9E9E9E] placeholder-[#9E9E9E]
                       focus:outline-none cursor-not-allowed"
          />
        </div>

        {/* Login Button */}
        <button
          disabled
          className="mt-5 w-full h-[42px] bg-[#00A859] rounded-lg text-[14px] font-semibold
                     text-white cursor-not-allowed opacity-60"
        >
          Login
        </button>

        <p className="mt-4 text-center text-[12px] text-[#9E9E9E]">
          Use &quot;Login with Google&quot; above to sign in
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
