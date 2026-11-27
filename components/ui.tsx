import { Card } from "./vip-ui/card";
import {
  Button as VipButton,
  type ButtonProps as VipButtonProps,
} from "./vip-ui/button";
import type { ReactNode } from "react";
export function Button({
  secondary = false,
  danger = false,
  className = "",
  disabled,
  type = "submit",
  size = "lg",
  ...props
}: Omit<VipButtonProps, "isDisabled" | "variant" | "className"> & {
  disabled?: boolean;
  className?: string;
  secondary?: boolean;
  danger?: boolean;
}) {
  const variant = danger
    ? secondary
      ? "outline"
      : "destructive"
    : secondary
      ? "secondary"
      : "default";
  return (
    <VipButton
      {...props}
      type={type}
      size={size}
      isDisabled={disabled}
      variant={variant}
      className={`flow-button${secondary && danger ? " flow-button-danger-outline" : ""} ${className}`}
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
    <Card className="auth-card">
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
    </Card>
  );
}
