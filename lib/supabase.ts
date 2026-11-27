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
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "PGRST301" || code === "PGRST303")
    return "Your session expired. Sign in again and reopen this business.";
  if (message === "payment status uncertain")
    return "Payment status couldn’t be confirmed. Retry this same payment to check safely, or close it and review payment history before recording another.";
  if (/insufficient funds on a payment date/i.test(message))
    return "There were not enough funds on that payment date. Check the allocation and the available funds for that date.";
  if (/payment exceeds remaining amount/i.test(message))
    return "Enter a payment greater than zero and within the remaining amount. Refresh if another payment was recorded.";
  if (/payment target unavailable/i.test(message))
    return "This obligation is no longer available. Refresh the payment list.";
  if (/locked by settlement history/i.test(message))
    return "This record has payment history. The requested details are locked to preserve that history.";
  if (/reversal reason required|correction reason required/i.test(message))
    return "Enter a reason for this change.";
  if (/entry date must be between|payment date outside tracking period/i.test(message))
    return "Choose a date between the opening balance date and today.";
  if (/invalid recurrence end date/i.test(message))
    return "Choose a recurrence end date on or after the first due date and within five years.";
  if (/invalid (?:loan )?amounts?/i.test(message))
    return "Check the amounts and enter numbers with up to two decimal places.";
  if (/invalid (?:loan )?dates?/i.test(message))
    return "Check the dates and make sure they are in the allowed range.";
  if (/restore the entry before correcting/i.test(message))
    return "Restore this entry before correcting it.";
  if (/duplicate.*invitation/i.test(message))
    return "A pending invitation already exists. Revoke it before creating another.";
  if (/record changed/i.test(message))
    return "Someone changed this record. Refresh and reopen it before saving.";
  if (/category is in use/i.test(message))
    return "This category has active expenses. Move or delete those expenses first.";
  if (/Restore the category/i.test(message))
    return "Restore this expense’s category first, then restore the expense.";
  if (/active category/i.test(message))
    return "Choose an active category. Refresh if the category was recently changed.";
  if (/Currency cannot change/i.test(message))
    return "Currency cannot change after expenses are recorded.";
  if (code === "23505" || /duplicate key/i.test(message))
    return "That name or record already exists. Refresh and try again.";
  if (/invalid login/i.test(message))
    return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message))
    return "Please verify your email before signing in.";
  if (/invalid.*invitation|invitation.*invalid/i.test(message))
    return "This invitation is expired, revoked, already used, or belongs to a different verified email.";
  if (code === "42501" || /owner required|permission|not authorized|row.level/i.test(message))
    return "You do not have permission for this action. Refresh your business list.";
  if (/already.*registered/i.test(message))
    return "If this email already has an account, sign in or reset your password.";
  if (/network|fetch|offline/i.test(message))
    return "Connection failed. Check your internet connection and try again.";
  if (/rate limit/i.test(message))
    return "Too many attempts. Please wait before trying again.";
  return "The request could not be completed. Check the details and your connection, then try again.";
}
