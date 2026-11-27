"use client";
import {
  Button as VipButton,
  type ButtonProps as VipButtonProps,
} from "./vip-ui/button";
import { TextField } from "./vip-ui/text-field";
import { Form } from "./vip-ui/form";
import { Card } from "./vip-ui/card";
import { FileTrigger } from "./vip-ui/file-trigger";
import {
  MenuContent,
  MenuItem,
  MenuPopover,
  MenuSeparator,
  MenuTrigger,
} from "./vip-ui/menu";
import { BusinessSwitcher } from "./business-switcher";
import { ThemeSwitch } from "./theme-switch";
import {
  Sidebar,
  SidebarInset,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./vip-ui/sidebar";
import { Badge } from "./vip-ui/badge";
import { ToastFeedback, useFeedback } from "./feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Bell,
  Building2,
  LayoutDashboard,
  CalendarDays,
  Receipt,
  Landmark,
  Wallet,
  ArrowLeftRight,
  Target,
  Users,
  Archive,
  Settings,
  Plus,
  LogOut,
  CircleUserRound,
  Pencil,
  ArrowUpRight,
} from "lucide-react";
import { client, configured, readableError } from "@/lib/supabase";
import {
  command,
  listBusinesses,
  listInvitations,
  listMembers,
} from "@/lib/api";
import {
  invitationStatus,
  days,
  money,
  validLogo,
  type Business,
  type Invitation,
  type Member,
} from "@/lib/domain";
import { BusinessForm } from "./business-form";
import { Button, Notice, SetupNotice } from "./ui";
import { ExpensesPanel } from "./expenses-panel";
import { LoansPanel } from "./loans-panel";
import { FundsPanel } from "./funds-panel";
import { SettlementsPanel } from "./settlements-panel";
import { TargetsPanel } from "./targets-panel";
import { CalendarPanel } from "./calendar-panel";
import type { Target as Obligation } from "@/lib/settlements";
import { DashboardPanel } from "./dashboard-panel";
import { NotificationsPanel } from "./notifications-panel";
import {
  notificationCount,
  refreshNotifications,
  type Notification,
} from "@/lib/notifications";
type View =
  | "calendar"
  | "expenses"
  | "loans"
  | "funds"
  | "settlements"
  | "targets"
  | "notifications"
  | "overview"
  | "businesses"
  | "members"
  | "settings"
  | "archived"
  | "create"
  | "edit";
