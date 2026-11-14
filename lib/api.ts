import { client } from "./supabase";
import type { Business, BusinessInput, Invitation, Member } from "./domain";
export async function command(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await client().rpc("flowledger_command", {
    action,
    payload,
  });
  if (error) throw error;
  return data;
}
export async function listBusinesses(): Promise<Business[]> {
  const { data, error } = await client()
    .from("businesses")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...b,
    opening_balance: String(b.opening_balance),
  }));
}
export async function listMembers(id: string): Promise<Member[]> {
  return (await command("members", { business_id: id })) as Member[];
}
export async function listInvitations(id: string): Promise<Invitation[]> {
  const { data, error } = await client()
    .from("business_invitations")
    .select("id,business_id,email,expires_at,accepted_at,revoked_at,created_at")
    .eq("business_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function saveBusiness(
  input: BusinessInput,
  id?: string,
): Promise<string> {
  return (await command(id ? "update_business" : "create_business", {
    ...input,
    ...(id ? { business_id: id } : {}),
  })) as string;
}
