"use client";
import { Button as VipButton } from "./vip-ui/button";

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { localDate } from "@/lib/domain";
import { parseDate } from "@internationalized/date";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "./vip-ui/input-group";
import { DialogContent } from "./vip-ui/dialog";
import {
  DatePicker,
  DatePickerLabel,
  DatePickerGroup,
  DatePickerContent,
  DatePickerDescription,
  DatePickerError,
} from "./vip-ui/date-picker";
import { Button } from "./ui";

type DateInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "disabled" | "required" | "name" | "id"
> & {
  type: "date" | "month";
  value: string;
  min?: string;
  max?: string;
  today?: string;
  label: ReactNode;
  hint?: string;
  onValueChange: (value: string) => void;
};

export function DateInput(props: DateInputProps) {
  if (props.type === "month") return <MonthInput {...props} />;
  const {
    label,
    value,
    onValueChange,
    disabled,
    required,
    name,
    id,
    min,
    max,
    today,
    hint,
  } = props;
  return (
    <DatePicker
      id={id}
      name={name}
      value={value ? parseDate(value) : null}
      placeholderValue={parseDate(today ?? localDate())}
      minValue={parseDate(min || "2000-01-01")}
      maxValue={parseDate(max || "2100-12-31")}
      isDisabled={disabled}
      isRequired={required}
      validationBehavior="native"
      onChange={(date) => onValueChange(date?.toString() ?? "")}
      className="min-w-0"
      size="lg"
    >
      <DatePickerLabel>{label}</DatePickerLabel>
      <DatePickerGroup />
      {hint && <DatePickerDescription>{hint}</DatePickerDescription>}
      <DatePickerError />
      <DatePickerContent />
    </DatePicker>
  );
}

function MonthInput({
  value,
  onValueChange,
  today,
  min,
  max,
  disabled,
  label,
  hint,
  ...props
}: DateInputProps) {
  const [isOpen, setOpen] = useState(false);
  const heading = useId();
  const fieldId = useId();
  const hintId = useId();
  const dateMin = min ?? "2000-01";
  const dateMax = max ?? "2100-12";
  const businessToday = today ?? localDate();
  const initial = (value || businessToday).slice(0, 7);
  const [month, setMonth] = useState(initial);
  const monthNames = new Intl.DateTimeFormat(undefined, {
    month: "short",
    timeZone: "UTC",
  });
  const year = Number(month.slice(0, 4));
  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
  }
  function open() {
    const low = dateMin.slice(0, 7);
    const high = dateMax.slice(0, 7);
    setMonth(initial < low ? low : initial > high ? high : initial);
    setOpen(true);
  }
  return (
    <div className="date-field">
      <label htmlFor={fieldId}>{label}</label>
      <InputGroup className="month-input">
        <InputGroupInput
          id={fieldId}
          aria-describedby={hint ? hintId : undefined}
          {...props}
          type="month"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <InputGroupAddon>
          <InputGroupButton
            type="button"
            iconOnly
            aria-label="Choose month"
            aria-haspopup="dialog"
            isDisabled={disabled}
            onPress={open}
          >
            <CalendarDays size={19} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {hint && <small id={hintId}>{hint}</small>}
      <DialogContent
        aria-labelledby={heading}
        overlayProps={{ isOpen, onOpenChange: setOpen }}
      >
        <h2 id={heading}>Choose month</h2>
        <div className="calendar-heading">
          <h3 aria-live="polite">{year}</h3>
          <div className="calendar-nav">
            <VipButton
              variant="ghost"
              type="button"
              className="icon-button"
              aria-label="Previous year"
              isDisabled={year <= Number(min?.slice(0, 4) ?? 2000)}
              onClick={() => setMonth(`${year - 1}-01`)}
            >
              <ChevronLeft size={20} />
            </VipButton>
            <VipButton
              variant="ghost"
              type="button"
              className="icon-button"
              aria-label="Next year"
              isDisabled={year >= Number(max?.slice(0, 4) ?? 2100)}
              onClick={() => setMonth(`${year + 1}-01`)}
            >
              <ChevronRight size={20} />
            </VipButton>
          </div>
        </div>
        <div className="month-grid">
          {Array.from({ length: 12 }, (_, index) => {
            const key = `${year}-${String(index + 1).padStart(2, "0")}`;
            return (
              <VipButton
                variant="ghost"
                className="calendar-day"
                type="button"
                key={key}
                aria-pressed={value === key}
                isDisabled={!!((min && key < min) || (max && key > max))}
                onClick={() => choose(key)}
              >
                {monthNames.format(new Date(key + "-01T00:00:00Z"))}
              </VipButton>
            );
          })}
        </div>
        <div className="form-actions">
          <Button type="button" secondary onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </div>
  );
}
