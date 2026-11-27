"use client";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Ellipsis,
  RefreshCw,
  Target,
} from "lucide-react";
import { Button as VipButton } from "./vip-ui/button";
import { Menu, MenuItem, MenuTrigger } from "./vip-ui/menu";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "./vip-ui/empty-state";
import { Skeleton } from "./vip-ui/skeleton";
import { Card } from "./vip-ui/card";
import { Select } from "./vip-ui/select";
import { Badge } from "./vip-ui/badge";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./vip-ui/segmented-control";
import { Checkbox } from "./vip-ui/checkbox";
import { ToastFeedback } from "./feedback";
import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/domain";
import { signedMoney } from "@/lib/dashboard-math";
import { readableError } from "@/lib/supabase";
import {
  notificationInbox,
  refreshNotifications,
  notificationPreferences,
  savePreferences,
  changeNotification,
  markAllRead,
  defaults,
  type Notification,
  type Preferences,
} from "@/lib/notifications";
import { Button, Notice } from "./ui";
const alertDetails = {
  overdue: { label: "Overdue", icon: CircleAlert, tone: "error" },
  upcoming: { label: "Upcoming", icon: CalendarClock, tone: "warning" },
  target: { label: "Collection target", icon: Target, tone: "accent" },
  funding: { label: "Funding gap", icon: CircleAlert, tone: "warning" },
  funded: { label: "Funded", icon: CheckCircle2, tone: "success" },
} as const;
const alertDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function NotificationsPanel({
  business,
  mode,
  uid,
  navigate,
  onChange,
}: {
  business: Business;
  mode: "inbox" | "preferences";
  uid: string;
  navigate: (v: "settlements" | "targets", alert: Notification) => void;
  onChange: () => void;
}) {
  const [rows, setRows] = useState<Notification[]>([]),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(true),
    [filter, setFilter] = useState<"all" | "unread" | "earlier">("all");
  const [permission, setPermission] = useState("unsupported");
  const generation = useRef(0),
    lock = useRef(false);
  async function load(generate = true) {
    const n = ++generation.current;
    if (mode === "preferences") {
      const preferences = await notificationPreferences(business.id, uid);
      if (n === generation.current) setPrefs(preferences);
      return;
    }
    if (generate) await refreshNotifications(business.id);
    const inbox = await notificationInbox(business.id, uid);
    if (n === generation.current) {
      setRows(inbox);
      onChange();
    }
  }
  useEffect(() => {
    setBusy(true);
    setRows([]);
    setError("");
    if (mode === "preferences" && "Notification" in window)
      setPermission(window.Notification.permission);
    load()
      .catch((e) => setError(readableError(e)))
      .finally(() => setBusy(false));
    return () => {
      generation.current++;
    };
  }, [business.id, uid, mode]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!navigator.onLine) throw Error("offline");
      await fn();
      await load(false);
      if (mode === "preferences") onChange();
    } catch (e) {
      setError(readableError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function testDevice() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator))
        throw Error("Browser notifications are unsupported.");
      const p = await window.Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg?.active)
        throw Error("Service worker is not active. Reload FlowLedger.");
      await reg.showNotification("FlowLedger", {
        body: "Device notification test. Open FlowLedger to review your alerts.",
        tag: "flowledger-test",
      });
      setMessage("Test notification sent on this device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notification test failed.");
    }
  }
  const unread = rows.filter((n) => !n.read_at);
  const earlier = rows.filter((n) => n.read_at);
  const count = unread.length;
  const groups = [
    ...(filter !== "earlier" && unread.length
      ? [{ title: "Unread", rows: unread }]
      : []),
    ...(filter !== "unread" && earlier.length
      ? [{ title: "Earlier", rows: earlier }]
      : []),
  ];
  return (
    <div className="stack">
      <ToastFeedback error={error} message={message} />
      {error && <Notice error>{error}</Notice>}
      {mode === "inbox" && (
        <Card className="card notification-inbox">
          <header className="notification-toolbar">
            <div className="notification-title">
              <Bell size={20} aria-hidden />
              <h2>Inbox</h2>
              {count > 0 && (
                <Badge className="notification-unread">{count} unread</Badge>
              )}
            </div>
            <div className="notification-tools">
              <VipButton
                type="button"
                variant="secondary"
                size="md"
                isDisabled={busy}
                onPress={() => run(() => refreshNotifications(business.id))}
              >
                <RefreshCw size={16} aria-hidden /> Refresh
              </VipButton>
              <VipButton
                type="button"
                variant="outline"
                size="md"
                isDisabled={busy || !count}
                onPress={() => run(() => markAllRead(business.id, uid))}
              >
                Mark all read
              </VipButton>
            </div>
          </header>

          <SegmentedControl
            aria-label="Filter alerts"
            value={filter}
            onValueChange={({ value }) => {
              if (value === "all" || value === "unread" || value === "earlier")
                setFilter(value);
            }}
          >
            <SegmentedControlItem value="all">All</SegmentedControlItem>
            <SegmentedControlItem value="unread">Unread</SegmentedControlItem>
            <SegmentedControlItem value="earlier">Earlier</SegmentedControlItem>
          </SegmentedControl>

          {busy && !rows.length ? (
            <div role="status" className="notification-loading">
              <span className="sr-only">Loading notifications</span>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !groups.length ? (
            <EmptyState>
              <EmptyStateIcon>
                <CheckCircle2 />
              </EmptyStateIcon>
              <EmptyStateTitle>
                {filter === "unread" ? "You’re caught up" : "No alerts to show"}
              </EmptyStateTitle>
              <EmptyStateDescription>
                {filter === "unread"
                  ? "New alerts will appear here."
                  : "Payment reminders and funding alerts will appear here as they’re generated."}
              </EmptyStateDescription>
            </EmptyState>
          ) : (
            groups.map((group) => (
              <section
                className="notification-group"
                key={group.title}
                aria-label={group.title}
              >
                <h3>{group.title}</h3>
                {group.rows.map((alert) => {
                  const { icon: Icon, label, tone } = alertDetails[alert.kind];
                  const payment =
                    alert.kind === "upcoming" || alert.kind === "overdue";
                  return (
                    <article
                      className="notification-row"
                      data-unread={!alert.read_at || undefined}
                      key={alert.id}
                    >
                      <div className="notification-kind" data-tone={tone}>
                        <Icon size={19} aria-hidden />
                      </div>
                      <div className="notification-copy">
                        <div className="notification-meta">
                          <Badge variant={tone}>{label}</Badge>
                          {!alert.read_at && (
                            <Badge className="notification-unread">New</Badge>
                          )}
                          <time dateTime={alert.alert_date}>
                            {alertDate.format(
                              new Date(alert.alert_date + "T00:00:00Z"),
                            )}
                          </time>
                        </div>
                        <h4>{alert.title}</h4>
                        <p>{alert.detail}</p>
                        {BigInt(alert.amount_minor) > 0n && (
                          <strong className="notification-amount">
                            {signedMoney(
                              BigInt(alert.amount_minor),
                              business.currency,
                            )}
                          </strong>
                        )}
                      </div>
                      <div className="notification-row-actions">
                        <VipButton
                          type="button"
                          variant="secondary"
                          size="md"
                          onPress={() =>
                            navigate(payment ? "settlements" : "targets", alert)
                          }
                        >
                          {payment ? "View obligation" : "View target"}
                        </VipButton>
                        <MenuTrigger>
                          <VipButton
                            type="button"
                            variant="ghost"
                            size="md"
                            iconOnly
                            isDisabled={busy}
                            aria-label={`Actions for ${alert.title}`}
                          >
                            <Ellipsis size={18} aria-hidden />
                          </VipButton>
                          <Menu aria-label="Notification actions">
                            <MenuItem
                              onAction={() =>
                                run(() =>
                                  changeNotification(
                                    business.id,
                                    uid,
                                    alert.id,
                                    alert.read_at ? "unread" : "read",
                                  ),
                                )
                              }
                            >
                              {alert.read_at ? "Mark unread" : "Mark read"}
                            </MenuItem>
                            <MenuItem
                              onAction={() =>
                                run(() =>
                                  changeNotification(
                                    business.id,
                                    uid,
                                    alert.id,
                                    "dismiss",
                                  ),
                                )
                              }
                            >
                              Dismiss
                            </MenuItem>
                          </Menu>
                        </MenuTrigger>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))
          )}
        </Card>
      )}
      {mode === "preferences" && (
        <>
          <Card className="card stack">
            <h2>My reminder preferences</h2>
            <fieldset disabled={busy}>
              <div className="stack">
                {(["upcoming", "overdue", "targets"] as const).map((k) => (
                  <Checkbox
                    key={k}
                    isSelected={prefs[k]}
                    isDisabled={busy}
                    onChange={(checked) => setPrefs({ ...prefs, [k]: checked })}
                  >
                    {k === "targets"
                      ? "Collection and funding alerts"
                      : k === "upcoming"
                        ? "Upcoming payments"
                        : "Overdue payments"}
                  </Checkbox>
                ))}
                <Select
                  label="Reminder lead time"
                  value={String(prefs.lead_days)}
                  isDisabled={busy}
                  onChange={(key) => {
                    if (typeof key === "string")
                      setPrefs({ ...prefs, lead_days: Number(key) });
                  }}
                  options={[1, 2, 3, 5, 7, 14].map((days) => ({
                    id: String(days),
                    name: `${days} ${days === 1 ? "day" : "days"}`,
                  }))}
                />
              </div>
            </fieldset>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await savePreferences(business.id, uid, prefs);
                  await refreshNotifications(business.id);
                  setMessage("Preferences saved.");
                })
              }
            >
              Save preferences
            </Button>
          </Card>
          <Card className="card stack">
            <h2>Device notifications</h2>
            <p>
              Permission: {permission}. This test displays a local browser
              notification; remote push delivery is not configured.
            </p>
            <Button
              secondary
              disabled={permission === "unsupported" || permission === "denied"}
              onClick={testDevice}
            >
              Enable / test device notifications
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
