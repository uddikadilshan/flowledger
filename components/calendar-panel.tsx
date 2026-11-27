"use client";
import { Button as VipButton } from "./vip-ui/button";
import { Card } from "./vip-ui/card";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./vip-ui/segmented-control";
import { publicHolidays, type PublicHoliday } from "@/lib/holidays";
import { sriLankaHolidaySources } from "@/lib/sri-lanka-holidays";
import { Badge } from "./vip-ui/badge";
import { EmptyState, EmptyStateDescription } from "./vip-ui/empty-state";
import { Skeleton } from "./vip-ui/skeleton";
import { PaymentMonthCalendar } from "./payment-month-calendar";

import { useEffect, useState } from "react";
import { localDate, type Business } from "@/lib/domain";
import { formatMinor } from "@/lib/expenses";
import { monthBounds } from "@/lib/funds";
import {
  paymentStatus,
  remaining,
  targetsFor,
  type Target,
} from "@/lib/settlements";
import { readableError } from "@/lib/supabase";
import { PaymentWeekCalendar, calendarDate, shiftDate } from "./calendar";
import { ToastFeedback } from "./feedback";
import { Button, Notice } from "./ui";

export function CalendarPanel({
  business,
  owner,
  onOpen,
  onConfigureCountry,
}: {
  business: Business;
  owner: boolean;
  onOpen: (target: Target, pay: boolean) => void;
  onConfigureCountry?: () => void;
}) {
  const today = localDate(business.timezone);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [mode, setMode] = useState<"month" | "week" | "agenda">("month");
  const [data, setData] = useState<{ month: string; targets: Target[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const country = business.country_code;
  const bounds = monthBounds(month);
  const firstHolidayYear = Number(shiftDate(bounds.from, -6).slice(0, 4));
  const lastHolidayYear = Number(shiftDate(bounds.to, 13).slice(0, 4));
  const officialHolidaySource =
    country === "LK"
      ? sriLankaHolidaySources[Number(month.slice(0, 4))]
      : undefined;
  const holidayKey = country
    ? `${country}:${firstHolidayYear}:${lastHolidayYear}`
    : "";
  const [holidayData, setHolidayData] = useState<{
    key: string;
    entries: PublicHoliday[];
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!country) return;
    let current = true;
    publicHolidays(country, firstHolidayYear, lastHolidayYear).then(
      (entries) => {
        if (current) setHolidayData({ key: holidayKey, entries });
      },
      () => {
        if (current)
          setHolidayData({ key: holidayKey, entries: [], failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [country, firstHolidayYear, lastHolidayYear, holidayKey]);
  const holidays = holidayData?.key === holidayKey ? holidayData : null;
  const holidayMarks = new Map<string, string[]>();
  for (const holiday of holidays?.entries ?? []) {
    const names = holidayMarks.get(holiday.date) ?? [];
    if (!names.includes(holiday.name)) names.push(holiday.name);
    holidayMarks.set(holiday.date, names);
  }

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    if (mobile.matches) setMode("week");
  }, []);
  useEffect(() => {
    let current = true;
    const { from, to } = monthBounds(month);
    targetsFor(business.id, shiftDate(from, -6), shiftDate(to, 13))
      .then((targets) => {
        if (current) setData({ month, targets });
      })
      .catch((err) => {
        if (current) setError(readableError(err));
      });
    return () => {
      current = false;
    };
  }, [business.id, month, attempt]);

  function changeMonth(next: string) {
    if (next !== month) {
      setError("");
      setMonth(next);
    }
  }
  function select(day: string) {
    changeMonth(day.slice(0, 7));
    setSelected(day);
  }
  const targets = data?.month === month ? data.targets : null;
  const marks = new Map<string, { total: number; overdue: boolean }>();
  for (const target of targets ?? []) {
    const previous = marks.get(target.due_date);
    marks.set(target.due_date, {
      total: (previous?.total ?? 0) + 1,
      overdue: Boolean(
        previous?.overdue ||
        (target.due_date < today && remaining(target) > 0n),
      ),
    });
  }
  const end = mode === "agenda" ? shiftDate(selected, 6) : selected;
  const agendaHolidays = [...holidayMarks]
    .filter(([date]) => date >= selected && date <= end)
    .sort(([a], [b]) => a.localeCompare(b));
  const agenda = targets?.filter(
    (item) => item.due_date >= selected && item.due_date <= end,
  );
  return (
    <div className="stack">
      <ToastFeedback error={error} />
      <div className="section-title calendar-toolbar">
        <p className="muted">
          Scheduled payments
          {country
            ? ` and public holidays in ${new Intl.DisplayNames(["en"], { type: "region" }).of(country)}`
            : ""}
        </p>
        <div className="calendar-nav">
          <Button type="button" secondary onClick={() => select(today)}>
            Today
          </Button>
          <SegmentedControl
            aria-label="Calendar view"
            value={mode}
            onValueChange={({ value }) => {
              if (value === "month" || value === "week" || value === "agenda")
                setMode(value);
            }}
          >
            <SegmentedControlItem value="month">Month</SegmentedControlItem>
            <SegmentedControlItem value="week">Week</SegmentedControlItem>
            <SegmentedControlItem value="agenda">Agenda</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>
      {!country && (
        <div className="calendar-country-note">
          <span>
            {onConfigureCountry
              ? "Set your business country to display public holidays."
              : "Public holidays appear after the owner sets a business country."}
          </span>
          {onConfigureCountry && (
            <Button type="button" secondary onClick={onConfigureCountry}>
              Set business country
            </Button>
          )}
        </div>
      )}
      {country && holidays?.failed && (
        <Notice error>
          Public holidays could not be loaded for this country.
        </Notice>
      )}
      <div
        className={
          mode === "agenda" ? "calendar-layout agenda-only" : "calendar-layout"
        }
      >
        {mode !== "agenda" && (
          <Card className="card calendar-surface">
            {mode === "week" ? (
              <PaymentWeekCalendar
                selected={selected}
                today={today}
                onSelect={select}
                marks={marks}
                holidays={holidayMarks}
              />
            ) : (
              <PaymentMonthCalendar
                selected={selected}
                today={today}
                marks={marks}
                onSelect={select}
              />
            )}
            <div className="calendar-legend">
              <span>
                <i /> Scheduled
              </span>
              <span>
                <i className="overdue" /> Overdue
              </span>
              {country && (
                <span>
                  <i className="calendar-holiday-dot" /> Public holiday
                </span>
              )}
            </div>
          </Card>
        )}
        <Card className="card stack calendar-agenda">
          <h2>
            {mode === "agenda" ? "Seven-day agenda" : calendarDate(selected)}
          </h2>
          {mode === "agenda" && (
            <div className="section-title">
              <p>
                {calendarDate(selected)} to {calendarDate(end)}
              </p>
              <div className="calendar-nav">
                <Button
                  secondary
                  onClick={() => select(shiftDate(selected, -7))}
                >
                  Previous week
                </Button>
                <Button
                  secondary
                  onClick={() => select(shiftDate(selected, 7))}
                >
                  Next week
                </Button>
              </div>
            </div>
          )}
          {agendaHolidays.length > 0 && (
            <ul className="calendar-holiday-list" aria-label="Public holidays">
              {agendaHolidays.map(([date, names]) =>
                names.map((name) => (
                  <li key={date + name}>
                    <Badge variant="accent" dot>
                      Public holiday
                    </Badge>
                    <strong>{name}</strong>
                    {mode === "agenda" && (
                      <time dateTime={date}>{calendarDate(date)}</time>
                    )}
                  </li>
                )),
              )}
            </ul>
          )}
          {error ? (
            <Notice error>
              {error}{" "}
              <VipButton
                type="button"
                variant="minimal"
                className="text-link"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Retry
              </VipButton>
            </Notice>
          ) : !agenda ? (
            <div role="status">
              <span className="sr-only">Loading scheduled payments…</span>
              <Skeleton className="h-20 w-full" />
            </div>
          ) : !agenda.length ? (
            <EmptyState>
              <EmptyStateDescription>
                No obligations are scheduled for{" "}
                {mode === "agenda" ? "these dates" : "this day"}.
              </EmptyStateDescription>
            </EmptyState>
          ) : (
            agenda.map((item) => {
              const left = remaining(item);
              const overdue = item.due_date < today && left > 0n;
              return (
                <article
                  className="calendar-obligation"
                  key={item.kind + item.id}
                >
                  <div>
                    <h3>{item.label}</h3>
                    <small>
                      {item.kind === "expense" ? "Expense" : "Loan instalment"}{" "}
                      · {item.due_date}
                    </small>
                  </div>
                  <div className="calendar-amount">
                    <strong>
                      {formatMinor(
                        left > 0n ? left : BigInt(item.amount_minor),
                        business.currency,
                      )}
                    </strong>
                    <Badge
                      dot
                      variant={
                        overdue ? "error" : left === 0n ? "success" : "warning"
                      }
                    >
                      {overdue
                        ? "Overdue"
                        : left > 0n && item.due_date === today
                          ? "Due today"
                          : paymentStatus(item)}
                    </Badge>
                  </div>
                  <div className="calendar-row-actions">
                    <VipButton
                      type="button"
                      variant="minimal"

                      className="text-link"
                      onClick={() => onOpen(item, false)}
                    >
                      View obligation
                      <span className="sr-only"> {item.label}</span>
                    </VipButton>
                    {owner && !business.archived_at && left > 0n && (
                      <Button type="button" onClick={() => onOpen(item, true)}>
                        Pay<span className="sr-only"> {item.label}</span>
                      </Button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </Card>
      </div>
      {country && (
        <small className="muted">
          {officialHolidaySource && (
            <>
              <a href={officialHolidaySource}>
                Sri Lanka government holiday calendar
              </a>
              .{" "}
            </>
          )}
          Additional holiday data by{" "}
          <a href="https://github.com/commenthol/date-holidays">
            date-holidays
          </a>{" "}
          (
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>
          ).
        </small>
      )}
    </div>
  );
}
