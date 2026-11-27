import { formatMinor } from "@/lib/expenses";

const fundFields = {
  kind: "Fund type",
  amount_minor: "Amount",
  received_on: "Received on",
  note: "Note",
  reversed_at: "Reversed on",
};

const loanFields = {
  title: "Loan name",
  lender: "Lender",
  total_minor: "Total loan",
  prior_minor: "Paid before tracking",
  monthly_minor: "Monthly instalment",
  start_date: "Start date",
  first_due: "First payment due",
  end_date: "End date",
  deleted_at: "Archived on",
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function display(key: string, value: unknown, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (
    key.endsWith("_minor") &&
    (typeof value === "number" || typeof value === "string")
  ) {
    return formatMinor(BigInt(value), currency);
  }
  if (key.endsWith("_at") && typeof value === "string")
    return new Date(value).toLocaleString();
  if (key === "kind")
    return value === "collection" ? "Business collection" : "External funding";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  return String(value);
}

export function HistoryChanges({
  before,
  after,
  currency,
  kind,
}: {
  before: unknown;
  after: unknown;
  currency: string;
  kind: "loan" | "fund";
}) {
  const hasPrevious = before !== null && before !== undefined;
  const previous = record(before);
  const next = record(after);
  const oldValues = kind === "loan" ? record(previous.loan) : previous;
  const newValues = kind === "loan" ? record(next.loan) : next;
  const fields = Object.entries(
    kind === "loan" ? loanFields : fundFields,
  ).filter(([key]) => oldValues[key] !== newValues[key]);

  const oldSchedule = Array.isArray(previous.instalments)
    ? previous.instalments.map(record)
    : [];
  const newSchedule = Array.isArray(next.instalments)
    ? next.instalments.map(record)
    : [];
  const scheduleChanges = Array.from(
    { length: Math.max(oldSchedule.length, newSchedule.length) },
    (_, index) => {
      const oldItem = oldSchedule[index];
      const newItem = newSchedule[index];
      return { index, oldItem, newItem };
    },
  ).filter(
    ({ oldItem, newItem }) =>
      oldItem?.due_date !== newItem?.due_date ||
      oldItem?.amount_minor !== newItem?.amount_minor,
  );

  function instalment(item: Record<string, unknown> | undefined) {
    return item
      ? `${display("due_date", item.due_date, currency)} · ${display("amount_minor", item.amount_minor, currency)}`
      : "—";
  }

  if (!fields.length && !scheduleChanges.length)
    return <p>No details changed.</p>;

  return (
    <div className="history-changes">
      {fields.length > 0 && (
        <dl>
          {fields.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                {hasPrevious && (
                  <>
                    <span className="muted">Previous </span>
                    {display(key, oldValues[key], currency)}
                    <br />
                  </>
                )}
                {hasPrevious && <span className="muted">Updated </span>}
                {display(key, newValues[key], currency)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {scheduleChanges.length > 0 && (
        <details>
          <summary>
            {scheduleChanges.length} instalments{" "}
            {hasPrevious ? "changed" : "scheduled"}
          </summary>
          <dl>
            {scheduleChanges.map(({ index, oldItem, newItem }) => (
              <div key={index}>
                <dt>Instalment {index + 1}</dt>
                <dd>
                  {hasPrevious && (
                    <>
                      <span className="muted">Previous </span>
                      {instalment(oldItem)}
                      <br />
                      <span className="muted">Updated </span>
                    </>
                  )}
                  {instalment(newItem)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
