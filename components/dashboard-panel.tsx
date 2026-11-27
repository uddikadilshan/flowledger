"use client";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Landmark,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Tabs, Tab, TabList, TabPanel } from "./vip-ui/tabs";
import { Badge } from "./vip-ui/badge";
import { Skeleton } from "./vip-ui/skeleton";
import { Button as VipButton } from "./vip-ui/button";
import {
  Stat,
  StatDetail,
  StatGroup,
  StatLabel,
  StatValue,
} from "./vip-ui/stat";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./vip-ui/card";
import { DateInput } from "./date-input";
import { ToastFeedback } from "./feedback";
import { useEffect, useRef, useState } from "react";
import { localDate, type Business } from "@/lib/domain";
import { dashboardFor } from "@/lib/dashboard";
import {
  signedMoney,
  changePercent,
  monthRange,
  ratio,
} from "@/lib/dashboard-math";
import type { planTargets } from "@/lib/target-planner";
import { remaining } from "@/lib/settlements";
import { readableError } from "@/lib/supabase";
import { Button, Notice } from "./ui";
const shortMonth = new Intl.DateTimeFormat(undefined, {
  month: "short",
  timeZone: "UTC",
});

const summaryDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const displayDate = (day: string) =>
  summaryDate.format(new Date(day + "T00:00:00Z"));

function collectionSummary(
  plan: ReturnType<typeof planTargets>,
  end: string,
  formatMoney: (amount: bigint) => string,
) {
  if (plan.urgent > 0n)
    return `Immediate funding gap: ${formatMoney(plan.urgent)}.`;
  if (!plan.workingToday) {
    return plan.rate > 0n
      ? `Non-working day. Next working-day target: ${formatMoney(plan.rate)}.`
      : "Today is a non-working day.";
  }
  if (plan.targetToday === 0n) {
    return `No extra collections needed for payments through ${displayDate(end)}.`;
  }
  return plan.critical
    ? `Needed to help cover payments by ${displayDate(plan.critical)}.`
    : `Based on payments due through ${displayDate(end)}.`;
}

type Destination =
  "calendar" | "funds" | "settlements" | "targets" | "expenses" | "loans";
