"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  Building2,
  LayoutDashboard,
  Users,
  Archive,
  Settings,
  Plus,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import { client, configured, readableError } from "@/lib/supabase";
import {
  command,
  listBusinesses,
  listInvitations,
  listMembers,
} from "@/lib/api";
import {
  days,
  invitationStatus,
  money,
  validLogo,
  type Business,
  type Invitation,
  type Member,
} from "@/lib/domain";
import { BusinessForm } from "./business-form";
import { Button, Notice, SetupNotice } from "./ui";
import { ExpensesPanel } from "./expenses-panel";
type View =
  | "expenses"
  | "overview"
  | "businesses"
  | "members"
  | "settings"
  | "archived"
  | "create"
  | "edit";
export function Workspace() {
  const [user, setUser] = useState<User | null>(null),
    [businesses, setBusinesses] = useState<Business[]>([]),
    [active, setActive] = useState(""),
    [view, setView] = useState<View>("overview"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [menu, setMenu] = useState(false),
    [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [email, setEmail] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [token, setToken] = useState(""),
    [logo, setLogo] = useState(""),
    [online, setOnline] = useState(true);
  const operationLock = useRef(false),
    generation = useRef(0);
  const business = businesses.find((b) => b.id === active),
    owner = business?.owner_id === user?.id;
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
    setLogo("");
    if (!business) return;
    if (business.logo_path)
      client()
        .storage.from("business-logos")
        .createSignedUrl(business.logo_path, 300)
        .then(({ data }) => {
          if (n === generation.current) setLogo(data?.signedUrl || "");
        });
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
  function navigate(v: View) {
    setView(v);
    setMenu(false);
    setError("");
    setMessage("");
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
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
      setMessage(
        warning
          ? "Logo updated. The previous unused image could not be removed."
          : "Logo updated.",
      );
    });
    e.target.value = "";
  }
  async function archive(b: Business, restore = false) {
    if (
      !confirm(
        `${restore ? "Restore" : "Archive"} “${b.name}”? ${restore ? "It will return to your active businesses." : "Records will be preserved. You can restore it later."}`,
      )
    )
      return;
    await run(async () => {
      await command("archive_business", {
        business_id: b.id,
        archived: !restore,
      });
      await refresh(restore ? b.id : undefined);
      setMessage(restore ? "Business restored." : "Business archived.");
      navigate(restore ? "overview" : "archived");
    });
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
    { id: "expenses", text: "Expenses", icon: LayoutDashboard },
    { id: "overview", text: "Overview", icon: LayoutDashboard },
    { id: "businesses", text: "Businesses", icon: Building2 },
    { id: "members", text: "People & access", icon: Users },
    { id: "settings", text: "Settings", icon: Settings },
    { id: "archived", text: "Archived", icon: Archive },
  ] as const;
  return (
    <div className="workspace">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="wordmark">
          ƒ <span>FlowLedger.</span>
        </div>
        <span className="eyebrow">Your workspace</span>
        <nav>
          {navigation
            .filter((n) => n.id !== "members" || owner)
            .map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                {n.text}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            A little clarity,
            <br />
            every day.
          </p>
          <span>{user?.email}</span>
          <button
            onClick={() =>
              run(async () => {
                const { error } = await client().auth.signOut();
                if (error) throw error;
              })
            }
            disabled={busy}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <div className="business-picker">
            <div className="mini-logo">
              {logo ? (
                <img src={logo} alt="Business logo" />
              ) : (
                <Building2 size={22} />
              )}
            </div>
            <label>
              <span className="eyebrow">Your business</span>
              <select
                aria-label="Active business"
                value={active}
                onChange={(e) => {
                  setActive(e.target.value);
                  navigate("overview");
                }}
                disabled={busy}
              >
                <option value="" disabled>
                  Select business
                </option>
                {businesses
                  .filter((b) => !b.archived_at)
                  .map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <Button secondary onClick={() => navigate("create")} disabled={busy}>
            <Plus size={18} />
            Business
          </Button>
        </header>
        <div className="content">
          {!online && (
            <Notice error>
              You’re offline. Reconnect before changing any records.
            </Notice>
          )}
          {error && (
            <Notice error>
              {error}{" "}
              <button
                className="text-link"
                onClick={() => run(() => refresh())}
              >
                Refresh
              </button>
            </Notice>
          )}
          {message && <Notice>{message}</Notice>}
          {token && (
            <section className="card invitation-banner">
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
            </section>
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
              <div className="page-heading">
                <div>
                  <span className="eyebrow">Your money, in focus</span>
                  <h1>
                    {
                      {
                        overview: "Business overview",
                        expenses: "Expenses & categories",
                        businesses: "Your businesses",
                        members: "People & access",
                        settings: "Business settings",
                        archived: "Archived businesses",
                      }[view]
                    }
                  </h1>
                  <p className="muted">
                    {business && view === "overview"
                      ? `${business.name} · A clearer view of what’s ahead.`
                      : "A workspace that grows with your business."}
                  </p>
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
                      <article className="card" key={b.id}>
                        <Building2 className="accent" />
                        <h2>{b.name}</h2>
                        <p className="muted">
                          {b.description || "No description added."}
                        </p>
                        <span className="badge">
                          {b.owner_id === user?.id ? "Admin / Owner" : "Viewer"}
                        </span>
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
                            <Button
                              secondary
                              onClick={() => {
                                setActive(b.id);
                                navigate("overview");
                              }}
                            >
                              Open business
                              <ArrowUpRight size={16} />
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                  {!businesses.some((b) =>
                    view === "archived" ? b.archived_at : !b.archived_at,
                  ) && (
                    <section className="card empty">
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
                    </section>
                  )}
                </div>
              ) : !business ? (
                <section className="card empty">
                  <Building2 size={36} />
                  <h2>Your workspace starts here</h2>
                  <p>
                    Create a business, or open an invitation link to join as a
                    viewer.
                  </p>
                  <Button onClick={() => navigate("create")}>
                    Create your first business
                  </Button>
                </section>
              ) : view === "expenses" ? (
                <ExpensesPanel
                  key={business.id}
                  business={business}
                  owner={!!owner}
                />
              ) : view === "overview" ? (
                <>
                  <section className="hero">
                    <div>
                      <span className="eyebrow">Business profile</span>
                      <h2>{business.name}</h2>
                      <p>
                        {business.description ||
                          "Your business workspace is ready."}
                      </p>
                      <span className="badge">
                        {owner ? "Admin / Owner" : "View-only access"}
                      </span>
                    </div>
                    <div className="hero-balance">
                      <span>Opening available funds</span>
                      <strong>
                        {money(business.opening_balance, business.currency)}
                      </strong>
                      <small>
                        Effective {business.balance_date} · {business.timezone}
                      </small>
                    </div>
                  </section>
                  <div className="overview-grid">
                    <section className="card">
                      <div className="section-title">
                        <h2>Working week</h2>
                        <span className="badge">
                          {business.business_days.length} business days
                        </span>
                      </div>
                      <p className="muted">
                        Your collection calendar will use these days.
                      </p>
                      <div className="week">
                        {days.map((d, i) => (
                          <span
                            key={d}
                            className={
                              business.business_days.includes(i)
                                ? "selected"
                                : ""
                            }
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </section>
                    <section className="card">
                      <h2>Contact details</h2>
                      <dl>
                        <dt>Email</dt>
                        <dd>{business.email || "Not added"}</dd>
                        <dt>Phone</dt>
                        <dd>{business.phone || "Not added"}</dd>
                        <dt>Address</dt>
                        <dd>{business.address || "Not added"}</dd>
                      </dl>
                    </section>
                  </div>
                  <section className="card">
                    <h2>Your foundation is ready</h2>
                    <p className="muted">
                      Business setup and access management are available. Manage
                      scheduled expenses from the Expenses menu. Loans,
                      settlements and daily collection targets are coming next.
                    </p>
                    <div className="actions">
                      {owner && (
                        <>
                          <Button secondary onClick={() => navigate("edit")}>
                            Edit business
                          </Button>
                          <Button secondary onClick={() => navigate("members")}>
                            Manage viewers
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                </>
              ) : view === "settings" ? (
                <div className="overview-grid">
                  <section className="card">
                    <h2>{business.name}</h2>
                    <p className="muted">{business.description}</p>
                    <dl>
                      <dt>Currency</dt>
                      <dd>{business.currency}</dd>
                      <dt>Timezone</dt>
                      <dd>{business.timezone}</dd>
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
                  </section>
                  <section className="card">
                    <h2>Business logo</h2>
                    {logo && (
                      <img
                        className="large-logo"
                        src={logo}
                        alt="Business logo"
                      />
                    )}
                    {owner ? (
                      <label>
                        Upload a logo
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={busy || !online}
                          onChange={upload}
                        />
                        <small>PNG, JPEG or WebP · up to 500 KB</small>
                      </label>
                    ) : (
                      <p className="muted">
                        Only the owner can change the logo.
                      </p>
                    )}
                  </section>
                  {owner && (
                    <section className="card">
                      <h2>Archive business</h2>
                      <p className="muted">
                        Hide this business from the active list. Its records are
                        preserved and can be restored.
                      </p>
                      <Button
                        secondary
                        disabled={busy}
                        onClick={() => archive(business)}
                      >
                        Archive {business.name}
                      </Button>
                    </section>
                  )}
                </div>
              ) : view === "members" && owner ? (
                <div className="overview-grid">
                  <section className="card">
                    <h2>Invite a viewer</h2>
                    <p className="muted">
                      Viewers can read this business. Only you can change its
                      details.
                    </p>
                    <form
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
                      <label>
                        Email
                        <input
                          type="email"
                          required
                          value={email}
                          maxLength={254}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>
                      <Button disabled={busy || !online}>
                        Create invitation link
                      </Button>
                    </form>
                    {inviteLink && (
                      <div className="stack">
                        <label>
                          Invitation link
                          <input
                            value={inviteLink}
                            readOnly
                            onFocus={(e) => e.target.select()}
                          />
                        </label>
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
                  </section>
                  <section className="card">
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
                            onClick={() => {
                              if (confirm(`Remove access for ${m.email}?`))
                                run(async () => {
                                  await command("remove_viewer", {
                                    business_id: business.id,
                                    user_id: m.user_id,
                                  });
                                  setMembers(await listMembers(business.id));
                                  setMessage("Viewer access removed.");
                                });
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </section>
                  <section className="card wide">
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
                          <span className="badge">{invitationStatus(i)}</span>
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
                  </section>
                </div>
              ) : (
                <Notice>Only the owner can manage access.</Notice>
              )}
            </>
          )}
          <footer>
            FlowLedger · A little clarity, every day.
            <span>Phase 2A · {business?.currency || "LKR"}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
