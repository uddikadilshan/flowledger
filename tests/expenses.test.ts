import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  toMinor,
  decimalAmount,
  formatMinor,
  expenseSchema,
} from "../lib/expenses";
const valid = {
  title: "Rent",
  description: "",
  category_id: "10000000-0000-4000-8000-000000000001",
  amount: "100.25",
  due_date: "2026-01-31",
  frequency: "monthly",
  end_date: "2026-03-31",
};
test("monthly recurrence preserves original anchor and leap years", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-12-31", 1), "2027-01-31");
});
test("money uses exact minor units, including totals above safe integer range", () => {
  assert.equal(toMinor("0.10") + toMinor("0.20"), 30n);
  assert.equal(decimalAmount(10025), "100.25");
  assert.equal(
    formatMinor(9007199254740993n, "LKR"),
    "LKR 90,071,992,547,409.93",
  );
});
test("expense validation rejects invalid amounts, dates and recurrence bounds", () => {
  assert.equal(expenseSchema.safeParse(valid).success, true);
  for (const change of [
    { amount: "0" },
    { amount: "-1" },
    { amount: "0.001" },
    { amount: "1e3" },
    { due_date: "2026-02-30" },
    { due_date: "" },
    { due_date: "garbage" },
    { end_date: "2025-12-31" },
    { end_date: "2032-01-31" },
    { category_id: "" },
  ])
    assert.equal(
      expenseSchema.safeParse({ ...valid, ...change }).success,
      false,
      JSON.stringify(change),
    );
});
