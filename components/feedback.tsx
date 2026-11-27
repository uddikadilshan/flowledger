"use client";
import { TextArea } from "./vip-ui/text-area";
import { Form } from "./vip-ui/form";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TriangleAlert } from "lucide-react";
import { DialogContent } from "./vip-ui/dialog";
import { showToast, toastQueue, ToastViewport } from "./vip-ui/toast";
import { readableError } from "@/lib/supabase";
import { Button } from "./ui";

type Tone = "success" | "warning" | "error";
type Confirmation = {
  title: string;
  description: string;
  action: string;
  danger?: boolean;
  reason?: boolean;
  perform?: (reason: string) => Promise<void>;
};
const FeedbackContext = createContext<{
  notify: (tone: Tone, message: string) => void;
  confirm: (options: Confirmation) => Promise<string | null>;
} | null>(null);

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("FeedbackProvider is missing.");
  return context;
}

const titles = {
  success: "Success",
  warning: "Attention",
  error: "Action needed",
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const [failure, setFailure] = useState("");
  const pending = useRef<((value: string | null) => void) | null>(null);
  const activeMessages = useRef(new Map<string, string>());
  const title = useId();
  const description = useId();
  const notify = useCallback((tone: Tone, message: string) => {
    const key = tone + ":" + message;
    if (activeMessages.current.has(key)) return;
    if (activeMessages.current.size >= 4) {
      const oldest = activeMessages.current.values().next().value;
      if (oldest) toastQueue.close(oldest);
    }
    const id = showToast(
      { title: titles[tone], description: message, variant: tone },
      {
        timeout: tone === "success" ? 6000 : 0,
        onClose: () => activeMessages.current.delete(key),
      },
    );
    activeMessages.current.set(key, id);
  }, []);
  const confirm = useCallback(
    (options: Confirmation) =>
      new Promise<string | null>((resolve) => {
        if (pending.current) {
          resolve(null);
          return;
        }
        pending.current = resolve;
        setReason("");
        setFailure("");
        setConfirmation(options);
      }),
    [],
  );
  function finish(value: string | null) {
    pending.current?.(value);
    pending.current = null;
    setConfirmation(null);
  }
  async function submit() {
    if (!confirmation || busy.current) return;
    const detail = reason.trim();
    if (confirmation.reason && !detail) return;
    busy.current = true;
    setWorking(true);
    setFailure("");
    try {
      if (confirmation.perform) {
        if (!navigator.onLine) throw new Error("offline");
        await confirmation.perform(detail);
      }
      finish(detail);
    } catch (err) {
      setFailure(readableError(err));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <ToastViewport />
      <DialogContent
        role="alertdialog"
        aria-labelledby={title}
        aria-describedby={description}
        overlayProps={{
          isOpen: confirmation !== null,
          isKeyboardDismissDisabled: working,
          onOpenChange: (open) => {
            if (!open && !busy.current) finish(null);
          },
        }}
      >
        {confirmation && (
          <Form
            validationBehavior="native"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div
              className={
                confirmation.danger
                  ? "confirmation-icon danger-ink"
                  : "confirmation-icon"
              }
            >
              <TriangleAlert size={23} aria-hidden />
            </div>
            <h2 id={title}>{confirmation.title}</h2>
            <p id={description}>{confirmation.description}</p>
            {confirmation.reason && (
              <TextArea
                label="Reason"
                isDisabled={working}
                isRequired
                maxLength={500}
                rows={3}
                value={reason}
                onChange={setReason}
              />
            )}
            {failure && (
              <p role="alert" className="confirmation-error">
                {failure}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                secondary
                autoFocus
                disabled={working}
                onClick={() => finish(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                danger={confirmation.danger}
                disabled={working || (confirmation.reason && !reason.trim())}
              >
                {working ? "Working…" : confirmation.action}
              </Button>
            </div>
          </Form>
        )}
      </DialogContent>
    </FeedbackContext.Provider>
  );
}

export function ToastFeedback({
  error,
  message,
  warning,
}: {
  error?: string;
  message?: string;
  warning?: string;
}) {
  const { notify } = useFeedback();
  useEffect(() => {
    if (error) notify("error", error);
  }, [error, notify]);
  useEffect(() => {
    if (message) notify("success", message);
  }, [message, notify]);
  useEffect(() => {
    if (warning) notify("warning", warning);
  }, [warning, notify]);
  return null;
}
