"use client";
import { Button as VipButton } from "./vip-ui/button";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Ellipsis, Folder, Plus, Search } from "lucide-react";
import type { Category } from "@/lib/expenses";
import { readableError } from "@/lib/supabase";
import { Button, Notice } from "./ui";
import { Badge } from "./vip-ui/badge";
import { DialogContent } from "./vip-ui/dialog";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "./vip-ui/empty-state";
import { Menu, MenuItem, MenuTrigger } from "./vip-ui/menu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./vip-ui/segmented-control";
import { Skeleton } from "./vip-ui/skeleton";
import { TextField } from "./vip-ui/text-field";

export function ExpenseCategories({
  categories,
  loading,
  busy,
  canWrite,
  onBack,
  onSave,
  onChange,
}: {
  categories: Category[];
  loading: boolean;
  busy: boolean;
  canWrite: boolean;
  onBack: () => void;
  onSave: (name: string, category: Category | null) => Promise<void>;
  onChange: (category: Category) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"active" | "deleted">("active");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
    category: Category | null;
    name: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const title = useId();
  const deleted = filter === "deleted";
  const activeCount = categories.filter(
    (category) => !category.deleted_at,
  ).length;
  const visible = categories.filter(
    (category) =>
      Boolean(category.deleted_at) === deleted &&
      category.name
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    heading.current?.focus();
  }, []);

  function open(category: Category | null) {
    setError("");
    setEditor({ category, name: category?.name ?? "" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || lock.current || !canWrite) return;
    const name = editor.name.trim();
    if (!name) {
      setError("Enter a category name.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(name, editor.category);
      setEditor(null);
      setFilter("active");
      setQuery("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="category-manager" aria-labelledby={title}>
      <header className="category-header">
        <div>
          <VipButton
            type="button"
            variant="minimal"

            className="category-back text-link"
            onClick={onBack}
            isDisabled={busy}
          >
            <ArrowLeft size={16} aria-hidden /> Back to expenses
          </VipButton>
          <h2 id={title} tabIndex={-1} ref={heading}>
            Expense categories
          </h2>
          <p className="muted">
            Organize expenses by what your business spends on.
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            disabled={busy || loading}
            onClick={() => open(null)}
          >
            <Plus size={18} aria-hidden /> Add category
          </Button>
        )}
      </header>

      <Card className="card category-list">
        <div className="category-controls">
          <SegmentedControl
            aria-label="Category status"
            value={filter}
            onValueChange={({ value }) => {
              if (value === "active" || value === "deleted") setFilter(value);
            }}
          >
            <SegmentedControlItem value="active">
              Active{loading ? "" : ` (${activeCount})`}
            </SegmentedControlItem>
            <SegmentedControlItem value="deleted">
              Deleted{loading ? "" : ` (${categories.length - activeCount})`}
            </SegmentedControlItem>
          </SegmentedControl>
          <TextField
            type="search"
            aria-label="Search categories"
            placeholder="Search categories"
            value={query}
            onChange={setQuery}
          />
        </div>
        {loading && !categories.length ? (
          <div role="status" className="category-loading">
            <span className="sr-only">Loading categories</span>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : visible.length ? (
          <ul
            className="category-rows"
            aria-label={deleted ? "Deleted categories" : "Active categories"}
          >
            {visible.map((category) => (
              <li className="category-row" key={category.id}>
                <span className="category-glyph">
                  <Folder size={18} aria-hidden />
                </span>
                <strong>{category.name}</strong>
                {category.deleted_at ? (
                  <>
                    <Badge variant="neutral">Deleted</Badge>
                    {canWrite && (
                      <Button
                        type="button"
                        secondary
                        disabled={busy || loading}
                        onClick={() => onChange(category)}
                      >
                        Restore<span className="sr-only"> {category.name}</span>
                      </Button>
                    )}
                  </>
                ) : (
                  canWrite && (
                    <MenuTrigger>
                      <Button
                        type="button"
                        secondary
                        disabled={busy || loading}
                        aria-label={`Actions for ${category.name}`}
                      >
                        <Ellipsis size={20} aria-hidden />
                      </Button>
                      <Menu aria-label={`Actions for ${category.name}`}>
                        <MenuItem onAction={() => open(category)}>
                          Rename category
                        </MenuItem>
                        <MenuItem
                          variant="destructive"
                          onAction={() => onChange(category)}
                        >
                          Delete category
                        </MenuItem>
                      </Menu>
                    </MenuTrigger>
                  )
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            <EmptyStateIcon>
              {query.trim() ? <Search aria-hidden /> : <Folder aria-hidden />}
            </EmptyStateIcon>
            <EmptyStateTitle>
              {query.trim()
                ? "No matching categories"
                : deleted
                  ? "No deleted categories"
                  : "No active categories"}
            </EmptyStateTitle>
            <EmptyStateDescription>
              {query.trim()
                ? "Try another name or clear your search."
                : deleted
                  ? "Deleted categories will appear here and can be restored."
                  : canWrite
                    ? "Add a category to start organizing expenses."
                    : "Your business owner can add categories here."}
            </EmptyStateDescription>
            {query.trim() && (
              <Button type="button" secondary onClick={() => setQuery("")}>
                Clear search
              </Button>
            )}
          </EmptyState>
        )}
      </Card>

      <DialogContent
        aria-label={editor?.category ? "Rename category" : "Add category"}
        overlayProps={{
          isOpen: editor !== null && canWrite,
          isDismissable: !saving,
          isKeyboardDismissDisabled: saving,
          onOpenChange: (open) => {
            if (!open && !lock.current) setEditor(null);
          },
        }}
      >
        {editor && (
          <Form validationBehavior="native" className="stack" onSubmit={save}>
            <h2>{editor.category ? "Rename category" : "Add category"}</h2>
            <TextField
              autoFocus
              label="Category name"
              placeholder="e.g. Rent"
              isRequired
              maxLength={60}
              isDisabled={saving}
              value={editor.name}
              onChange={(name) => setEditor({ ...editor, name })}
            />
            {error && <Notice error>{error}</Notice>}
            <div className="form-actions">
              <Button
                type="button"
                secondary
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !editor.name.trim()}>
                {saving
                  ? "Saving…"
                  : editor.category
                    ? "Save name"
                    : "Add category"}
              </Button>
            </div>
          </Form>
        )}
      </DialogContent>
    </section>
  );
}
