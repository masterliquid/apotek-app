import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

// Shared building blocks. Server-component safe (no hooks). Existing exports keep their
// original props; new props are optional so current call sites keep working unchanged.

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/10 sm:text-sm";

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6", className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-emerald-700 text-white shadow-xs hover:bg-emerald-800 active:bg-emerald-900",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-xs hover:bg-slate-50 active:bg-slate-100",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-base",
};

// Same look as <Button>, for links (<Link className={buttonClass({ variant: "secondary", size: "sm" })}>).
export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx("inline-flex items-center justify-center rounded-lg font-semibold transition-colors", buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

type Tone = "success" | "error" | "warning" | "info";

const noticeStyles: Record<Tone, { box: string; icon: typeof Info }> = {
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertCircle },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = noticeStyles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (success) return <Notice tone="success">{success}</Notice>;
  return null;
}

export function Badge({ tone = "neutral", children, className }: { tone?: Tone | "neutral"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    error: "bg-red-50 text-red-700 ring-red-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div>}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 p-6 text-sm text-slate-500" role="status">
      <Loader2 className="size-4 animate-spin text-emerald-700" aria-hidden="true" />
      {label}
    </p>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const accent = { neutral: "text-slate-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-700" }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={cx("tabular mt-1.5 text-2xl font-semibold tracking-tight", accent)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// Horizontal progress bar (e.g. how much of an order has arrived).
export function ProgressBar({ value, max, label, tone = "success" }: { value: number; max: number; label?: string; tone?: "success" | "warning" }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full transition-all", tone === "success" ? "bg-emerald-600" : "bg-amber-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
