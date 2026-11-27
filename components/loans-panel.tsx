"use client";
import { Button as VipButton } from "./vip-ui/button";
import { TextField } from "./vip-ui/text-field";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { Tabs, TabList, Tab, TabPanel } from "./vip-ui/tabs";
import { DateInput } from "./date-input";
import { ToastFeedback, useFeedback } from "./feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Business, localDate } from "@/lib/domain";
import { readableError } from "@/lib/supabase";
import { decimalAmount, formatMinor } from "@/lib/expenses";
import {
  loanSchema,
  buildSchedule,
  loanCommand,
  loansFor,
  instalmentsFor,
  loanHistoryFor,
  type Loan,
  type LoanInput,
  type Instalment,
  type LoanHistory,
} from "@/lib/loans";
import { HistoryChanges } from "./history-changes";
import { Button, Notice } from "./ui";
export function LoansPanel({
  business,
  owner,
}: {
  business: Business;
  owner: boolean;
}) {
  const { confirm } = useFeedback();
  const today = localDate(business.timezone),
    canWrite = owner && !business.archived_at;
  const [deleted, setDeleted] = useState(false),
    [rows, setRows] = useState<Loan[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState<LoanInput | null>(null),
    [editing, setEditing] = useState<Loan | null>(null),
    [detail, setDetail] = useState<{
      loan: Loan;
      items: Instalment[];
      history: LoanHistory[];
    } | null>(null);
  const lock = useRef(false),
    request = useRef(""),
    generation = useRef(0);
  async function reload() {
    const n = ++generation.current;
    setLoading(true);
    try {
      const data = await loansFor(business.id, deleted);
      if (n === generation.current) setRows(data);
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setDetail(null);
    setForm(null);
    reload().catch((e) => setError(readableError(e)));
    return () => {
      generation.current++;
    };
  }, [business.id, deleted]);
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
  function open(l?: Loan) {
    setEditing(l ?? null);
    request.current = crypto.randomUUID();
    setForm(
      l
        ? {
            title: l.title,
            lender: l.lender,
            total: decimalAmount(l.total_minor),
            prior: decimalAmount(l.prior_minor),
            monthly: decimalAmount(l.monthly_minor),
            start_date: l.start_date,
            first_due: l.first_due,
            end_date: l.end_date,
          }
        : {
            title: "",
            lender: "",
            total: "",
            prior: "0",
            monthly: "",
            start_date: today,
            first_due: today,
            end_date: today,
          },
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = loanSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await run(async () => {
      await loanCommand(editing ? "update" : "create", {
        ...parsed.data,
        business_id: business.id,
        id: editing?.id ?? request.current,
        version: editing?.version,
      });
      setForm(null);
      setDetail(null);
      setMessage("Loan saved.");
      await reload();
    });
  }
  async function change(l: Loan) {
    const restore = Boolean(l.deleted_at);
    const update = async () => {
      await loanCommand(restore ? "restore" : "delete", {
        business_id: business.id,
        id: l.id,
        version: l.version,
      });
    };
    const updateScreen = async () => {
      setDetail(null);
      setMessage(restore ? "Loan restored." : "Loan archived.");
      await reload();
    };
    if (restore)
      return run(async () => {
        await update();
        await updateScreen();
      });
    const accepted = await confirm({
      title: `Archive ${l.title}?`,
      description: "The schedule and change history will be preserved.",
      action: "Archive loan",
      danger: true,
      perform: update,
    });
    if (accepted !== null)
      await updateScreen().catch((err) => setError(readableError(err)));
  }
  const total = rows.reduce(
    (s, l) => s + BigInt(l.total_minor) - BigInt(l.prior_minor),
    0n,
  );
  const fields: {
    key: keyof LoanInput;
    label: string;
    type?: string;
    money?: boolean;
  }[] = [
    { key: "title", label: "Loan name" },
    { key: "lender", label: "Lender" },
    { key: "total", label: "Total contractual repayment", money: true },
    { key: "prior", label: "Already paid before tracking", money: true },
    { key: "monthly", label: "Monthly instalment", money: true },
    { key: "start_date", label: "Loan start date", type: "date" },
    { key: "first_due", label: "First remaining due date", type: "date" },
    { key: "end_date", label: "Contract end date", type: "date" },
  ];
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
          <span className="eyebrow">
            {deleted ? "Archived loans" : "Opening outstanding loan balance"}
          </span>
          <div className="expense-total">
            {loading ? "Loading…" : formatMinor(total, business.currency)}
          </div>
          <p className="muted">
            Contract totals less previously paid amounts. New payments will be
            tracked in settlements.
          </p>
        </div>
        <div className="actions">
          <Button
            secondary
            disabled={busy}
            onClick={() => setDeleted(!deleted)}
          >
            {deleted ? "Active loans" : "Archived loans"}
          </Button>
          {canWrite && !deleted && (
            <Button disabled={busy || loading} onClick={() => open()}>
              Add loan
            </Button>
          )}
        </div>
      </Card>
      {form && canWrite && (
        <Card className="card form-card">
          <h2>{editing ? "Edit loan" : "New loan"}</h2>
          <p className="muted">
            Enter the full contractual repayment including agreed interest.
            Editing replaces the remaining schedule; the previous schedule is
            retained in history.
          </p>
          <Form validationBehavior="native" onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="form-grid">
                {fields.map((f) =>
                  f.type === "date" ? (
                    <DateInput
                      key={f.key}
                      label={f.label}
                      today={today}
                      required
                      type="date"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={form[f.key]}
                      onValueChange={(value) =>
                        setForm({ ...form, [f.key]: value })
                      }
                    />
                  ) : (
                    <TextField
                      key={f.key}
                      label={
                        f.money ? `${f.label} (${business.currency})` : f.label
                      }
                      isRequired={f.key !== "lender"}
                      isDisabled={busy}
                      inputMode={f.money ? "decimal" : undefined}
                      value={form[f.key]}
                      onChange={(value) => setForm({ ...form, [f.key]: value })}
                    />
                  ),
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
              <Button disabled={busy}>{busy ? "Saving…" : "Save loan"}</Button>
            </div>
          </Form>
        </Card>
      )}
      <div className={detail ? "loan-workspace has-detail" : "loan-workspace"}>
        <div className="loan-list">
          {loading ? (
            <p className="muted">Loading loans…</p>
          ) : !rows.length ? (
            <Card className="card empty">
              <h2>No {deleted ? "archived " : ""}loans yet</h2>
              <p>Loan schedules will appear here.</p>
            </Card>
          ) : (
            <div className="loan-list-rows">
              {rows.map((l) => {
                const next = l.deleted_at
                  ? undefined
                  : buildSchedule(
                      decimalAmount(l.total_minor),
                      decimalAmount(l.prior_minor),
                      decimalAmount(l.monthly_minor),
                      l.first_due,
                      l.end_date,
                    ).find((item) => item.due_date >= today);
                return (
                  <Card role="article" className="card stack" key={l.id}>
                    <h2>{l.title}</h2>
                    <p className="muted">
                      {l.lender || "Lender not specified"}
                    </p>
                    {next && (
                      <p className="loan-next">
                        <span>Next scheduled instalment · {next.due_date}</span>
                        <strong>
                          {formatMinor(next.amount_minor, business.currency)}
                        </strong>
                      </p>
                    )}
                    <span className="eyebrow">Opening outstanding</span>
                    <div className="expense-total">
                      {formatMinor(
                        BigInt(l.total_minor) - BigInt(l.prior_minor),
                        business.currency,
                      )}
                    </div>
                    <dl>
                      <dt>Total repayment</dt>
                      <dd>
                        {formatMinor(BigInt(l.total_minor), business.currency)}
                      </dd>
                      <dt>Previously paid</dt>
                      <dd>
                        {formatMinor(BigInt(l.prior_minor), business.currency)}
                      </dd>
                      <dt>Monthly instalment</dt>
                      <dd>
                        {formatMinor(
                          BigInt(l.monthly_minor),
                          business.currency,
                        )}
                      </dd>
                      <dt>Contract period</dt>
                      <dd>
                        {l.start_date} – {l.end_date}
                      </dd>
                    </dl>
                    <div className="actions">
                      <Button
                        secondary
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const [items, history] = await Promise.all([
                              instalmentsFor(business.id, l.id),
                              owner
                                ? loanHistoryFor(business.id, l.id)
                                : Promise.resolve([]),
                            ]);
                            setDetail({ loan: l, items, history });
                          })
                        }
                      >
                        Schedule{owner ? " & history" : ""}
                      </Button>
                      {canWrite && (
                        <>
                          {!l.deleted_at && (
                            <Button
                              secondary
                              disabled={busy}
                              onClick={() => open(l)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            secondary
                            disabled={busy}
                            onClick={() => change(l)}
                          >
                            {l.deleted_at ? "Restore" : "Archive"}
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        {detail && (
          <Card className="card stack loan-detail">
            <div className="section-title">
              <h2>{detail.loan.title}</h2>
              <Button secondary onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
            <Tabs key={detail.loan.id} defaultSelectedKey="schedule">
              <TabList aria-label="Loan details">
                <Tab id="schedule">Repayment schedule</Tab>
                {owner && <Tab id="history">Change history</Tab>}
              </TabList>
              <TabPanel id="schedule">
                <p className="muted">
                  {detail.items.length} scheduled instalments · Dates do not
                  confirm payment status.
                </p>
                {detail.items.map((i) => (
                  <div className="member-row" key={i.id}>
                    <span>
                      {i.due_date}
                      {i.due_date < today ? " · Past due date" : ""}
                    </span>
                    <strong>
                      {formatMinor(BigInt(i.amount_minor), business.currency)}
                    </strong>
                  </div>
                ))}
              </TabPanel>
              {owner && (
                <TabPanel id="history">
                  {!detail.history.length && <p>No changes recorded.</p>}
                  {detail.history.map((h) => (
                    <details key={h.id}>
                      <summary>
                        {h.action} · {new Date(h.created_at).toLocaleString()}
                      </summary>
                      <HistoryChanges
                        kind="loan"
                        before={h.before_record}
                        after={h.after_record}
                        currency={business.currency}
                      />
                    </details>
                  ))}
                </TabPanel>
              )}
            </Tabs>
          </Card>
        )}
      </div>
    </div>
  );
}
