import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
// Only a publishable key belongs here. Every business request is authorized by RLS/RPCs.
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}
export function readableError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (/invalid login/i.test(message))
    return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message))
    return "Please verify your email before signing in.";
  if (/invalid.*invitation|invitation.*invalid/i.test(message))
    return "This invitation is expired, revoked, already used, or belongs to a different verified email.";
  if (/owner required|permission|not authorized|row.level/i.test(message))
    return "You do not have permission for this action. Refresh your business list.";
  if (/already.*registered/i.test(message))
    return "If this email already has an account, sign in or reset your password.";
  if (/network|fetch|offline/i.test(message))
    return "Connection failed. Check your internet connection and try again.";
  if (/duplicate.*invitation/i.test(message))
    return "A pending invitation already exists. Revoke it before creating another.";
  if (/rate limit/i.test(message))
    return "Too many attempts. Please wait before trying again.";
  return "The request could not be completed. Check the details and your connection, then try again.";
}
