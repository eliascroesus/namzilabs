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
    if (err instanceof AuthError) redirect("/login?error=1");
    throw err; // NEXT_REDIRECT on success must propagate
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
