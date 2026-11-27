"use client";
import { Button as VipButton } from "./vip-ui/button";
import { TextField } from "./vip-ui/text-field";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { DialogContent } from "./vip-ui/dialog";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./vip-ui/segmented-control";
import { Badge } from "./vip-ui/badge";
import { Checkbox } from "./vip-ui/checkbox";
import { DateInput } from "./date-input";
import { ToastFeedback, useFeedback } from "./feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { type Business, localDate } from "@/lib/domain";
import { formatMinor, decimalAmount } from "@/lib/expenses";
import { monthBounds } from "@/lib/funds";
import {
  settlementBalance,
  targetsFor,
  settlementsFor,
  settlementCommand,
  remaining,
  paymentStatus,
  parseAllocation,
  type Target,
  type Settlement,
} from "@/lib/settlements";
import { readableError } from "@/lib/supabase";
import type { Notification } from "@/lib/notifications";
import { Button, Notice } from "./ui";
export function SettlementsPanel({
  business,
  owner,
  alert,
  linkedObligation,
}: {
  business: Business;
  owner: boolean;
  alert?: Notification | null;
  linkedObligation?: { target: Target; pay: boolean } | null;
}) {
  const { confirm } = useFeedback();
  const today = localDate(business.timezone),
    canWrite = owner && !business.archived_at;
  const [notificationKind, notificationTarget] =
    alert?.alert_key.split(":") ?? [];
  const alertKind = linkedObligation?.target.kind ?? notificationKind;
  const alertTarget = linkedObligation?.target.id ?? notificationTarget;
  const dueFromAlert =
    linkedObligation?.target.due_date ??
    alert?.detail.match(/ · Due (\d{4}-\d{2}-\d{2})$/)?.[1];
  const [month, setMonth] = useState(
      dueFromAlert?.slice(0, 7) ?? today.slice(0, 7),
    ),
    [allDue, setAllDue] = useState(Boolean(notificationTarget));
  const [data, setData] = useState<{
    targets: Target[];
    payments: Settlement[];
    balance: { business: bigint; external: bigint };
  } | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target | null>(null),
    [bm, setBm] = useState("0"),
    [em, setEm] = useState("0"),
    [date, setDate] = useState(today),
    [note, setNote] = useState("");
  const lock = useRef(false),
    generation = useRef(0),
    request = useRef("");
  const [view, setView] = useState<"obligations" | "history">("obligations");
  const [status, setStatus] = useState<
    "all" | "outstanding" | "overdue" | "paid"
  >("all");
  const [uncertain, setUncertain] = useState(false);
  const alertRow = useRef<HTMLDivElement>(null);
  const alertSummary = useRef<HTMLParagraphElement>(null);
  const handledAlert = useRef(false);
  useEffect(() => {
    if (!data || !alertTarget || handledAlert.current) return;
    handledAlert.current = true;
    (alertRow.current ?? alertSummary.current)?.focus();
    if (linkedObligation?.pay && canWrite) {
      const obligation = data.targets.find(
        (item) => item.id === alertTarget && item.kind === alertKind,
      );
      if (obligation && remaining(obligation) > 0n) open(obligation);
    }
  }, [data, alertTarget, alertKind, linkedObligation, canWrite]);
  const fmt = (v: bigint) => formatMinor(v, business.currency);
  async function reload() {
    const n = ++generation.current;
    setData(null);
    const { from, to } = monthBounds(month);
    const [targets, payments, balance] = await Promise.all([
      targetsFor(
        business.id,
        allDue ? "2000-01-01" : from,
        allDue ? "2100-12-31" : to,
      ),
      settlementsFor(business.id, from, to),
      settlementBalance(business.id, today),
    ]);
    if (n === generation.current) setData({ targets, payments, balance });
  }
  useEffect(() => {
    setTarget(null);
    setError("");
    reload().catch((e) => setError(readableError(e)));
    return () => {
      generation.current++;
    };
  }, [business.id, month, allDue, today]);
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
  function open(t: Target) {
    if (!data) return;
    setError("");
    setTarget(t);
    setUncertain(false);
    const part =
      data.balance.business < remaining(t)
        ? data.balance.business
        : remaining(t);
    setBm(decimalAmount(part));
    setEm(
      decimalAmount(
        data.balance.external < remaining(t) - part
          ? data.balance.external
          : remaining(t) - part,
      ),
    );
    setDate(today);
    setNote("");
    request.current = crypto.randomUUID();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    try {
      const a = parseAllocation(bm, em);
      if (a.total > remaining(target))
        throw Error("Payment exceeds remaining amount.");
      if (date < business.balance_date || date > today)
        throw Error("Choose a valid tracking date.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid payment.");
      return;
    }
    await run(async () => {
      try {
        await settlementCommand("create", {
          business_id: business.id,
          id: request.current,
          expense_id: target.kind === "expense" ? target.id : null,
          instalment_id: target.kind === "loan" ? target.id : null,
          business_amount: bm,
          external_amount: em,
          paid_on: date,
          note,
        });
      } catch (err) {
        const text = readableError(err);
        if (text.startsWith("Connection failed")) {
          setUncertain(true);
          throw new Error("payment status uncertain");
        }
        throw err;
      }
      setTarget(null);
      setMessage("Payment recorded.");
      await reload();
    });
  }
  async function reverse(p: Settlement) {
    const accepted = await confirm({
      title: "Reverse payment?",
      description: `${p.target_label} · ${fmt(BigInt(p.business_minor) + BigInt(p.external_minor))} paid on ${p.paid_on}. The amount will be due again and the payment will remain in history.`,
      action: "Reverse payment",
      danger: true,
      reason: true,
      perform: async (reason) => {
        if (!navigator.onLine) throw Error("offline");
        await settlementCommand("reverse", {
          business_id: business.id,
          id: p.id,
          reason,
        });
      },
    });
    if (accepted === null) return;
    setMessage("Payment reversed.");
    await reload().catch((e) => setError(readableError(e)));
  }
  let paymentTotal: bigint | null = null;
  if (target) {
    try {
      paymentTotal = parseAllocation(bm, em).total;
    } catch {
      /* Wait for valid amounts. */
    }
  }
  const visibleTargets = data?.targets.filter((item) => {
    if (status === "all") return true;
    const unpaid = remaining(item) > 0n;
    if (status === "paid") return !unpaid;
    return unpaid && (status !== "overdue" || item.due_date < today);
  });
  const alertFound = data?.targets.some(
    (t) => t.id === alertTarget && t.kind === alertKind,
  );
  return (
    <div className="stack">
      <ToastFeedback error={error} message={message} />
      {error && !target && (
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

      <Card className="card stack workspace-summary">
        <span className="eyebrow">Available funds after payments</span>
        <div className="expense-total">
          {data ? fmt(data.balance.business + data.balance.external) : "—"}
        </div>
        <div className="form-grid">
          <div>
            Business funds
            <br />
            <strong>{data ? fmt(data.balance.business) : "—"}</strong>
          </div>
          <div>
            External funds
            <br />
            <strong>{data ? fmt(data.balance.external) : "—"}</strong>
          </div>
        </div>
        <p className="muted">
          Opening balance and incoming funds less active payments through{" "}
          {today}.
        </p>
      </Card>
      <Card className="card ledger-controls">
        <SegmentedControl
          aria-label="Settlement view"
          value={view}
          onValueChange={({ value }) => {
            if (value === "history" || value === "obligations") setView(value);
          }}
        >
          <SegmentedControlItem value="obligations">
            Obligations
          </SegmentedControlItem>
          <SegmentedControlItem value="history">
            Payment history
          </SegmentedControlItem>
        </SegmentedControl>
        <div className="form-grid">
          <DateInput
            label="Month"
            today={today}
            type="month"
            value={month}
            disabled={busy}
            onValueChange={(value) => {
              if (value) setMonth(value);
            }}
          />
          {view === "obligations" && (
            <Checkbox
              isSelected={allDue}
              isDisabled={busy}
              onChange={setAllDue}
            >
              Show all due dates
            </Checkbox>
          )}
        </div>
      </Card>
      <DialogContent
        size="xl"
        aria-labelledby="payment-title"
        overlayProps={{
          isOpen: Boolean(target && canWrite),
          isDismissable: false,
          isKeyboardDismissDisabled: busy,
          onOpenChange: (open) => {
            if (!open && !lock.current) {
              setTarget(null);
              setError("");
            }
          },
        }}
      >
        {target && canWrite && (
          <>
            <h2 id="payment-title">Pay {target.label}</h2>
            {error && <Notice error>{error}</Notice>}
            <p>
              Remaining: {fmt(remaining(target))} · Due {target.due_date}
            </p>
            <Form
              validationBehavior="native"
              className="payment-editor"
              onSubmit={save}
            >
              <fieldset disabled={busy || uncertain}>
                <div className="form-grid">
                  <TextField
                    label="Business funds"
                    autoFocus
                    isRequired
                    inputMode="decimal"
                    value={bm}
                    onChange={(nextValue) => setBm(nextValue)}
                    isDisabled={busy || uncertain}
                  />
                  <TextField
                    label="External funds"
                    isRequired
                    inputMode="decimal"
                    value={em}
                    onChange={(nextValue) => setEm(nextValue)}
                    isDisabled={busy || uncertain}
                  />
                  <DateInput
                    label="Payment date"
                    today={today}
                    required
                    type="date"
                    min={business.balance_date}
                    max={today}
                    value={date}
                    onValueChange={(value) => setDate(value)}
                  />
                  <TextField
                    label="Note"
                    maxLength={500}
                    value={note}
                    onChange={(nextValue) => setNote(nextValue)}
                    isDisabled={busy || uncertain}
                  />
                </div>
              </fieldset>
              <p className="payment-total">
                Total payment{" "}
                <strong>
                  {paymentTotal === null ? "—" : fmt(paymentTotal)}
                </strong>
              </p>
              <div className="form-actions">
                <Button
                  secondary
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setTarget(null);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={busy}>
                  {uncertain ? "Retry same payment" : "Record payment"}
                </Button>
              </div>
            </Form>
          </>
        )}
      </DialogContent>
      <Card className="card stack" hidden={view !== "obligations"}>
        <div className="section-title">
          <h2>Expenses and loan instalments</h2>
          <SegmentedControl
            aria-label="Obligation status"
            value={status}
            onValueChange={({ value }) => {
              if (
                value === "all" ||
                value === "outstanding" ||
                value === "overdue" ||
                value === "paid"
              )
                setStatus(value);
            }}
          >
            <SegmentedControlItem value="all">All</SegmentedControlItem>
            <SegmentedControlItem value="outstanding">
              Open
            </SegmentedControlItem>
            <SegmentedControlItem value="overdue">Overdue</SegmentedControlItem>
            <SegmentedControlItem value="paid">Paid</SegmentedControlItem>
          </SegmentedControl>
        </div>
        {alertTarget && data && !alertFound && (
          <p ref={alertSummary} tabIndex={-1}>
            The selected obligation is unavailable or outside the selected date
            range.
          </p>
        )}
        {!data ? (
          <p>Loading…</p>
        ) : !visibleTargets?.length ? (
          <p>No obligations match this period and status.</p>
        ) : (
          visibleTargets.map((t) => {
            const linked = t.id === alertTarget && t.kind === alertKind;
            return (
              <div
                className={
                  linked ? "member-row linked-obligation" : "member-row"
                }
                key={t.kind + t.id}
                ref={linked ? alertRow : undefined}
                tabIndex={linked ? -1 : undefined}
              >
                <div>
                  {linked && (
                    <small>
                      {linkedObligation
                        ? "Selected in calendar"
                        : "From your notification"}
                    </small>
                  )}
                  <strong>{t.label}</strong>
                  <small>
                    {t.kind === "loan" ? "Loan instalment" : "Expense"} ·{" "}
                    {t.due_date}
                  </small>
                  <small>
                    Scheduled {fmt(BigInt(t.amount_minor))} · Paid{" "}
                    {fmt(BigInt(t.paid_minor))}
                  </small>
                  <Badge
                    dot
                    variant={
                      remaining(t) === 0n
                        ? "success"
                        : t.due_date < today
                          ? "error"
                          : "warning"
                    }
                  >
                    {remaining(t) > 0n && t.due_date < today
                      ? "Overdue"
                      : paymentStatus(t)}
                  </Badge>
                  <strong>Remaining {fmt(remaining(t))}</strong>
                </div>
                {canWrite && remaining(t) > 0n && (
                  <Button secondary disabled={busy} onClick={() => open(t)}>
                    Pay
                  </Button>
                )}
              </div>
            );
          })
        )}
      </Card>
      <Card className="card stack" hidden={view !== "history"}>
        <h2>Payment history · {month}</h2>
        {!data ? (
          <p>Loading…</p>
        ) : !data.payments.length ? (
          <p>No payments recorded.</p>
        ) : (
          data.payments.map((p) => (
            <div className="member-row" key={p.id}>
              <div>
                <strong>
                  {p.target_label} ·{" "}
                  {fmt(BigInt(p.business_minor) + BigInt(p.external_minor))}
                </strong>
                <small>
                  {p.paid_on} · Due {p.due_date}
                </small>
                <small>
                  Business {fmt(BigInt(p.business_minor))} · External{" "}
                  {fmt(BigInt(p.external_minor))}
                </small>
                <Badge dot variant={p.reversed_at ? "error" : "success"}>
                  {p.reversed_at ? "Reversed" : "Recorded"}
                </Badge>
                {p.note && <small>{p.note}</small>}
                {p.reversed_at && <small>Reversal: {p.reversal_reason}</small>}
              </div>
              {canWrite && !p.reversed_at && (
                <Button
                  secondary
                  danger
                  disabled={busy}
                  onClick={() => reverse(p)}
                >
                  Reverse payment
                </Button>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
