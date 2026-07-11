import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { ensurePersonalWorkspace } from "@/lib/workspace";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  trustHost: true,
  providers: [
    Google({
      // Base identity scopes only. Google Sheets scopes are requested
      // per-connection during integration setup (Plan 2), never at login.
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  pages: { signIn: "/login" },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? null);
      }
    },
  },
}));
