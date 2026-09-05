import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// ─────────────────────────────────────────────────────────────────────────────
// NextAuth configuration — Credentials provider that accepts the JWT issued
// by the Express backend after Google OAuth.
//
// Auth flow:
// 1. User clicks "Login with Google" → redirected to backend /auth/google
// 2. Google OAuth completes → backend redirects to /auth/callback?token=<jwt>
// 3. /auth/callback page calls signIn('credentials', { token })
// 4. NextAuth stores the JWT in its own session
// 5. Frontend uses session.accessToken on every API call
// ─────────────────────────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Backend JWT',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;

        try {
          // Verify the token with the backend /auth/me endpoint
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/auth/me`,
            {
              headers: { Authorization: `Bearer ${credentials.token}` },
            }
          );

          if (!res.ok) return null;

          const { user } = await res.json();
          // Return user object — NextAuth will store this in JWT session
          return {
            id: user.userId,
            email: user.email,
            name: user.name,
            image: user.avatarUrl,
            accessToken: credentials.token, // store raw token for API calls
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, user }) {
      // On initial sign in, attach the backend JWT to NextAuth's JWT
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the backend JWT and userId to client components
      session.accessToken = token.accessToken as string;
      session.userId = token.userId as string;
      return session;
    },
  },

  pages: {
    signIn: '/',       // Custom login page
    error: '/',        // Error redirects to login
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// Extend next-auth types to include our custom fields
declare module 'next-auth' {
  interface Session {
    accessToken: string;
    userId: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    userId: string;
  }
}
