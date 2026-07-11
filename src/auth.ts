import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { authorizePassword } from "@/lib/password-auth";

/**
 * Pre-launch access: a single shared password (APP_PASSWORD env var)
 * mapped to a stable owner user, so the workspace/tenancy model underneath
 * stays exactly as designed. Google sign-in returns when the OAuth consent
 * screen is verified — the adapter and user model are already compatible.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // Credentials sign-in requires JWT sessions (Auth.js constraint).
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { password: { label: "Password", type: "password" } },
      authorize: (credentials) => authorizePassword(credentials?.password),
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
}));
