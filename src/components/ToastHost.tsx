import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useUi, type ToastMessage } from "../state/ui";

function Toast({ toast }: { toast: ToastMessage }) {
  const dismiss = useUi((state) => state.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), 6000);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id]);

  const color =
    toast.level === "error"
      ? "border-[var(--error)]/40 bg-[var(--error-soft)] text-[var(--error)]"
      : toast.level === "warning"
        ? "border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)]"
        : toast.level === "success"
          ? "border-[var(--success)]/40 bg-[var(--success-soft)] text-[var(--success)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]";

  const Icon =
    toast.level === "error"
      ? AlertCircle
      : toast.level === "warning"
        ? AlertTriangle
        : toast.level === "success"
          ? CheckCircle2
          : Info;

  return (
    <div
      className={`mb-2 flex max-w-[360px] items-start gap-2 rounded-2xl border px-3.5 py-2.5 shadow-[var(--shadow-pop)] ${color}`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-[12px] leading-5">{toast.message}</div>
      <button type="button" onClick={() => dismiss(toast.id)} className="opacity-60">
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useUi((state) => state.toasts);
  return (
    <div className="pointer-events-none fixed bottom-10 right-3 z-[60] flex flex-col items-end">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
}
