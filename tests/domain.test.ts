import test from "node:test";
import assert from "node:assert/strict";
import {
  businessSchema,
  emptyBusiness,
  validLogo,
  invitationStatus,
} from "../lib/domain";
test("business input accepts precise amounts and working days", () => {
  assert.equal(
    businessSchema.safeParse({
      ...emptyBusiness(),
      name: "Shop",
      opening_balance: "1250.25",
    }).success,
    true,
  );
});
test("rejects negative, fractional-cent and overlarge balances", () => {
  for (const opening_balance of ["-1", "1.001", "1000000000000", "NaN"])
    assert.equal(
      businessSchema.safeParse({
        ...emptyBusiness(),
        name: "Shop",
        opening_balance,
      }).success,
      false,
    );
});
test("rejects empty or duplicate business days, invalid timezone and calendar date", () => {
  for (const patch of [
    { business_days: [] },
    { business_days: [1, 1] },
    { business_days: [7] },
    { timezone: "unknown/time" },
    { balance_date: "2026-02-30" },
  ])
    assert.equal(
      businessSchema.safeParse({ ...emptyBusiness(), name: "Shop", ...patch })
        .success,
      false,
    );
});
test("logo restrictions reject SVG and large uploads", () => {
  assert.equal(validLogo({ type: "image/png", size: 512000 }), true);
  assert.equal(validLogo({ type: "image/svg+xml", size: 100 }), false);
  assert.equal(validLogo({ type: "image/png", size: 512001 }), false);
});
test("invitation expiry is inclusive and revocation overrides expiry", () => {
  const i = {
    id: "1",
    business_id: "1",
    email: "viewer@example.com",
    created_at: "",
    expires_at: "2026-01-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
  };
  assert.equal(invitationStatus(i, Date.parse(i.expires_at)), "Expired");
  assert.equal(
    invitationStatus({ ...i, revoked_at: "2025-01-01" }, 0),
    "Revoked",
  );
});