export function Workspace() {
  const { confirm, notify } = useFeedback();
  const [user, setUser] = useState<User | null>(null),
    [businesses, setBusinesses] = useState<Business[]>([]),
    [active, setActive] = useState(""),
    [view, setView] = useState<View>("overview"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [email, setEmail] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [token, setToken] = useState(""),
    [loadedLogo, setLoadedLogo] = useState<{
      path: string;
      url: string;
    } | null>(null),
    [online, setOnline] = useState(true);
  const operationLock = useRef(false),
    generation = useRef(0);
  const business = businesses.find((b) => b.id === active),
    owner = business?.owner_id === user?.id;
  const logoPath = business?.logo_path;
  const userId = user?.id;
  const logo = loadedLogo && loadedLogo.path === logoPath ? loadedLogo.url : "";
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const [linkedObligation, setLinkedObligation] = useState<{
    target: Obligation;
    pay: boolean;
  } | null>(null);
  const [activeAlert, setActiveAlert] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const inboxGeneration = useRef(0);
  const updateInbox = useCallback(
    async (generate = false) => {
      const n = ++inboxGeneration.current;
      if (!business?.id || !user?.id) return;
      try {
        if (generate) await refreshNotifications(business.id);
        const count = await notificationCount(business.id, user.id);
        if (n === inboxGeneration.current) setUnreadCount(count);
      } catch {
        if (n === inboxGeneration.current) setUnreadCount(0);
      }
    },
    [business?.id, user?.id],
  );
  useEffect(() => {
    setUnreadCount(0);
    void updateInbox(true);
    const timer = window.setInterval(() => void updateInbox(true), 60000);
    return () => {
      window.clearInterval(timer);
      inboxGeneration.current++;
    };
  }, [updateInbox]);
  const refresh = useCallback(async (preferred?: string) => {
    const data = await listBusinesses();
    setBusinesses(data);
    setActive((old) =>
      data.some((b) => b.id === (preferred || old) && !b.archived_at)
        ? preferred || old
        : data.find((b) => !b.archived_at)?.id || "",
    );
  }, []);
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let disposed = false;
    const auth = client().auth;
    const incoming = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (incoming) {
      sessionStorage.setItem("flowledger-invite", incoming);
      history.replaceState(null, "", location.pathname);
    }
    setToken(incoming || sessionStorage.getItem("flowledger-invite") || "");
    setOnline(navigator.onLine);
    const connect = () => setOnline(navigator.onLine);
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    auth.getUser().then(async ({ data, error }) => {
      if (disposed) return;
      if (error || !data.user) {
        location.replace("/auth/");
        return;
      }
      setUser(data.user);
      try {
        await refresh();
      } catch (e) {
        setError(readableError(e));
      } finally {
        if (!disposed) setLoading(false);
      }
    });
    const { data } = auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setBusinesses([]);
        setUser(null);
        location.replace("/auth/");
      }
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
    };
  }, [refresh]);
  useEffect(() => {
    const n = ++generation.current;
    setMembers([]);
    setInvites([]);
    setInviteLink("");
    if (!business) return;
    if (view === "members" && owner)
      Promise.all([listMembers(business.id), listInvitations(business.id)])
        .then(([m, i]) => {
          if (n === generation.current) {
            setMembers(m);
            setInvites(i);
          }
        })
        .catch((e) => {
          if (n === generation.current) setError(readableError(e));
        });
  }, [business, view, owner]);
  useEffect(() => {
    setLoadedLogo(null);
    if (!logoPath || !userId) return;
    const controller = new AbortController();
    let url: string | undefined;
    async function loadLogo(path: string) {
      try {
        const { data } = await client().storage.from("business-logos").download(
          path,
          {},
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!data || controller.signal.aborted) return;
        url = URL.createObjectURL(data);
        setLoadedLogo({ path, url });
      } catch {
        // The business picker already displays its fallback icon.
      }
    }
    void loadLogo(logoPath);
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [logoPath, userId]);
  async function run(fn: () => Promise<void>) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!navigator.onLine) throw new Error("offline");
      await fn();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
      operationLock.current = false;
    }
  }
  function navigate(v: View, alert: Notification | null = null) {
    setActiveAlert(alert);
    setLinkedObligation(null);
    window.scrollTo(0, 0);
    setView(v);
    setError("");
    setMessage("");
  }
  async function upload(file: File | undefined) {
    if (!file || !business) return;
    if (!validLogo(file)) {
      setError("Choose a PNG, JPEG or WebP image, up to 500 KB.");
      return;
    }
    const b = business;
    await run(async () => {
      const extension = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
        }[file.type]!,
        path = `${b.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await client()
        .storage.from("business-logos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      try {
        await command("set_logo", { business_id: b.id, path });
      } catch (err) {
        await client().storage.from("business-logos").remove([path]);
        throw err;
      }
      let warning = false;
      if (b.logo_path) {
        const { error } = await client()
          .storage.from("business-logos")
          .remove([b.logo_path]);
        warning = !!error;
      }
      await refresh(b.id);
      setMessage("Logo updated.");
      if (warning) notify("warning", "The previous logo could not be removed.");
    });
  }
  async function archive(b: Business, restore = false) {
    if (
      (await confirm({
        title: `${restore ? "Restore" : "Archive"} ${b.name}?`,
        description: restore
          ? "This business will return to your active list."
          : "Records are preserved. You can restore the business from Archived.",
        action: restore ? "Restore business" : "Archive business",
        danger: !restore,
        perform: async () => {
          await command("archive_business", {
            business_id: b.id,
            archived: !restore,
          });
        },
      })) === null
    )
      return;
    try {
      await refresh(restore ? b.id : undefined);
      navigate(restore ? "overview" : "archived");
      setMessage(restore ? "Business restored." : "Business archived.");
    } catch (err) {
      setMessage(restore ? "Business restored." : "Business archived.");
      setError(readableError(err));
    }
  }
  if (!configured)
    return (
      <main className="auth-screen">
        <SetupNotice />
      </main>
    );
  if (loading)
    return (
      <main className="auth-screen">
        <Notice>Opening your workspace…</Notice>
      </main>
    );
  const navigation = [
    { id: "overview", text: "Overview", icon: LayoutDashboard },
    { id: "calendar", text: "Calendar", icon: CalendarDays },
    { id: "expenses", text: "Expenses", icon: Receipt },
    { id: "loans", text: "Loans", icon: Landmark },
    { id: "funds", text: "Collections", icon: Wallet },
    { id: "settlements", text: "Settlements", icon: ArrowLeftRight },
    { id: "targets", text: "Daily targets", icon: Target },
    { id: "businesses", text: "Businesses", icon: Building2 },
    { id: "members", text: "People & access", icon: Users },
    { id: "settings", text: "Settings", icon: Settings },
    { id: "archived", text: "Archived", icon: Archive },
  ] as const;
  return (
    <SidebarProvider shortcut={false} className="min-h-dvh">
      <Sidebar collapsible="none" aria-label="Workspace navigation">
        <div className="workspace-navigation">
          <SidebarHeader className="wordmark">
            ƒ <span>FlowLedger.</span>
          </SidebarHeader>
          <SidebarContent className="sidebar-navigation">
            {[
              { label: "Money", items: navigation.slice(0, 7) },
              { label: "Business", items: navigation.slice(7) },
            ].map(({ label, items }) => (
              <SidebarGroup key={label}>
                <SidebarGroupLabel className="nav-group-label">
                  {label}
                </SidebarGroupLabel>
                <SidebarMenu aria-label={label}>
                  {items
                    .filter((n) => n.id !== "members" || owner)
                    .map((n) => (
                      <li key={n.id}>
                        <NavigationButton
                          className={view === n.id ? "active" : ""}
                          aria-current={view === n.id ? "page" : undefined}
                          onClick={() => navigate(n.id)}
                        >
                          <n.icon size={19} />
                          {n.text}
                        </NavigationButton>
                      </li>
                    ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </div>
      </Sidebar>
      <SidebarInset className="main" render={(props) => <main {...props} />}>
        <header className="topbar">
          <SidebarTrigger size="lg" className="@3xl/sidebar-shell:hidden" />
          <BusinessSwitcher
            business={business}
            logo={logo}
            userId={user?.id}
            disabled={busy}
            businesses={businesses.filter((item) => !item.archived_at)}
            onSelect={(id) => {
              setActive(id);
              navigate("overview");
            }}
            onManage={() => navigate("businesses")}
            onCreate={() => navigate("create")}
          />
          <div className="workspace-account">
            {business && (
              <VipButton
                type="button"
                size="lg"
                iconOnly
                variant="secondary"
                className="topbar-notifications"
                aria-label={
                  unreadCount
                    ? `Notifications, ${unreadCount} unread`
                    : "Notifications"
                }
                aria-pressed={view === "notifications"}
                onPress={() => navigate("notifications")}
              >
                <Bell size={20} aria-hidden />
                {unreadCount > 0 && (
                  <span className="notification-trigger-count" aria-hidden>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </VipButton>
            )}
            <ThemeSwitch />
            <MenuTrigger>
              <Button
                type="button"
                secondary
                iconOnly
                aria-label="Account menu"
              >
                <CircleUserRound aria-hidden />
              </Button>
              <MenuPopover placement="bottom end">
                <MenuContent aria-label="Account">
                  <MenuItem isDisabled textValue={user?.email ?? "Signed in"}>
                    {user?.email ?? "Signed in"}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem onAction={() => navigate("businesses")}>
                    Your businesses
                  </MenuItem>
                  <MenuItem
                    isDisabled={!business}
                    onAction={() => navigate("settings")}
                  >
                    Business settings
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    isDisabled={busy}
                    onAction={() =>
                      run(async () => {
                        const { error } = await client().auth.signOut();
                        if (error) throw error;
                      })
                    }
                  >
                    <LogOut size={16} aria-hidden />
                    Sign out
                  </MenuItem>
                </MenuContent>
              </MenuPopover>
            </MenuTrigger>
          </div>
        </header>
        <div className="content">
          <ToastFeedback
            error={error}
            message={message}
            warning={
              !online
                ? "You’re offline. Changes can be saved when you reconnect."
                : undefined
            }
          />
          {!online && (
            <Notice error>
              You’re offline. Reconnect before changing any records.
            </Notice>
          )}
          {error && (
            <Notice error>
              {error}{" "}
              <VipButton
                type="button"
                variant="minimal"
                className="text-link"
                onClick={() => run(() => refresh())}
              >
                Refresh
              </VipButton>
            </Notice>
          )}

          {token && (
            <Card className="card invitation-banner">
              <h2>You have a business invitation</h2>
              <p>Accept using the verified email address the owner invited.</p>
              <Button
                disabled={busy || !online}
                onClick={() =>
                  run(async () => {
                    const id = await command("accept_invitation", { token });
                    setToken("");
                    sessionStorage.removeItem("flowledger-invite");
                    history.replaceState(null, "", location.pathname);
                    await refresh(String(id));
                    setMessage(
                      "Invitation accepted. You have view-only access.",
                    );
                  })
                }
              >
                Accept invitation
              </Button>
            </Card>
          )}
          {view === "create" || view === "edit" ? (
            <BusinessForm
              key={view + active}
              business={view === "edit" ? business : undefined}
              onSaved={async (id) => {
                await refresh(id);
                navigate("overview");
                setMessage("Business saved.");
              }}
              onCancel={() => navigate("overview")}
            />
          ) : (
            <>
              <div className={view === "overview" ? "sr-only" : "page-heading"}>
                <div>
                  <h1 ref={pageHeading} tabIndex={-1}>
                    {
                      {
                        overview: "Overview",
                        calendar: "Payment calendar",
                        notifications: "Notifications",
                        expenses: "Expenses & categories",
                        loans: "Loans & instalments",
                        funds: "Collections & external funding",
                        settlements: "Settlements & payments",
                        targets: "Daily collection targets",
                        businesses: "Your businesses",
                        members: "People & access",
                        settings: "Business settings",
                        archived: "Archived businesses",
                      }[view]
                    }
                  </h1>
                </div>
                {view === "businesses" && (
                  <Button onClick={() => navigate("create")}>
                    <Plus size={18} />
                    Create business
                  </Button>
                )}
              </div>
              {view === "businesses" || view === "archived" ? (
                <div className="business-grid">
                  {businesses
                    .filter((b) =>
                      view === "archived"
                        ? b.archived_at
                        : b.archived_at === null,
                    )
                    .map((b) => (
                      <Card role="article" className="card" key={b.id}>
                        <Building2 className="accent" />
                        <h2>{b.name}</h2>
                        <p className="muted">
                          {b.description || "No description added."}
                        </p>
                        <Badge
                          variant={
                            b.owner_id === user?.id ? "accent" : "neutral"
                          }
                        >
                          {b.owner_id === user?.id ? "Owner" : "Viewer"}
                        </Badge>
                        <div className="form-actions">
                          {b.archived_at ? (
                            b.owner_id === user?.id ? (
                              <Button
                                secondary
                                disabled={busy}
                                onClick={() => archive(b, true)}
                              >
                                Restore business
                              </Button>
                            ) : (
                              <span className="muted">Archived by owner</span>
                            )
                          ) : (
                            <>
                              {b.owner_id === user?.id && (
                                <Button
                                  type="button"
                                  secondary
                                  disabled={busy}
                                  onClick={() => {
                                    setActive(b.id);
                                    navigate("edit");
                                  }}
                                >
                                  <Pencil size={16} aria-hidden /> Edit business
                                </Button>
                              )}
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setActive(b.id);
                                  navigate("overview");
                                }}
                              >
                                Open business{" "}
                                <ArrowUpRight size={16} aria-hidden />
                              </Button>
                            </>
                          )}
                        </div>
                      </Card>
                    ))}
                  {!businesses.some((b) =>
                    view === "archived" ? b.archived_at : !b.archived_at,
                  ) && (
                    <Card className="card empty">
                      <Building2 size={32} />
                      <h2>
                        {view === "archived"
                          ? "No archived businesses"
                          : "Create your first business"}
                      </h2>
                      <p>
                        Invited users can open the invitation link shared by
                        their business owner.
                      </p>
                      {view !== "archived" && (
                        <Button onClick={() => navigate("create")}>
                          Create business
                        </Button>
                      )}
                    </Card>
                  )}
                </div>
              ) : !business ? (
                <Card className="card empty">
                  <Building2 size={36} />
                  <h2>Your workspace starts here</h2>
                  <p>
                    Create a business, or open an invitation link to join as a
                    viewer.
                  </p>
                  <Button onClick={() => navigate("create")}>
                    Create your first business
                  </Button>
                </Card>
              ) : view === "targets" ? (
                <TargetsPanel
                  key={business.id}
                  business={business}
                  alert={activeAlert}
                />
              ) : view === "calendar" ? (
                <CalendarPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                  onConfigureCountry={
                    owner && !business.archived_at
                      ? () => navigate("edit")
                      : undefined
                  }
                  onOpen={(target, pay) => {
                    navigate("settlements");
                    setLinkedObligation({ target, pay });
                  }}
                />
              ) : view === "settlements" ? (
                <SettlementsPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                  alert={activeAlert}
                  linkedObligation={linkedObligation}
                />
              ) : view === "funds" ? (
                <FundsPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                />
              ) : view === "loans" ? (
                <LoansPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                />
              ) : view === "expenses" ? (
                <ExpensesPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                />
              ) : view === "notifications" && user ? (
                <NotificationsPanel
                  mode="inbox"
                  key={business.id + user.id}
                  business={business}
                  uid={user.id}
                  navigate={navigate}
                  onChange={() => void updateInbox()}
                />
              ) : view === "overview" ? (
                <DashboardPanel
                  key={business.id}
                  business={business}
                  navigate={navigate}
                />
              ) : view === "settings" ? (
                <div className="settings-panels">
                  <section className="settings-panel">
                    <div>
                      <h2>Business profile</h2>
                      <p className="muted">
                        Currency, opening balance, and working days.
                      </p>
                    </div>
                    <Card className="card">
                      <p>{business.name}</p>
                      <p className="muted">{business.description}</p>
                      <dl>
                        <dt>Currency</dt>
                        <dd>{business.currency}</dd>
                        <dt>Timezone</dt>
                        <dd>{business.timezone}</dd>
                        <dt>Working days</dt>
                        <dd>
                          {business.business_days
                            .map((day) => days[day])
                            .join(", ")}
                        </dd>
                        <dt>Opening balance</dt>
                        <dd>
                          {money(business.opening_balance, business.currency)}
                        </dd>
                      </dl>
                      {owner && (
                        <Button onClick={() => navigate("edit")}>
                          Edit business
                        </Button>
                      )}
                    </Card>
                  </section>
                  <section className="settings-panel">
                    <div>
                      <h2>Business logo</h2>
                      <p className="muted">
                        Shown beside the active business in the workspace.
                      </p>
                    </div>
                    <Card className="card">
                      {logo && (
                        <img
                          className="large-logo"
                          src={logo}
                          alt="Business logo"
                        />
                      )}
                      {owner ? (
                        <div className="stack">
                          <FileTrigger
                            acceptedFileTypes={[
                              "image/png",
                              "image/jpeg",
                              "image/webp",
                            ]}
                            onSelect={(files) => void upload(files?.[0])}
                          >
                            <Button
                              type="button"
                              secondary
                              disabled={busy || !online}
                            >
                              Upload a logo
                            </Button>
                          </FileTrigger>
                          <small>PNG, JPEG or WebP · up to 500 KB</small>
                        </div>
                      ) : (
                        <p className="muted">
                          Only the owner can change the logo.
                        </p>
                      )}
                    </Card>
                  </section>
                  {user && (
                    <section className="settings-panel">
                      <div>
                        <h2>Notifications</h2>
                        <p className="muted">
                          Choose which reminders you receive for this business.
                        </p>
                      </div>
                      <NotificationsPanel
                        key={business.id + user.id}
                        mode="preferences"
                        business={business}
                        uid={user.id}
                        navigate={navigate}
                        onChange={() => void updateInbox()}
                      />
                    </section>
                  )}
                  {owner && (
                    <section className="settings-panel">
                      <div>
                        <h2>Archive business</h2>
                      </div>
                      <Card className="card">
                        <p className="muted">
                          Hide this business from the active list. Its records
                          are preserved and can be restored.
                        </p>
                        <Button
                          secondary
                          danger
                          disabled={busy}
                          onClick={() => archive(business)}
                        >
                          Archive {business.name}
                        </Button>
                      </Card>
                    </section>
                  )}
                </div>
              ) : view === "members" && owner ? (
                <div className="overview-grid">
                  <Card className="card">
                    <h2>Invite a viewer</h2>
                    <p className="muted">
                      Viewers can read this business. Only you can change its
                      details.
                    </p>
                    <Form
                      validationBehavior="native"
                      className="stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          const result = await command("invite_viewer", {
                            business_id: business.id,
                            email: email.trim().toLowerCase(),
                          });
                          setInviteLink(`${location.origin}/#invite=${result}`);
                          setInvites(await listInvitations(business.id));
                          setEmail("");
                          setMessage(
                            "Invitation created — email not sent. Copy the link and share it with the invited person.",
                          );
                        });
                      }}
                    >
                      <TextField
                        label="Email"
                        type="email"
                        isRequired
                        value={email}
                        maxLength={254}
                        onChange={(nextValue) => setEmail(nextValue)}
                        isDisabled={busy}
                      />
                      <Button disabled={busy || !online}>
                        Create invitation link
                      </Button>
                    </Form>
                    {inviteLink && (
                      <div className="stack">
                        <TextField
                          label="Invitation link"
                          value={inviteLink}
                          isReadOnly
                        />
                        <Button
                          secondary
                          onClick={() =>
                            run(async () => {
                              await navigator.clipboard.writeText(inviteLink);
                              setMessage("Invitation link copied.");
                            })
                          }
                        >
                          Copy link
                        </Button>
                        <small>
                          This link is shown once. Invitations expire after 7
                          days.
                        </small>
                      </div>
                    )}
                    <Notice>
                      Email delivery is not connected. Share the link manually.
                    </Notice>
                  </Card>
                  <Card className="card">
                    <h2>Business members</h2>
                    {members.map((m) => (
                      <div className="member-row" key={m.user_id}>
                        <div>
                          <strong>{m.email}</strong>
                          <small>
                            {m.role === "owner" ? "Admin / Owner" : "Viewer"}
                          </small>
                        </div>
                        {m.role === "viewer" && (
                          <Button
                            secondary
                            disabled={busy}
                            danger
                            onClick={async () => {
                              const accepted = await confirm({
                                title: `Remove access for ${m.email}?`,
                                description:
                                  "This person will lose access to the business and its records.",
                                action: "Remove access",
                                danger: true,
                                perform: async () => {
                                  await command("remove_viewer", {
                                    business_id: business.id,
                                    user_id: m.user_id,
                                  });
                                },
                              });
                              if (accepted === null) return;
                              setMessage("Viewer access removed.");
                              try {
                                setMembers(await listMembers(business.id));
                              } catch (err) {
                                setError(readableError(err));
                              }
                            }}
                          >
                            Remove access
                          </Button>
                        )}
                      </div>
                    ))}
                  </Card>
                  <Card className="card wide">
                    <h2>Invitations</h2>
                    {invites.length ? (
                      invites.map((i) => (
                        <div className="member-row" key={i.id}>
                          <div>
                            <strong>{i.email}</strong>
                            <small>
                              Expires{" "}
                              {new Date(i.expires_at).toLocaleDateString()}
                            </small>
                          </div>
                          <Badge
                            variant={
                              invitationStatus(i) === "Pending"
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {invitationStatus(i)}
                          </Badge>
                          {invitationStatus(i) === "Pending" && (
                            <Button
                              secondary
                              disabled={busy}
                              onClick={() =>
                                run(async () => {
                                  await command("revoke_invitation", {
                                    business_id: business.id,
                                    invitation_id: i.id,
                                  });
                                  setInvites(
                                    await listInvitations(business.id),
                                  );
                                  setInviteLink("");
                                  setMessage("Invitation revoked.");
                                })
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="muted">No invitations yet.</p>
                    )}
                  </Card>
                </div>
              ) : (
                <Notice>Only the owner can manage access.</Notice>
              )}
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavigationButton({ onClick, ...props }: VipButtonProps) {
  const { setMobileOpen } = useSidebar();
  return (
    <VipButton
      variant="ghost"
      {...props}
      type="button"
      onClick={(event) => {
        setMobileOpen(false);
        onClick?.(event);
      }}
    />
  );
}
