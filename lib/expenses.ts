import { z } from "zod";
import { client } from "./supabase";
export const expenseSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(100),
    description: z.string().max(1000),
    category_id: z.uuid("Choose a category."),
    amount: z
      .string()
      .regex(
        /^\d{1,12}(\.\d{1,2})?$/,
        "Enter a positive amount with up to two decimal places.",
      )
      .refine(
        (v) => /^\d+(\.\d{1,2})?$/.test(v) && toMinor(v) > 0n,
        "Amount must be greater than zero.",
      ),
    due_date: z.iso
      .date()
      .refine(
        (v) => v >= "2000-01-01" && v <= "2100-12-31",
        "Choose a date between 2000 and 2100.",
      ),
    frequency: z.enum(["once", "monthly"]),
    end_date: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!z.iso.date().safeParse(v.due_date).success) return;
    if (
      v.frequency === "monthly" &&
      (!z.iso.date().safeParse(v.end_date).success ||
        v.end_date < v.due_date ||
        v.end_date > addMonths(v.due_date, 60) ||
        v.end_date > "2100-12-31")
    )
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message:
          "Choose an end date on or after the first due date, within five years.",
      });
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type Category = {
  id: string;
  name: string;
  version: number;
  deleted_at: string | null;
};
export type Expense = {
  id: string;
  business_id: string;
  category_id: string;
  schedule_id: string;
  title: string;
  description: string;
  amount_minor: number;
  due_date: string;
  version: number;
  deleted_at: string | null;
  expense_schedules: {
    frequency: "once" | "monthly";
    first_due: string;
    last_due: string;
  };
};
export type History = {
  id: number;
  action: string;
  created_at: string;
  before_record: Record<string, unknown> | null;
  after_record: Record<string, unknown>;
};
export function toMinor(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimalAmount(minor: number | string | bigint) {
  const v = BigInt(minor);
  return `${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}
export function formatMinor(minor: bigint, currency: string) {
  return `${currency} ${(minor / 100n).toLocaleString("en-US")}.${String(minor % 100n).padStart(2, "0")}`;
}
export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export async function expenseCommand(
  action: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await client().rpc("expense_command", {
    action,
    payload,
  });
  if (error) throw error;
  return data;
}
export async function categoriesFor(bid: string): Promise<Category[]> {
  const { data, error } = await client()
    .from("expense_categories")
    .select("id,name,version,deleted_at")
    .eq("business_id", bid)
    .order("name")
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}
export async function expensesFor(
  bid: string,
  month: string,
  deleted: boolean,
): Promise<Expense[]> {
  const start = month + "-01",
    end = addMonths(start, 1);
  let query = client()
    .from("expenses")
    .select("*,expense_schedules!inner(frequency,first_due,last_due)")
    .eq("business_id", bid)
    .gte("due_date", start)
    .lt("due_date", end)
    .order("due_date")
    .order("id");
  query = deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const rows: Expense[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query.range(from, from + 499);
    if (error) throw error;
    rows.push(...((data ?? []) as Expense[]));
    if (!data || data.length < 500) return rows;
  }
}
