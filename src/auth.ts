import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { safeEqual } from "@/connectors/util";

/**
 * Pre-launch access: a single shared password (APP_PASSWORD env var)
 * mapped to a stable owner user, so the workspace/tenancy model underneath
 * stays exactly as designed. Google sign-in returns when the OAuth consent
 * screen is verified — the adapter and user model are already compatible.
 */
const OWNER_EMAIL = "owner@namzilabs.co";

async function ensureOwnerUser() {
  let [user] = await db().select().from(schema.users).where(eq(schema.users.email, OWNER_EMAIL));
  if (!user) {
    [user] = await db()
      .insert(schema.users)
      .values({ email: OWNER_EMAIL, name: "Namzi" })
      .returning();
  }
  await ensurePersonalWorkspace(user.id, "Namzi");
  return user;
}

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
      async authorize(credentials) {
        const provided = typeof credentials?.password === "string" ? credentials.password : "";
        const expected = process.env.APP_PASSWORD ?? "Namzilabs123";
        if (!provided || !safeEqual(provided, expected)) return null;
        const user = await ensureOwnerUser();
        return { id: user.id, email: user.email, name: user.name };
      },
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
