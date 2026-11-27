"use client";
import { ButtonLink } from "./vip-ui/button-link";
import { Card } from "./vip-ui/card";
import { Form } from "./vip-ui/form";
import { ThemeSwitch } from "./theme-switch";
import { TextField } from "./vip-ui/text-field";
import { PasswordField } from "./vip-ui/password-field";
import { ToastFeedback } from "./feedback";
import { useEffect, useState, type FormEvent } from "react";
import { client, configured, readableError } from "@/lib/supabase";
import { Button, Notice, SetupNotice } from "./ui";
type Mode = "login" | "signup" | "forgot" | "reset";
export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login"),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    const m = new URLSearchParams(location.search).get("mode");
    if (["signup", "forgot", "reset"].includes(m || "")) setMode(m as Mode);
    if (new URLSearchParams(location.hash.slice(1)).has("error_description"))
      setError("This email link is invalid or expired. Request a new one.");
    if (!configured) {
      setReady(true);
      return;
    }
    const s = client();
    s.auth.getSession().then(({ data, error }) => {
      if (error) setError(readableError(error));
      setSessionReady(!!data.session);
      setReady(true);
    });
    const { data } = s.auth.onAuthStateChange((event, session) => {
      setSessionReady(!!session);
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email") || "").trim(),
      password = String(f.get("password") || "");
    try {
      if (!navigator.onLine) throw new Error("offline");
      const s = client();
      let err;
      if (mode === "login") {
        ({ error: err } = await s.auth.signInWithPassword({ email, password }));
        if (err) throw err;
        location.assign("/");
        return;
      }
      if (mode === "signup") {
        ({ error: err } = await s.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin + "/auth/" },
        }));
        if (err) throw err;
        setMessage(
          "Check your email to verify your account. If you already have an account, sign in or reset your password.",
        );
      }
      if (mode === "forgot") {
        ({ error: err } = await s.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/auth/?mode=reset",
        }));
        if (err) throw err;
        setMessage(
          "If an account exists for this email, a password reset link will be sent.",
        );
      }
      if (mode === "reset") {
        if (!sessionReady) throw new Error("invalid link");
        ({ error: err } = await s.auth.updateUser({ password }));
        if (err) throw err;
        setMessage("Password updated. You can open your workspace.");
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  if (!configured)
    return (
      <main className="auth-screen">
        <div className="auth-theme">
          <ThemeSwitch />
        </div>
        <SetupNotice />
      </main>
    );
  return (
    <main className="auth-screen">
      <div className="auth-theme">
        <ThemeSwitch />
      </div>
      <Card className="auth-card">
        <div className="wordmark">
          ƒ <span>FlowLedger.</span>
        </div>
        <h1>
          {
            {
              login: "Welcome back",
              signup: "Create your account",
              forgot: "Reset your password",
              reset: "Choose a new password",
            }[mode]
          }
        </h1>
        <p className="muted">
          {mode === "signup"
            ? "Start with your first business."
            : mode === "login"
              ? "Sign in to your business workspace."
              : "We’ll help you get back into your account."}
        </p>
        <ToastFeedback error={error} message={message} />
        {error && <Notice error>{error}</Notice>}

        {ready && sessionReady && mode !== "reset" ? (
          <>
            <Notice>
              You’re signed in. If you just verified your email, your account is
              ready.
            </Notice>
            <ButtonLink size="lg" href="/">
              Open workspace
            </ButtonLink>
          </>
        ) : (
          <Form validationBehavior="native" onSubmit={submit} className="stack">
            {mode !== "reset" && (
              <TextField
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
                isRequired
                maxLength={254}
                size="lg"
                validationBehavior="native"
              />
            )}
            {mode !== "forgot" && (
              <PasswordField
                name="password"
                label={mode === "reset" ? "New password" : "Password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                description={
                  mode !== "login" ? "Use at least 12 characters." : undefined
                }
                isRequired
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                size="lg"
                validationBehavior="native"
              />
            )}
            {mode === "reset" && ready && !sessionReady && (
              <Notice error>
                Open a valid password reset link from your email first.
              </Notice>
            )}
            <Button
              disabled={busy || !ready || (mode === "reset" && !sessionReady)}
            >
              {busy
                ? "Please wait…"
                : {
                    login: "Sign in",
                    signup: "Create account",
                    forgot: "Send reset link",
                    reset: "Update password",
                  }[mode]}
            </Button>
          </Form>
        )}
        <div className="auth-links">
          <a href="/auth/">Sign in</a>
          <a href="/auth/?mode=signup">Create account</a>
          <a href="/auth/?mode=forgot">Forgot password?</a>
        </div>
      </Card>
    </main>
  );
}
