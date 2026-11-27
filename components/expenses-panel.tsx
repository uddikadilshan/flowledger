"use client";
import { Button as VipButton } from "./vip-ui/button";
import { TextField } from "./vip-ui/text-field";
import { TextArea } from "./vip-ui/text-area";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { Select } from "./vip-ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
} from "./vip-ui/table";
import { Menu, MenuItem, MenuTrigger } from "./vip-ui/menu";
import { Skeleton } from "./vip-ui/skeleton";
import {
  EmptyState,
  EmptyStateTitle,
  EmptyStateDescription,
  EmptyStateIcon,
} from "./vip-ui/empty-state";
import { ExpenseCategories } from "./expense-categories";
import { DateInput } from "./date-input";
import { ToastFeedback, useFeedback } from "./feedback";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Receipt, FolderOpen } from "lucide-react";
import { type Business, localDate } from "@/lib/domain";
import { client, readableError } from "@/lib/supabase";
import {
  expenseSchema,
  addMonths,
  expenseCommand,
  categoriesFor,
  expensesFor,
  decimalAmount,
  formatMinor,
  type ExpenseInput,
  type Expense,
  type Category,
  type History,
} from "@/lib/expenses";
import { Button, Notice } from "./ui";
export function ExpensesPanel({
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
    [deleted, setDeleted] = useState(false),
    [rows, setRows] = useState<Expense[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [form, setForm] = useState<ExpenseInput | null>(null),
    [editing, setEditing] = useState<Expense | null>(null),
    [showCategories, setShowCategories] = useState(false),
    [history, setHistory] = useState<History[] | null>(null);
  const categoryTrigger = useRef<HTMLButtonElement>(null);
  const lock = useRef(false),
    requestId = useRef(""),
    generation = useRef(0);
  async function reload() {
    const n = ++generation.current;
    setLoading(true);
    try {
      const [c, e] = await Promise.all([
        categoriesFor(business.id),
        expensesFor(business.id, month, deleted),
      ]);
      if (n === generation.current) {
        setCategories(c);
        setRows(e);
      }
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setHistory(null);
    reload().catch((e) => setError(readableError(e)));
    return () => {
      generation.current++;
    };
  }, [business.id, month, deleted]);
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
  function open(e?: Expense) {
    setEditing(e ?? null);
    requestId.current = crypto.randomUUID();
    setForm(
      e
        ? {
            title: e.title,
            description: e.description,
            category_id: e.category_id,
            amount: decimalAmount(e.amount_minor),
            due_date: e.due_date,
            frequency: "once",
            end_date: "",
          }
        : {
            title: "",
            description: "",
            category_id: categories.find((c) => !c.deleted_at)?.id || "",
            amount: "",
            due_date: today,
            frequency: "once",
            end_date: "",
          },
    );
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = expenseSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await run(async () => {
      await expenseCommand(editing ? "update" : "create", {
        business_id: business.id,
        ...parsed.data,
        ...(editing
          ? { id: editing.id, version: editing.version }
          : { request_id: requestId.current }),
      });
      setForm(null);
      setEditing(null);
      setMessage(
        "Expense saved. Change the month filter to see future entries.",
      );
      await reload();
    });
  }
  async function change(e: Expense, action: "delete" | "restore") {
    const update = async () => {
      await expenseCommand(action, {
        business_id: business.id,
        id: e.id,
        version: e.version,
      });
    };
    const refresh = async () => {
      setMessage(
        action === "delete" ? "Expense moved to Deleted." : "Expense restored.",
      );
      await reload();
    };
    if (action === "restore")
      return run(async () => {
        await update();
        await refresh();
      });
    const accepted = await confirm({
      title: `Delete ${e.title}?`,
      description: `Only the occurrence due ${e.due_date} will be removed. You can restore it from Deleted.`,
      action: "Delete expense",
      danger: true,
      perform: update,
    });
    if (accepted !== null)
      await refresh().catch((err) => setError(readableError(err)));
  }
  async function saveCategory(name: string, category: Category | null) {
    if (!navigator.onLine) throw Error("offline");
    await expenseCommand(category ? "category_update" : "category_create", {
      business_id: business.id,
      name,
      ...(category ? { id: category.id, version: category.version } : {}),
    });
    setMessage(category ? "Category renamed." : "Category added.");
    void reload().catch((err) => setError(readableError(err)));
  }
  async function changeCategory(category: Category) {
    const restore = Boolean(category.deleted_at);
    const update = async () => {
      await expenseCommand(restore ? "category_restore" : "category_delete", {
        business_id: business.id,
        id: category.id,
        version: category.version,
      });
    };
    const refresh = async () => {
      setMessage(restore ? "Category restored." : "Category deleted.");
      await reload();
    };
    if (restore)
      return run(async () => {
        await update();
        await refresh();
      });
    const accepted = await confirm({
      title: `Delete category ${category.name}?`,
      description:
        "Move any active expenses to another category first. You can restore the category from Deleted.",
      action: "Delete category",
      danger: true,
      perform: update,
    });
    if (accepted !== null)
      await refresh().catch((err) => setError(readableError(err)));
  }
  function categoryNameFor(expense: Expense) {
    return (
      categories.find((category) => category.id === expense.category_id)
        ?.name ?? "Category"
    );
  }
  function expenseActions(expense: Expense) {
    if (!owner) return null;
    return (
      <MenuTrigger>
        <Button
          type="button"
          secondary
          disabled={busy}
          aria-label={`Actions for ${expense.title}`}
        >
          Actions
        </Button>
        <Menu aria-label="Expense actions">
          {canWrite && !deleted && (
            <MenuItem onAction={() => open(expense)}>Edit expense</MenuItem>
          )}
          {canWrite && (
            <MenuItem
              variant={deleted ? "default" : "destructive"}
              onAction={() => change(expense, deleted ? "restore" : "delete")}
            >
              {deleted ? "Restore expense" : "Delete expense"}
            </MenuItem>
          )}
          <MenuItem
            onAction={() =>
              run(async () => {
                const { data, error } = await client()
                  .from("expense_history")
                  .select("id,action,created_at,before_record,after_record")
                  .eq("business_id", business.id)
                  .eq("entity_id", expense.id)
                  .order("id", { ascending: false })
                  .limit(100);
                if (error) throw error;
                setHistory(data as History[]);
              })
            }
          >
            View history
          </MenuItem>
        </Menu>
      </MenuTrigger>
    );
  }
  const schedule =
    form &&
    !editing &&
    form.frequency === "monthly" &&
    expenseSchema.safeParse(form).success
      ? Array.from({ length: 61 }, (_, index) =>
          addMonths(form.due_date, index),
        ).filter((date) => date <= form.end_date)
      : [];
  const total = rows.reduce((sum, e) => sum + BigInt(e.amount_minor), 0n);
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

      <Card
        className="card expense-toolbar workspace-summary"
        hidden={showCategories}
      >
        <div>
          <span className="eyebrow">
            {deleted ? "Deleted expenses" : "Scheduled expenses"} · {month}
          </span>
          <div className="expense-total">
            {formatMinor(total, business.currency)}
          </div>
          <p className="muted">{rows.length} entries</p>
        </div>
        <div className="actions">
          <Button
            secondary
            disabled={busy}
            ref={categoryTrigger}
            onClick={() => setShowCategories(true)}
          >
            <FolderOpen size={18} />
            Manage categories
          </Button>
          {canWrite && !showCategories && (
            <Button disabled={busy || loading} onClick={() => open()}>
              <Plus size={18} />
              Add expense
            </Button>
          )}
        </div>
      </Card>
      {showCategories && (
        <ExpenseCategories
          categories={categories}
          loading={loading}
          busy={busy}
          canWrite={canWrite}
          onBack={() => {
            setShowCategories(false);
            requestAnimationFrame(() => categoryTrigger.current?.focus());
          }}
          onSave={saveCategory}
          onChange={changeCategory}
        />
      )}
      {form && canWrite && !showCategories && (
        <Card className="card form-card">
          <h2>{editing ? "Edit expense" : "New expense"}</h2>
          <p className="muted">
            {editing
              ? "Changes apply only to this occurrence."
              : "Save a single expense or create a monthly schedule."}
          </p>
          <Form validationBehavior="native" onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="form-grid">
                <TextField
                  label="Title"
                  isRequired
                  maxLength={100}
                  value={form.title}
                  onChange={(nextValue) =>
                    setForm({ ...form, title: nextValue })
                  }
                  isDisabled={busy}
                />
                <div>
                  <Select
                    label="Category"
                    placeholder="Choose a category"
                    isRequired
                    validationBehavior="native"
                    isDisabled={busy}
                    value={form.category_id || null}
                    onChange={(key) =>
                      setForm({
                        ...form,
                        category_id: typeof key === "string" ? key : "",
                      })
                    }
                    options={categories
                      .filter((c) => !c.deleted_at)
                      .map((c) => ({ id: c.id, name: c.name }))}
                  />
                  {!categories.some((c) => !c.deleted_at) && (
                    <VipButton
                      type="button"
                      variant="minimal"

                      className="text-link"
                      onClick={() => setShowCategories(true)}
                    >
                      Add a category first
                    </VipButton>
                  )}
                </div>
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
                  label={editing ? "Due date" : "First due date"}
                  today={today}
                  required
                  type="date"
                  min="2000-01-01"
                  max="2100-12-31"
                  value={form.due_date}
                  onValueChange={(value) =>
                    setForm({ ...form, due_date: value })
                  }
                />
                <TextArea
                  label="Description"
                  className="wide"
                  maxLength={1000}
                  value={form.description}
                  onChange={(nextValue) =>
                    setForm({ ...form, description: nextValue })
                  }
                  isDisabled={busy}
                />
                {!editing && (
                  <>
                    <Select
                      label="Repeat"
                      value={form.frequency}
                      isDisabled={busy}
                      onChange={(frequency) => {
                        if (frequency === "once" || frequency === "monthly")
                          setForm({ ...form, frequency });
                      }}
                      options={[
                        { id: "once", name: "One time" },
                        { id: "monthly", name: "Every month" },
                      ]}
                    />
                    {form.frequency === "monthly" && (
                      <DateInput
                        label="Repeat until (inclusive)"
                        hint="Up to 5 years. Shorter months use their last day."
                        today={today}
                        required
                        type="date"
                        min={form.due_date}
                        max="2100-12-31"
                        value={form.end_date}
                        onValueChange={(value) =>
                          setForm({ ...form, end_date: value })
                        }
                      />
                    )}
                  </>
                )}
              </div>
            </fieldset>
            {schedule.length > 0 && (
              <details className="recurrence-preview">
                <summary>
                  {schedule.length}{" "}
                  {schedule.length === 1
                    ? "scheduled expense"
                    : "scheduled expenses"}
                </summary>
                <ol>
                  {schedule.map((day) => (
                    <li key={day}>{day}</li>
                  ))}
                </ol>
              </details>
            )}
            <div className="form-actions">
              <Button
                secondary
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Save expense"}
              </Button>
            </div>
          </Form>
        </Card>
      )}
      <Card
        className="card"
        hidden={showCategories || Boolean(form && canWrite)}
      >
        <div className="expense-filters">
          <DateInput
            label="Month"
            today={today}
            type="month"
            required
            min="2000-01"
            max="2100-12"
            value={month}
            disabled={busy}
            onValueChange={(value) => {
              if (/^\d{4}-\d{2}$/.test(value)) {
                setMonth(value);
                setForm(null);
              }
            }}
          />
          <Select
            label="Show"
            value={deleted ? "deleted" : "active"}
            isDisabled={busy}
            onChange={(key) => {
              if (key !== "active" && key !== "deleted") return;
              setDeleted(key === "deleted");
              setForm(null);
            }}
            options={[
              { id: "active", name: "Active expenses" },
              { id: "deleted", name: "Deleted expenses" },
            ]}
          />
        </div>
        {loading ? (
          <div role="status">
            <span className="sr-only">Loading expenses…</span>
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !rows.length ? (
          <EmptyState>
            <EmptyStateIcon>
              <Receipt size={30} />
            </EmptyStateIcon>
            <EmptyStateTitle as="h2">
              No {deleted ? "deleted " : ""}expenses this month
            </EmptyStateTitle>
            <EmptyStateDescription>
              {canWrite
                ? "Add an expense or choose another month."
                : "Your business owner can add expenses here."}
            </EmptyStateDescription>
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table aria-label="Scheduled expenses">
                <TableHeader>
                  <Column isRowHeader>Expense</Column>
                  <Column>Category</Column>
                  <Column>Due date</Column>
                  <Column className="text-right">Amount</Column>
                  {owner && <Column className="text-right">Actions</Column>}
                </TableHeader>
                <TableBody>
                  {rows.map((expense) => (
                    <Row id={expense.id} key={expense.id}>
                      <Cell>
                        <strong>{expense.title}</strong>
                        {expense.description && (
                          <small className="block text-muted-foreground">
                            {expense.description}
                          </small>
                        )}
                      </Cell>
                      <Cell>{categoryNameFor(expense)}</Cell>
                      <Cell className="whitespace-nowrap">
                        {expense.due_date}
                      </Cell>
                      <Cell className="text-right tabular-nums whitespace-nowrap">
                        {formatMinor(
                          BigInt(expense.amount_minor),
                          business.currency,
                        )}
                      </Cell>
                      {owner && (
                        <Cell className="text-right">
                          {expenseActions(expense)}
                        </Cell>
                      )}
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="expense-list md:hidden">
              {rows.map((e) => (
                <article className="expense-row" key={e.id}>
                  <div>
                    <span className="eyebrow">
                      {categoryNameFor(e)} ·{" "}
                      {e.expense_schedules.frequency === "monthly"
                        ? "Monthly"
                        : "One time"}
                    </span>
                    <h3>{e.title}</h3>
                    <p className="muted">{e.description}</p>
                    <small>
                      Due {e.due_date}
                      {e.due_date < today && !deleted ? " · Past due date" : ""}
                    </small>
                  </div>
                  <div className="expense-row-end">
                    <strong className="expense-amount">
                      {formatMinor(BigInt(e.amount_minor), business.currency)}
                    </strong>
                    {expenseActions(e)}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>
      {history && !showCategories && (
        <Card className="card">
          <div className="section-title">
            <h2>Change history</h2>
            <Button secondary onClick={() => setHistory(null)}>
              Close
            </Button>
          </div>
          <p className="muted">
            Most recent 100 changes. Only the business owner can make these
            changes.
          </p>
          {history.map((h) => (
            <details className="expense-history" key={h.id}>
              <summary>
                {h.action} · {new Date(h.created_at).toLocaleString()}
              </summary>
              <p>
                {String(h.after_record.title)} ·{" "}
                {formatMinor(
                  BigInt(String(h.after_record.amount_minor)),
                  business.currency,
                )}{" "}
                · Due {String(h.after_record.due_date)}
              </p>
              {h.before_record && (
                <p className="muted">
                  Previously: {String(h.before_record.title)} ·{" "}
                  {formatMinor(
                    BigInt(String(h.before_record.amount_minor)),
                    business.currency,
                  )}{" "}
                  · Due {String(h.before_record.due_date)}
                </p>
              )}
              <p>Description: {String(h.after_record.description) || "None"}</p>
              <p>
                Category:{" "}
                {categories.find((c) => c.id === h.after_record.category_id)
                  ?.name || String(h.after_record.category_id)}
              </p>
            </details>
          ))}
        </Card>
      )}
    </div>
  );
}
