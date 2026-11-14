import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  secondary = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      {...props}
      className={`${secondary ? "button secondary" : "button"} ${className}`}
    />
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
    </div>
  );
}
export function SetupNotice() {
  return (
    <div className="auth-card">
      <div className="wordmark">
        ƒ <span>FlowLedger</span>
      </div>
      <h1>Connect your workspace</h1>
      <p>
        The application is ready for Supabase configuration. Add your project
        URL and publishable key to <code>.env.local</code>, apply the supplied
        database migration, then restart or rebuild.
      </p>
      <Notice>No demo records or local business storage are used.</Notice>
    </div>
  );
}
