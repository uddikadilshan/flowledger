"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Receipt, FolderOpen } from "lucide-react";
import { type Business, localDate } from "@/lib/domain";
import { client, readableError } from "@/lib/supabase";
import {
  expenseSchema,
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
    [categoryName, setCategoryName] = useState(""),
    [editingCategory, setEditingCategory] = useState<Category | null>(null),
    [showCategories, setShowCategories] = useState(false),
    [history, setHistory] = useState<History[] | null>(null);
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
    if (
      action === "delete" &&
      !confirm(
        `Delete “${e.title}” due ${e.due_date}? Only this occurrence will be deleted. You can restore it from Deleted.`,
      )
    )
      return;
    await run(async () => {
      await expenseCommand(action, {
        business_id: business.id,
        id: e.id,
        version: e.version,
      });
      await reload();
      setMessage(
        action === "delete" ? "Expense moved to Deleted." : "Expense restored.",
      );
    });
  }
  const total = rows.reduce((sum, e) => sum + BigInt(e.amount_minor), 0n);
  return (
    <div className="stack">
      {error && (
        <Notice error>
          {error}{" "}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => run(reload)}
          >
            Refresh
          </button>
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      <section className="card expense-toolbar">
        <div>
          <span className="eyebrow">
            {deleted ? "Deleted expenses" : "Scheduled expenses"} · {month}
          </span>
          <div className="expense-total">
            {formatMinor(total, business.currency)}
          </div>
          <p className="muted">
            {rows.length} entries · Payments and settlements come in the next
            step.
          </p>
        </div>
        <div className="actions">
          <Button
            secondary
            disabled={busy}
            onClick={() => setShowCategories(!showCategories)}
          >
            <FolderOpen size={18} />
            Categories
          </Button>
          {canWrite && (
            <Button disabled={busy || loading} onClick={() => open()}>
              <Plus size={18} />
              Add expense
            </Button>
          )}
        </div>
      </section>
      {showCategories && (
        <section className="card stack">
          <h2>Expense categories</h2>
          {canWrite && (
            <form
              className="expense-category-form"
              onSubmit={(ev) => {
                ev.preventDefault();
                run(async () => {
                  await expenseCommand(
                    editingCategory ? "category_update" : "category_create",
                    {
                      business_id: business.id,
                      name: categoryName,
                      ...(editingCategory
                        ? {
                            id: editingCategory.id,
                            version: editingCategory.version,
                          }
                        : {}),
                    },
                  );
                  setCategoryName("");
                  setEditingCategory(null);
                  await reload();
                  setMessage("Category saved.");
                });
              }}
            >
              <label>
                Category name
                <input
                  required
                  maxLength={60}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Rent, Utilities, Mobile"
                />
              </label>
              <Button disabled={busy}>
                {editingCategory ? "Save name" : "Add category"}
              </Button>
              {editingCategory && (
                <Button
                  secondary
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryName("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </form>
          )}
          {!categories.length && (
            <p className="muted">
              {canWrite
                ? "Add your first category to organize expenses."
                : "No categories yet."}
            </p>
          )}
          {categories.map((c) => (
            <div className="member-row" key={c.id}>
              <strong>
                {c.name}{" "}
                {c.deleted_at && <span className="badge">Deleted</span>}
              </strong>
              {canWrite && (
                <div className="actions">
                  {!c.deleted_at && (
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() => {
                        setEditingCategory(c);
                        setCategoryName(c.name);
                      }}
                    >
                      Rename
                    </Button>
                  )}
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => {
                      if (
                        !c.deleted_at &&
                        !confirm(
                          `Delete category “${c.name}”? Categories with active expenses cannot be deleted.`,
                        )
                      )
                        return;
                      run(async () => {
                        await expenseCommand(
                          c.deleted_at ? "category_restore" : "category_delete",
                          {
                            business_id: business.id,
                            id: c.id,
                            version: c.version,
                          },
                        );
                        await reload();
                      });
                    }}
                  >
                    {c.deleted_at ? "Restore" : "Delete"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      {form && canWrite && (
        <section className="card form-card">
          <h2>{editing ? "Edit expense" : "New expense"}</h2>
          <p className="muted">
            {editing
              ? "Changes apply only to this occurrence."
              : "Save a single expense or create a monthly schedule."}
          </p>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <div className="form-grid">
                <label>
                  Title
                  <input
                    required
                    maxLength={100}
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    required
                    value={form.category_id}
                    onChange={(e) =>
                      setForm({ ...form, category_id: e.target.value })
                    }
                  >
                    <option value="">Choose a category</option>
                    {categories
                      .filter((c) => !c.deleted_at)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  {!categories.some((c) => !c.deleted_at) && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setShowCategories(true)}
                    >
                      Add a category above first
                    </button>
                  )}
                </label>
                <label>
                  Amount ({business.currency})
                  <input
                    required
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </label>
                <label>
                  {editing ? "Due date" : "First due date"}
                  <input
                    required
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={form.due_date}
                    onChange={(e) =>
                      setForm({ ...form, due_date: e.target.value })
                    }
                  />
                </label>
                <label className="wide">
                  Description
                  <textarea
                    maxLength={1000}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                {!editing && (
                  <>
                    <label>
                      Repeat
                      <select
                        value={form.frequency}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            frequency: e.target.value as "once" | "monthly",
                          })
                        }
                      >
                        <option value="once">One time</option>
                        <option value="monthly">Every month</option>
                      </select>
                    </label>
                    {form.frequency === "monthly" && (
                      <label>
                        Repeat until (inclusive)
                        <input
                          required
                          type="date"
                          min={form.due_date}
                          max="2100-12-31"
                          value={form.end_date}
                          onChange={(e) =>
                            setForm({ ...form, end_date: e.target.value })
                          }
                        />
                        <small>
                          Up to 5 years. Shorter months use their last day.
                        </small>
                      </label>
                    )}
                  </>
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
              <Button disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Save expense"}
              </Button>
            </div>
          </form>
        </section>
      )}
      <section className="card">
        <div className="expense-filters">
          <label>
            Month
            <input
              type="month"
              required
              min="2000-01"
              max="2100-12"
              value={month}
              disabled={busy}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                  setMonth(e.target.value);
                  setForm(null);
                }
              }}
            />
          </label>
          <label>
            Show
            <select
              value={deleted ? "deleted" : "active"}
              disabled={busy}
              onChange={(e) => {
                setDeleted(e.target.value === "deleted");
                setForm(null);
              }}
            >
              <option value="active">Active expenses</option>
              <option value="deleted">Deleted expenses</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p role="status">Loading expenses…</p>
        ) : !rows.length ? (
          <div className="empty">
            <Receipt size={30} />
            <h2>No {deleted ? "deleted " : ""}expenses this month</h2>
            <p className="muted">
              {canWrite
                ? "Add an expense or choose another month."
                : "Your business owner can add expenses here."}
            </p>
          </div>
        ) : (
          <div className="expense-list">
            {rows.map((e) => (
              <article className="expense-row" key={e.id}>
                <div>
                  <span className="eyebrow">
                    {categories.find((c) => c.id === e.category_id)?.name ||
                      "Category"}{" "}
                    ·{" "}
                    {e.expense_schedules.frequency === "monthly"
                      ? "Monthly"
                      : "One time"}
                  </span>
                  <h3>{e.title}</h3>
                  <p className="muted">{e.description}</p>
                  <small>
                    Due {e.due_date}
                    {e.due_date < today && !deleted
                      ? " · Past due date (payment status not tracked yet)"
                      : ""}
                  </small>
                </div>
                <div className="expense-row-end">
                  <strong className="expense-amount">
                    {formatMinor(BigInt(e.amount_minor), business.currency)}
                  </strong>
                  {owner && (
                    <div className="actions">
                      {canWrite && !deleted && (
                        <Button
                          secondary
                          disabled={busy}
                          onClick={() => open(e)}
                        >
                          Edit
                        </Button>
                      )}
                      {canWrite && (
                        <Button
                          secondary
                          disabled={busy}
                          onClick={() =>
                            change(e, deleted ? "restore" : "delete")
                          }
                        >
                          {deleted ? "Restore" : "Delete"}
                        </Button>
                      )}
                      <Button
                        secondary
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const { data, error } = await client()
                              .from("expense_history")
                              .select(
                                "id,action,created_at,before_record,after_record",
                              )
                              .eq("business_id", business.id)
                              .eq("entity_id", e.id)
                              .order("id", { ascending: false })
                              .limit(100);
                            if (error) throw error;
                            setHistory(data as History[]);
                          })
                        }
                      >
                        History
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {history && (
        <section className="card">
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
        </section>
      )}
    </div>
  );
}
