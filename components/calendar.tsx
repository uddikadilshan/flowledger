"use client";
import type { HolidayMarks } from "@/lib/holidays";
import {
  Button as VipButton,
  type ButtonProps as VipButtonProps,
} from "./vip-ui/button";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeZone: "UTC",
});

export function calendarDate(day: string) {
  return dayFormat.format(new Date(day + "T00:00:00Z"));
}

export function shiftDate(day: string, offset: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PaymentWeekCalendar({
  selected,
  today,
  onSelect,
  marks,
  holidays,
}: {
  selected: string;
  today: string;
  onSelect: (day: string) => void;
  holidays?: HolidayMarks;
  marks?: ReadonlyMap<string, { total: number; overdue: boolean }>;
}) {
  const heading = useId();
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(selected);
  const month = selected.slice(0, 7);
  const first = selected;
  const offset = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7;
  const start = shiftDate(first, -offset);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  const tabDate = days.includes(focused) ? focused : selected;
  function keyDown(
    event: Parameters<NonNullable<VipButtonProps["onKeyDown"]>>[0],
    day: string,
  ) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (offset === undefined) {
      event.continuePropagation();
      return;
    }
    event.preventDefault();
    const next = shiftDate(day, offset);
    setFocused(next);
    onSelect(next);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)
        ?.focus(),
    );
  }
  return (
    <div className="calendar" ref={root}>
      <div className="calendar-heading">
        <h3 id={heading} aria-live="polite">
          {monthFormat.format(new Date(month + "-01T00:00:00Z"))}
        </h3>
        <div className="calendar-nav">
          <VipButton
            variant="ghost"
            type="button"
            className="icon-button"
            aria-label="Previous week"
            onClick={() => onSelect(shiftDate(selected, -7))}
          >
            <ChevronLeft size={20} />
          </VipButton>
          <VipButton
            variant="ghost"
            type="button"
            className="icon-button"
            aria-label="Next week"
            onClick={() => onSelect(shiftDate(selected, 7))}
          >
            <ChevronRight size={20} />
          </VipButton>
        </div>
      </div>
      <div className="calendar-days" role="group" aria-labelledby={heading}>
        {weekdays.map((day) => (
          <div className="calendar-weekday" key={day} aria-hidden>
            {day}
          </div>
        ))}
        {days.map((day) => {
          const holidayNames = holidays?.get(day);
          const mark = marks?.get(day);
          const outside = !day.startsWith(month);
          return (
            <VipButton
              variant="ghost"
              type="button"
              key={day}
              data-day={day}
              data-holiday={holidayNames ? true : undefined}
              className={outside ? "calendar-day outside" : "calendar-day"}
              aria-label={
                calendarDate(day) +
                (holidayNames
                  ? ", public holiday: " + holidayNames.join(", ")
                  : "") +
                (mark
                  ? `, ${mark.total} scheduled${mark.overdue ? ", overdue items" : ""}`
                  : "")
              }
              aria-current={day === today ? "date" : undefined}
              aria-pressed={day === selected}
              excludeFromTabOrder={day !== tabDate}
              onFocus={() => setFocused(day)}
              onKeyDown={(event) => keyDown(event, day)}
              onClick={() => onSelect(day)}
            >
              <span>{Number(day.slice(8))}</span>
              {holidayNames && (
                <span className="calendar-holiday-dot" aria-hidden />
              )}
              {mark && (
                <span
                  className={
                    mark.overdue ? "calendar-mark overdue" : "calendar-mark"
                  }
                  aria-hidden
                >
                  {mark.total}
                </span>
              )}
            </VipButton>
          );
        })}
      </div>
    </div>
  );
}
