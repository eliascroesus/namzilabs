"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";

export async function passwordLogin(formData: FormData) {
  try {
    await signIn("credentials", {
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // Only an actual credentials mismatch is "wrong password". Everything
      // else (DB down, missing tables, missing AUTH_SECRET…) is a server
      // problem and must say so — otherwise it's undebuggable.
      const wrongPassword = err.type === "CredentialsSignin";
      redirect(`/login?error=${wrongPassword ? "password" : "server"}`);
    }
    throw err; // NEXT_REDIRECT on success must propagate
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
