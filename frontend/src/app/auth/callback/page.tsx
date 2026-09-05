'use client';

import { useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// /auth/callback — Receives the JWT from the backend OAuth redirect,
// signs in to NextAuth, then redirects to dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      router.replace('/?error=auth_failed');
      return;
    }

    // Sign in with NextAuth credentials provider using the backend JWT
    signIn('credentials', {
      token,
      redirect: false,
    }).then((result) => {
      if (result?.ok) {
        router.replace('/dashboard');
      } else {
        router.replace('/?error=auth_failed');
      }
    });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin" />
      <p className="text-[14px] text-[#666666]">Signing you in...</p>
    </div>
  );
}
