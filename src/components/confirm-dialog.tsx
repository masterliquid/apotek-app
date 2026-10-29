"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl"
    >
      <div className="flex gap-4 p-5">
        {destructive && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
        )}
        <div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold">{title}</h2>
          {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
        <Button type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