export function DashboardPanel({
  business,
  navigate,
}: {
  business: Business;
  navigate: (v: Destination) => void;
}) {
  const today = localDate(business.timezone),
    [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<Awaited<
      ReturnType<typeof dashboardFor>
    > | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [loadedMonth, setLoadedMonth] = useState("");
  const generation = useRef(0);
  async function reload() {
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const d = await dashboardFor(business, month, today);
      if (n === generation.current) {
        setData(d);
        setLoadedMonth(month);
      }
    } catch (e) {
      if (n === generation.current) setError(readableError(e));
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    reload();
    return () => {
      generation.current++;
    };
  }, [business.id, business.updated_at, month, today]);
  const fmt = (n: bigint) => signedMoney(n, business.currency);
  const agenda = data
    ? [...data.overdue, ...data.upcoming].sort((a, b) =>
        a.due_date.localeCompare(b.due_date),
      )
    : [];
  const next = agenda[0];
  const targetEnd = monthRange(today.slice(0, 7)).to;

  return (
    <div className="dashboard stack">
      <ToastFeedback
        error={error}
        warning={
          data && data.plan.urgent > 0n
            ? `Immediate funding gap of ${fmt(data.plan.urgent)} before the next working day.`
            : undefined
        }
      />
      {error && <Notice error>{error}</Notice>}
      {data && data.plan.urgent > 0n && (
        <Notice error>
          Immediate funding gap of {fmt(data.plan.urgent)} before the next
          working day.
        </Notice>
      )}
      <Tabs defaultSelectedKey="today" className="overview-tabs">
        <div className="overview-controls">
          <TabList aria-label="Overview views">
            <Tab id="today">Today</Tab>
            <Tab id="reports">Reports</Tab>
          </TabList>
          <VipButton
            type="button"
            variant="secondary"
            size="md"
            isDisabled={loading}
            onPress={reload}
          >
            <RefreshCw size={16} aria-hidden /> Refresh
          </VipButton>
        </div>
        <TabPanel id="today" className="overview-content">
          {loading && !data && (
            <div role="status">
              <span className="sr-only">Loading financial overview…</span>
              <Skeleton className="h-36 w-full" />
            </div>
          )}
          {data && (
            <>
              <StatGroup
                role="group"
                className="today-summary"
                aria-label="Today’s figures"
              >
                <Stat className="summary-cash">
                  <StatLabel>Cash available now</StatLabel>
                  <StatValue>
                    {fmt(data.balance.business + data.balance.external)}
                  </StatValue>
                  <StatDetail>
                    {data.balance.business + data.balance.external === 0n
                      ? "No cash available after recorded payments."
                      : "Business and external funds after recorded payments."}
                  </StatDetail>
                </Stat>
                <Stat className="summary-payment">
                  <StatLabel>
                    {next && next.due_date < today
                      ? "Oldest overdue payment"
                      : "Next payment"}
                  </StatLabel>
                  <StatValue>{next ? fmt(remaining(next)) : "—"}</StatValue>
                  {next ? (
                    <StatDetail className="summary-payment-context">
                      <strong>{next.label}</strong>
                      <time dateTime={next.due_date}>
                        {next.due_date < today
                          ? "Was due "
                          : next.due_date === today
                            ? "Due today · "
                            : "Due "}
                        {displayDate(next.due_date)}
                      </time>
                    </StatDetail>
                  ) : (
                    <StatDetail>No payments due in the next 7 days.</StatDetail>
                  )}
                </Stat>
                <Stat className="summary-target">
                  <StatLabel>Recommended to collect today</StatLabel>
                  <StatValue>{fmt(data.plan.targetToday)}</StatValue>
                  <StatDetail className="summary-target-context">
                    <span>{collectionSummary(data.plan, targetEnd, fmt)}</span>
                    {next && next.due_date > targetEnd && (
                      <span>
                        The next payment falls outside this month’s target.
                      </span>
                    )}
                  </StatDetail>
                </Stat>
              </StatGroup>
              <div className="today-layout">
                <Card className="overview-watch">
                  <CardHeader className="overview-card-header">
                    <CardTitle as="h2">
                      <CalendarClock size={19} aria-hidden /> Payments to watch
                    </CardTitle>
                    <div className="overview-watch-counts">
                      <Badge
                        variant={data.overdue.length ? "error" : "neutral"}
                      >
                        {data.overdue.length} overdue
                      </Badge>
                      <Badge variant="neutral">
                        {data.upcoming.length} due in the next 7 days
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="overview-watch-body">
                    {!agenda.length ? (
                      <p className="overview-watch-empty">
                        <CheckCircle2 size={19} aria-hidden /> No overdue
                        payments or payments due in the next 7 days.
                      </p>
                    ) : (
                      <ul className="overview-watch-list">
                        {agenda.slice(0, 4).map((t) => {
                          const status =
                            t.due_date < today
                              ? "overdue"
                              : t.due_date === today
                                ? "today"
                                : "upcoming";
                          return (
                            <li
                              className="overview-watch-row"
                              data-status={status}
                              key={t.kind + t.id}
                            >
                              <time
                                dateTime={t.due_date}
                                className="overview-due-date"
                                aria-label={t.due_date}
                              >
                                <span>
                                  {shortMonth.format(
                                    new Date(t.due_date + "T00:00:00Z"),
                                  )}
                                </span>
                                <strong>{Number(t.due_date.slice(8))}</strong>
                                {t.due_date.slice(0, 4) !==
                                  today.slice(0, 4) && (
                                  <span>{t.due_date.slice(0, 4)}</span>
                                )}
                              </time>
                              <div className="overview-watch-record">
                                <strong>{t.label}</strong>
                                <span>
                                  {t.kind === "loan"
                                    ? "Loan instalment"
                                    : "Expense"}
                                </span>
                              </div>
                              <div className="overview-watch-value">
                                <strong>{fmt(remaining(t))}</strong>
                                <Badge
                                  variant={
                                    status === "overdue"
                                      ? "error"
                                      : status === "today"
                                        ? "warning"
                                        : "neutral"
                                  }
                                >
                                  {status === "overdue"
                                    ? "Overdue"
                                    : status === "today"
                                      ? "Due today"
                                      : "Upcoming"}
                                </Badge>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                  <CardFooter className="overview-card-footer">
                    {agenda.length > 4 && (
                      <small className="muted">
                        Showing 4 of {agenda.length}
                      </small>
                    )}
                    <VipButton
                      type="button"
                      variant="secondary"
                      size="md"
                      onPress={() => navigate("settlements")}
                    >
                      All payments <ArrowUpRight size={16} aria-hidden />
                    </VipButton>
                  </CardFooter>
                </Card>
                <Card className="overview-funding">
                  <CardHeader className="overview-card-header">
                    <CardTitle as="h2">
                      <Wallet size={19} aria-hidden /> Today’s funding
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overview-funding-body">
                    <dl>
                      <div className="overview-funding-highlight">
                        <dt>Collections recorded today</dt>
                        <dd>{fmt(data.daily)}</dd>
                      </div>
                      <div className="overview-funding-source">
                        <dt>
                          <Wallet size={16} aria-hidden /> Business funds
                        </dt>
                        <dd>{fmt(data.balance.business)}</dd>
                      </div>
                      <div className="overview-funding-source">
                        <dt>
                          <Landmark size={16} aria-hidden /> External funds
                        </dt>
                        <dd>{fmt(data.balance.external)}</dd>
                      </div>
                    </dl>
                  </CardContent>
                  <CardFooter className="overview-funding-actions">
                    <VipButton
                      type="button"
                      size="md"
                      onPress={() => navigate("targets")}
                    >
                      Collection targets <ArrowUpRight size={16} aria-hidden />
                    </VipButton>
                    <VipButton
                      type="button"
                      variant="secondary"
                      size="md"
                      onPress={() => navigate("funds")}
                    >
                      View collections
                    </VipButton>
                  </CardFooter>
                </Card>
              </div>
            </>
          )}
        </TabPanel>
        <TabPanel id="reports" className="overview-content dashboard-reporting">
          <div className="section-title">
            <h2>Historical reports</h2>
            <div className="dash-controls">
              <DateInput
                label="Reporting month"
                today={today}
                type="month"
                min="2000-01"
                max={today.slice(0, 7)}
                value={month}
                onValueChange={(value) => {
                  if (value && value <= today.slice(0, 7)) setMonth(value);
                }}
              />
            </div>
          </div>
          {loading && data && <p role="status">Updating reports…</p>}
          {data && loadedMonth === month && (
            <>
              <Card className="card stack report-panel report-monthly">
                <h3>Monthly performance</h3>
                <p className="muted">
                  {displayDate(data.range.from)} – {displayDate(data.range.to)}
                  {" compared with "}
                  {displayDate(data.previous.from)} –{" "}
                  {displayDate(data.previous.to)}
                </p>
                <div className="dash-kpis">
                  {[
                    {
                      label: "Collections",
                      a: data.flow.collection,
                      b: data.prior.collection,
                    },
                    {
                      label: "External funding",
                      a: data.flow.external,
                      b: data.prior.external,
                    },
                    {
                      label: "Payments",
                      a: data.flow.payments,
                      b: data.prior.payments,
                    },
                    {
                      label: "Net cash movement",
                      a: data.flow.net,
                      b: data.prior.net,
                    },
                  ].map((k) => (
                    <div
                      className={
                        k.label === "Net cash movement"
                          ? "dash-stat report-net"
                          : "dash-stat"
                      }
                      key={k.label}
                    >
                      <span>{k.label}</span>
                      <strong>{fmt(k.a)}</strong>
                      <small>Previous: {fmt(k.b)}</small>
                      <small>
                        {k.label === "Net cash movement"
                          ? "Change " + fmt(k.a - k.b)
                          : changePercent(k.a, k.b)}
                      </small>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="card stack report-panel report-chart">
                <h3>Six-month cash flow</h3>
                <p className="muted">
                  Recorded inflows and payments · selected month may be
                  incomplete
                </p>
                <div className="dash-legend">
                  <span>
                    <i className="collection" />
                    Collections
                  </span>
                  <span>
                    <i className="external" />
                    External funding
                  </span>
                  <span>
                    <i className="payment" />
                    Payments
                  </span>
                </div>
                <div className="dash-chart">
                  {(() => {
                    const max = data.trend.reduce(
                      (m, t) =>
                        [t.collection, t.external, t.payments].reduce(
                          (a, b) => (a > b ? a : b),
                          m,
                        ),
                      0n,
                    );
                    return data.trend.map((t) => (
                      <div className="dash-chart-month" key={t.month}>
                        <div className="dash-bars">
                          {[
                            { key: "collection", v: t.collection },
                            { key: "external", v: t.external },
                            { key: "payment", v: t.payments },
                          ].map((s) => (
                            <div
                              key={s.key}
                              className={"dash-bar " + s.key}
                              style={{ height: ratio(s.v, max) + "%" }}
                              title={s.key + " " + fmt(s.v)}
                            />
                          ))}
                        </div>
                        <small>
                          <time dateTime={t.month}>
                            {shortMonth.format(
                              new Date(t.month + "-01T00:00:00Z"),
                            )}{" "}
                            ’{t.month.slice(2, 4)}
                          </time>
                        </small>
                      </div>
                    ));
                  })()}
                </div>
                <details>
                  <summary>View exact chart values</summary>
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Collections</th>
                          <th>External</th>
                          <th>Payments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.trend.map((t) => (
                          <tr key={t.month}>
                            <td>{t.month}</td>
                            <td>{fmt(t.collection)}</td>
                            <td>{fmt(t.external)}</td>
                            <td>{fmt(t.payments)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
              <Card className="card stack report-panel report-categories">
                <h3>Scheduled expenses by category</h3>
                <p className="muted">
                  Full selected month · not actual payments
                </p>
                {!data.breakdown.length ? (
                  <p>No scheduled expenses.</p>
                ) : (
                  data.breakdown.map((c) => (
                    <div className="dash-category" key={c.id}>
                      <div>
                        <span>{c.label}</span>
                        <strong>{fmt(c.amount)}</strong>
                      </div>
                      <div className="dash-track">
                        <div
                          style={{
                            width:
                              ratio(
                                c.amount,
                                data.breakdown.reduce(
                                  (s, x) => s + x.amount,
                                  0n,
                                ),
                              ) + "%",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </>
          )}
          {data && (
            <details className="overview-report-details">
              <summary>Outstanding balances and loan progress</summary>
              <div className="stack">
                <section className="stack">
                  <h2>Outstanding across all dates</h2>{" "}
                  <div className="dash-kpis">
                    {(
                      [
                        {
                          label: "Outstanding expenses",
                          value: data.expensesDue,
                          nav: "expenses",
                        },
                        {
                          label: "Outstanding loan instalments",
                          value: data.loansDue,
                          nav: "loans",
                        },
                        {
                          label: "Overdue obligations",
                          value: data.overdue.reduce(
                            (s, t) => s + remaining(t),
                            0n,
                          ),
                          nav: "settlements",
                        },
                      ] as { label: string; value: bigint; nav: Destination }[]
                    ).map((k) => (
                      <VipButton
                        type="button"
                        variant="outline"

                        className="card dash-kpi"
                        key={k.label}
                        onClick={() => navigate(k.nav)}
                      >
                        <span>{k.label}</span>
                        <strong>{fmt(k.value)}</strong>
                      </VipButton>
                    ))}
                  </div>
                </section>
                <Card className="card stack">
                  <h2>Loan repayment progress</h2>
                  <p className="muted">
                    Active schedules · excludes amounts paid before tracking
                  </p>
                  <div className="expense-total">
                    {ratio(data.loanPaid, data.loanScheduled).toFixed(1)}%
                  </div>
                  <div className="dash-track">
                    <div
                      style={{
                        width: ratio(data.loanPaid, data.loanScheduled) + "%",
                      }}
                    />
                  </div>
                  <dl>
                    <dt>Scheduled</dt>
                    <dd>{fmt(data.loanScheduled)}</dd>
                    <dt>Paid</dt>
                    <dd>{fmt(data.loanPaid)}</dd>
                    <dt>Remaining</dt>
                    <dd>{fmt(data.loansDue)}</dd>
                  </dl>
                  <Button secondary onClick={() => navigate("loans")}>
                    View loans
                  </Button>
                </Card>
              </div>
            </details>
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}
