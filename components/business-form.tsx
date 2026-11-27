"use client";
import { TextArea } from "./vip-ui/text-area";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { ComboBox } from "./vip-ui/combo-box";
import { Select } from "./vip-ui/select";
import { TextField } from "./vip-ui/text-field";
import { Checkbox } from "./vip-ui/checkbox";
import { DateInput } from "./date-input";
import { ToastFeedback } from "./feedback";
import { useEffect, useState, type FormEvent } from "react";
import {
  businessSchema,
  days,
  emptyBusiness,
  type Business,
  type BusinessInput,
} from "@/lib/domain";
import { holidayCountries } from "@/lib/holidays";
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
  const [countries, setCountries] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [countryError, setCountryError] = useState(false);
  useEffect(() => {
    let active = true;
    holidayCountries().then(
      (options) => {
        if (active) setCountries(options);
      },
      () => {
        if (active) setCountryError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  function set(field: keyof BusinessInput, v: string) {
    setValue((old) => ({ ...old, [field]: v }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!business && !value.country_code) {
      setError("Choose a country for this business.");
      return;
    }
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
    <Card className="card form-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">Business profile</span>
          <h2>{business ? "Edit business" : "Create your business"}</h2>
        </div>
      </div>
      <Form validationBehavior="native" onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <TextField
              className="wide"
              label="Business name"
              isRequired
              isDisabled={busy}
              maxLength={80}
              value={value.name}
              onChange={(name) => set("name", name)}
              size="lg"
              validationBehavior="native"
            />
            <TextArea
              label="Description"
              className="wide"
              maxLength={500}
              value={value.description}
              onChange={(nextValue) => set("description", nextValue)}
              isDisabled={busy}
            />
            <TextField
              label="Contact email"
              type="email"
              value={value.email}
              onChange={(nextValue) => set("email", nextValue)}
              isDisabled={busy}
            />
            <TextField
              label="Phone"
              type="tel"
              maxLength={40}
              value={value.phone}
              onChange={(nextValue) => set("phone", nextValue)}
              isDisabled={busy}
            />
            <TextArea
              label="Address"
              className="wide"
              maxLength={300}
              value={value.address}
              onChange={(nextValue) => set("address", nextValue)}
              isDisabled={busy}
            />
            <Select
              label="Currency"
              value={value.currency}
              isDisabled={busy}
              onChange={(key) => {
                if (typeof key === "string") set("currency", key);
              }}
              options={[
                ...new Set([
                  value.currency,
                  "LKR",
                  "USD",
                  "CAD",
                  "GBP",
                  "EUR",
                  "AUD",
                ]),
              ].map((code) => ({ id: code, name: code }))}
            />
            <Select
              label="Country"
              description={
                countryError
                  ? "Countries could not be loaded. Reload to try again."
                  : "Used to show public holidays on your calendar."
              }
              placeholder={
                countries.length || countryError
                  ? "Choose a country"
                  : "Loading countries…"
              }
              isRequired={!business}
              isDisabled={busy || !countries.length}
              value={value.country_code ?? null}
              onChange={(country) => {
                if (typeof country === "string") set("country_code", country);
              }}
              options={countries}
            />
            <ComboBox
              label="Timezone"
              inputValue={value.timezone}
              onInputChange={(timezone) => set("timezone", timezone)}
              allowsCustomValue
              isRequired
              isDisabled={busy}
              options={[
                ...new Set([
                  "Asia/Colombo",
                  "Asia/Dubai",
                  "Europe/London",
                  "America/Toronto",
                  "UTC",
                  value.timezone,
                ]),
              ]
                .filter(Boolean)
                .map((zone) => ({ id: zone, name: zone }))}
            />
            <TextField
              label="Opening available balance"
              description="Starting funds available for payments."
              isRequired
              isDisabled={busy}
              inputMode="decimal"
              value={value.opening_balance}
              onChange={(amount) => set("opening_balance", amount)}
            />
            <DateInput
              label="Balance effective date"
              type="date"
              required
              value={value.balance_date}
              onValueChange={(value) => set("balance_date", value)}
            />
            <div className="wide">
              <p className="label">Business days</p>
              <div className="day-picker">
                {days.map((d, i) => (
                  <Checkbox
                    key={d}
                    variant="card"
                    isDisabled={busy}
                    isSelected={value.business_days.includes(i)}
                    onChange={(checked) =>
                      setValue((v) => ({
                        ...v,
                        business_days: checked
                          ? [...v.business_days, i].sort()
                          : v.business_days.filter((day) => day !== i),
                      }))
                    }
                  >
                    {d}
                  </Checkbox>
                ))}
              </div>
            </div>
          </div>
        </fieldset>
        <ToastFeedback error={error} />
        {error && <Notice error>{error}</Notice>}
        <div className="form-actions">
          <Button secondary type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save business"}</Button>
        </div>
      </Form>
    </Card>
  );
}
