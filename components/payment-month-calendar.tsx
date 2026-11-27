"use client";
import type { HolidayMarks } from "@/lib/holidays";

import { parseDate } from "@internationalized/date";
import { useEffect, useState } from "react";
import { CalendarCell } from "react-aria-components";
import {
  Calendar,
  CalendarGrid,
  CalendarHeader,
  calendarCellClass,
} from "./vip-ui/calendar";

export function PaymentMonthCalendar({
  selected,
  today,
  marks,
  holidays,
  onSelect,
}: {
  selected: string;
  today: string;
  holidays?: HolidayMarks;
  marks: ReadonlyMap<string, { total: number; overdue: boolean }>;
  onSelect: (day: string) => void;
}) {
  const [focused, setFocused] = useState(selected);
  useEffect(() => setFocused(selected), [selected]);

  return (
    <Calendar
      aria-label="Payment calendar"
      className="w-full"
      value={parseDate(selected)}
      focusedValue={parseDate(focused)}
      firstDayOfWeek="mon"
      minValue={parseDate("2000-01-01")}
      maxValue={parseDate("2100-12-31")}
      onChange={(date) => onSelect(date.toString())}
      onFocusChange={(date) => {
        const day = date.toString();
        setFocused(day);
        if (day.slice(0, 7) !== selected.slice(0, 7)) onSelect(day);
      }}
    >
      <CalendarHeader />
      <CalendarGrid className="w-full table-fixed">
        {(date) => {
          const day = date.toString();
          const holidayNames = holidays?.get(day);
          const mark = marks.get(day);
          return (
            <CalendarCell
              date={date}
              aria-current={day === today ? "date" : undefined}
              data-holiday={holidayNames ? true : undefined}
              className={calendarCellClass + " payment-calendar-cell"}
            >
              {({ formattedDate }) => (
                <>
                  <span>{formattedDate}</span>
                  {holidayNames && (
                    <span className="calendar-holiday-dot">
                      <span className="sr-only">{holidayNames.join(", ")}</span>
                    </span>
                  )}
                  {mark && (
                    <span
                      className={
                        mark.overdue ? "calendar-mark overdue" : "calendar-mark"
                      }
                    >
                      {mark.total}
                      <span className="sr-only">
                        {" "}
                        scheduled
                        {mark.overdue ? ", includes overdue items" : ""}
                      </span>
                    </span>
                  )}
                </>
              )}
            </CalendarCell>
          );
        }}
      </CalendarGrid>
    </Calendar>
  );
}
