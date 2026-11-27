"use client";
import { Button as VipButton } from "./vip-ui/button";
import { TextField } from "./vip-ui/text-field";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { Select } from "./vip-ui/select";
import { Menu, MenuItem, MenuTrigger } from "./vip-ui/menu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./vip-ui/segmented-control";
import { Badge } from "./vip-ui/badge";
import { DateInput } from "./date-input";
import { ToastFeedback, useFeedback } from "./feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Business, localDate } from "@/lib/domain";
import { readableError } from "@/lib/supabase";
import { decimalAmount, formatMinor } from "@/lib/expenses";
import {
  fundSchema,
  fundCommand,
  fundEntries,
  fundTotals,
  fundHistory,
  monthBounds,
  type FundEntry,
  type FundInput,
  type FundHistory,
  type Totals,
} from "@/lib/funds";
import { settlementBalance } from "@/lib/settlements";
import { HistoryChanges } from "./history-changes";
import { Button, Notice } from "./ui";
export function FundsPanel({
  business,
  owner,
}: {
  business: Business;
  owner: boolean;
}) {
  const { confirm } = useFeedback();
  const today = localDate(business.timezone),
    canWrite = owner && !business.archived_at;
  const [month, setMonth] = useState(today.slice(0, 7)),
    [day, setDay] = useState(today),
    [reversed, setReversed] = useState(false);
  const [rows, setRows] = useState<FundEntry[]>([]),
    [summary, setSummary] = useState<{
      daily: Totals;
      monthly: Totals;
      all: Totals;
      balance: { business: bigint; external: bigint };
    } | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState<FundInput | null>(null),
    [editing, setEditing] = useState<FundEntry | null>(null),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState<{
      id: string;
      items: FundHistory[];
    } | null>(null);
  const lock = useRef(false),
    generation = useRef(0),
    request = useRef("");
  async function reload() {
    const n = ++generation.current;
    setLoading(true);
    setSummary(null);
    try {
      const { from, to } = monthBounds(month);
      const [entries, daily, monthly, all, balance] = await Promise.all([
        fundEntries(business.id, from, to, reversed),
        fundTotals(business.id, day, day),
        fundTotals(business.id, from, to),
        fundTotals(business.id, business.balance_date, today),
        settlementBalance(business.id, today),
      ]);
      if (n === generation.current) {
        setRows(entries);
        setSummary({ daily, monthly, all, balance });
      }
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setHistory(null);
    setForm(null);
    reload().catch((e) => setError(readableError(e)));
    return () => {
      generation.current++;
    };
  }, [business.id, month, day, reversed]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!navigator.onLine) throw Error("offline");
      await fn();
    } catch (e) {
      setError(readableError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function open(entry?: FundEntry, kind: FundInput["kind"] = "collection") {
    setEditing(entry ?? null);
    setReason("");
    request.current = crypto.randomUUID();
    setForm(
      entry
        ? {
            kind: entry.kind,
            amount: decimalAmount(entry.amount_minor),
            received_on: entry.received_on,
            note: entry.note,
          }
        : { kind, amount: "", received_on: day, note: "" },
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = fundSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (
      parsed.data.received_on < business.balance_date ||
      parsed.data.received_on > today
    ) {
      setError("Choose a date between the opening balance date and today.");
      return;
    }
    if (editing && !reason.trim()) {
      setError("Enter a correction reason.");
      return;
    }
    await run(async () => {
      await fundCommand(editing ? "correct" : "create", {
        ...parsed.data,
        business_id: business.id,
        id: editing?.id ?? request.current,
        version: editing?.version,
        reason: reason.trim(),
      });
      setForm(null);
      setHistory(null);
      setMessage("Entry saved.");
      await reload();
    });
  }
  async function change(entry: FundEntry) {
    const restoring = Boolean(entry.reversed_at);
    const action = restoring ? "Restore entry" : "Reverse entry";
    const accepted = await confirm({
      title: action + "?",
      description: `${fmt(BigInt(entry.amount_minor))} received on ${entry.received_on}. ${restoring ? "The amount will count toward available funds again." : "The amount will be excluded from available funds. The entry stays in the audit history."}`,
      action,
      danger: !restoring,
      reason: true,
      perform: async (why) => {
        await fundCommand(restoring ? "restore" : "reverse", {
          business_id: business.id,
          id: entry.id,
          version: entry.version,
          reason: why,
        });
      },
    });
    if (accepted === null) return;
    setHistory(null);
    setMessage(restoring ? "Entry restored." : "Entry reversed.");
    await reload().catch((e) => setError(readableError(e)));
  }
  const fmt = (v: bigint) => formatMinor(v, business.currency);
  return (
    <div className="stack">
      <ToastFeedback error={error} message={message} />
      {error && (
        <Notice error>
          {error}{" "}
          <VipButton
            type="button"
            variant="minimal"
            className="text-link"
            isDisabled={busy}
            onClick={() => run(reload)}
          >
            Refresh
          </VipButton>
        </Notice>
      )}

      <Card className="card expense-toolbar workspace-summary">
        <div>
          <h2>Available funds</h2>
          <div className="expense-total">
            {summary
              ? fmt(summary.balance.business + summary.balance.external)
              : "—"}
          </div>
          <dl className="fund-pools">
            <div>
              <dt>Business funds</dt>
              <dd>{summary ? fmt(summary.balance.business) : "—"}</dd>
            </div>
            <div>
              <dt>External funds</dt>
              <dd>{summary ? fmt(summary.balance.external) : "—"}</dd>
            </div>
          </dl>
        </div>
        {canWrite && (
          <div className="actions">
            <Button
              disabled={busy || loading}
              onClick={() => open(undefined, "collection")}
            >
              Record collection
            </Button>
            <Button
              secondary
              disabled={busy || loading}
              onClick={() => open(undefined, "external")}
            >
              Add external funds
            </Button>
          </div>
        )}
      </Card>
      <Card className="card stack">
        <div className="form-grid">
          <DateInput
            label="Collection date"
            today={today}
            type="date"
            value={day}
            max={today}
            disabled={busy}
            onValueChange={(value) => {
              if (value) setDay(value);
            }}
          />
          <DateInput
            label="Month"
            today={today}
            type="month"
            value={month}
            max={today.slice(0, 7)}
            disabled={busy}
            onValueChange={(value) => {
              if (value) setMonth(value);
            }}
          />
        </div>
        <div className="overview-grid">
          <div>
            <span className="eyebrow">Daily collections</span>
            <div className="expense-total">
              {summary ? fmt(summary.daily.collection) : "—"}
            </div>
            <p className="muted">
              External funds: {summary ? fmt(summary.daily.external) : "—"}
            </p>
          </div>
          <div>
            <span className="eyebrow">Monthly collections</span>
            <div className="expense-total">
              {summary ? fmt(summary.monthly.collection) : "—"}
            </div>
            <p className="muted">
              External funds: {summary ? fmt(summary.monthly.external) : "—"}
            </p>
          </div>
        </div>
      </Card>
      {form && canWrite && (
        <Card className="card form-card">
          <h2>{editing ? "Correct entry" : "New incoming funds"}</h2>
          <Form validationBehavior="native" onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="form-grid">
                <Select
                  label="Type"
                  value={form.kind}
                  isDisabled={busy}
                  onChange={(kind) => {
                    if (kind === "collection" || kind === "external")
                      setForm({ ...form, kind });
                  }}
                  options={[
                    { id: "collection", name: "Business collection" },
                    { id: "external", name: "External funding" },
                  ]}
                />
                <TextField
                  label={`Amount (${business.currency})`}
                  isRequired
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(nextValue) =>
                    setForm({ ...form, amount: nextValue })
                  }
                  isDisabled={busy}
                />
                <DateInput
                  label="Received date"
                  today={today}
                  required
                  type="date"
                  min={business.balance_date}
                  max={today}
                  value={form.received_on}
                  onValueChange={(value) =>
                    setForm({ ...form, received_on: value })
                  }
                />
                <TextField
                  label="Note / source"
                  maxLength={500}
                  value={form.note}
                  onChange={(nextValue) =>
                    setForm({ ...form, note: nextValue })
                  }
                  isDisabled={busy}
                />
                {editing && (
                  <TextField
                    label="Correction reason"
                    isRequired
                    maxLength={500}
                    value={reason}
                    onChange={(nextValue) => setReason(nextValue)}
                    isDisabled={busy}
                  />
                )}
              </div>
            </fieldset>
            <div className="form-actions">
              <Button
                secondary
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? "Saving…" : "Save entry"}</Button>
            </div>
          </Form>
        </Card>
      )}
      <Card className="card stack">
        <div className="section-title">
          <h2>
            {month} · {reversed ? "Reversed entries" : "Incoming funds"}
          </h2>
          <SegmentedControl
            aria-label="Entry status"
            value={reversed ? "reversed" : "active"}
            disabled={busy}
            onValueChange={({ value }) => setReversed(value === "reversed")}
          >
            <SegmentedControlItem value="active">Active</SegmentedControlItem>
            <SegmentedControlItem value="reversed">
              Reversed
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : !rows.length ? (
          <p className="muted">No entries for this month.</p>
        ) : (
          rows.map((entry) => (
            <div className="member-row" key={entry.id}>
              <div>
                <strong>
                  {entry.kind === "collection"
                    ? "Collection"
                    : "External funding"}
                </strong>
                <small>
                  {entry.received_on}
                  {entry.note && " · " + entry.note}
                </small>
                {entry.reversed_at && (
                  <Badge dot variant="error">
                    Reversed
                  </Badge>
                )}
                <strong>{fmt(BigInt(entry.amount_minor))}</strong>
              </div>
              <div className="actions">
                {canWrite && (
                  <Button
                    secondary
                    danger={!entry.reversed_at}
                    disabled={busy}
                    onClick={() => change(entry)}
                  >
                    {entry.reversed_at ? "Restore entry" : "Reverse entry"}
                  </Button>
                )}
                {owner && (
                  <MenuTrigger>
                    <Button type="button" secondary disabled={busy}>
                      More actions
                    </Button>
                    <Menu aria-label="Entry actions">
                      {canWrite && !entry.reversed_at && (
                        <MenuItem onAction={() => open(entry)}>
                          Correct entry
                        </MenuItem>
                      )}
                      <MenuItem
                        onAction={() =>
                          run(async () =>
                            setHistory({
                              id: entry.id,
                              items: await fundHistory(business.id, entry.id),
                            }),
                          )
                        }
                      >
                        View history
                      </MenuItem>
                    </Menu>
                  </MenuTrigger>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
      {history && (
        <Card className="card stack">
          <div className="section-title">
            <h2>Entry history</h2>
            <Button secondary onClick={() => setHistory(null)}>
              Close
            </Button>
          </div>
          {history.items.map((h) => (
            <details key={h.id}>
              <summary>
                {h.action} · {new Date(h.created_at).toLocaleString()}
              </summary>
              <p>{h.reason || "Original entry"}</p>
              <HistoryChanges
                kind="fund"
                before={h.before_record}
                after={h.after_record}
                currency={business.currency}
              />
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
