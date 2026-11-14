import { z } from "zod";
export const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const businessSchema = z.object({
  name: z.string().trim().min(1, "Enter a business name.").max(80),
  description: z.string().trim().max(500),
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Enter a three-letter currency code."),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone."),
  opening_balance: z
    .string()
    .regex(
      /^\d{1,12}(\.\d{1,2})?$/,
      "Enter a non-negative amount with up to two decimal places.",
    ),
  balance_date: z.iso.date(),
  business_days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Choose at least one business day.")
    .refine((v) => new Set(v).size === v.length),
});
export type BusinessInput = z.infer<typeof businessSchema>;
export type Business = BusinessInput & {
  id: string;
  owner_id: string;
  logo_path: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Member = {
  business_id: string;
  user_id: string;
  role: "owner" | "viewer";
  email: string;
  created_at: string;
};
export type Invitation = {
  id: string;
  business_id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
export function invitationStatus(i: Invitation, now = Date.now()) {
  return i.revoked_at
    ? "Revoked"
    : i.accepted_at
      ? "Accepted"
      : new Date(i.expires_at).getTime() <= now
        ? "Expired"
        : "Pending";
}
export function money(value: string | number, currency = "LKR") {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function localDate(timeZone = "Asia/Colombo") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function emptyBusiness(): BusinessInput {
  return {
    name: "",
    description: "",
    email: "",
    phone: "",
    address: "",
    currency: "LKR",
    timezone: "Asia/Colombo",
    opening_balance: "0",
    balance_date: localDate(),
    business_days: [1, 2, 3, 4, 5, 6],
  };
}
export function validLogo(file: Pick<File, "type" | "size">) {
  return (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
    file.size > 0 &&
    file.size <= 512000
  );
}
