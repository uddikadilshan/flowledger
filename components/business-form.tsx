"use client";
import { useState, type FormEvent } from "react";
import {
  businessSchema,
  days,
  emptyBusiness,
  type Business,
  type BusinessInput,
} from "@/lib/domain";
import { saveBusiness } from "@/lib/api";
import { readableError } from "@/lib/supabase";
import { Button, Notice } from "./ui";
export function BusinessForm({
  business,
  onSaved,
  onCancel,
}: {
  business?: Business;
  onSaved: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<BusinessInput>(
      business || emptyBusiness(),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function set(field: keyof BusinessInput, v: string) {
    setValue((old) => ({ ...old, [field]: v }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = businessSchema.safeParse(value);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine) throw new Error("offline");
      const id = await saveBusiness(result.data, business?.id);
      await onSaved(id);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card form-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">Business profile</span>
          <h2>{business ? "Edit business" : "Create your business"}</h2>
        </div>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label className="wide">
              Business name
              <input
                required
                maxLength={80}
                value={value.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <label className="wide">
              Description
              <textarea
                maxLength={500}
                value={value.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                value={value.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                maxLength={40}
                value={value.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </label>
            <label className="wide">
              Address
              <textarea
                maxLength={300}
                value={value.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                value={value.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {Array.from(
                  new Set([
                    value.currency,
                    "LKR",
                    "USD",
                    "CAD",
                    "GBP",
                    "EUR",
                    "AUD",
                  ]),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Timezone
              <input
                required
                value={value.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                list="timezones"
              />
              <datalist id="timezones">
                {[
                  "Asia/Colombo",
                  "Asia/Dubai",
                  "Europe/London",
                  "America/Toronto",
                  "UTC",
                ].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label>
              Opening available balance
              <input
                required
                inputMode="decimal"
                value={value.opening_balance}
                onChange={(e) => set("opening_balance", e.target.value)}
              />
              <small>Starting funds, not total income.</small>
            </label>
            <label>
              Balance effective date
              <input
                type="date"
                required
                value={value.balance_date}
                onChange={(e) => set("balance_date", e.target.value)}
              />
            </label>
            <div className="wide">
              <p className="label">Business days</p>
              <div className="day-picker">
                {days.map((d, i) => (
                  <label
                    key={d}
                    className={
                      value.business_days.includes(i) ? "selected" : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={value.business_days.includes(i)}
                      onChange={(e) =>
                        setValue((v) => ({
                          ...v,
                          business_days: e.target.checked
                            ? [...v.business_days, i].sort()
                            : v.business_days.filter((x) => x !== i),
                        }))
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </fieldset>
        {error && <Notice error>{error}</Notice>}
        <div className="form-actions">
          <Button secondary type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save business"}</Button>
        </div>
      </form>
    </section>
  );
}
