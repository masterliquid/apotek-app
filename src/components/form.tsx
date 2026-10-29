"use client";

import { AlertCircle } from "lucide-react";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Button, Notice, cx, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form";

const FormContext = createContext<{ state: FormState; pending: boolean }>({ state: {}, pending: false });

// A form that does NOT wipe what the user typed when the server says no.
// React 19 clears a <form action={fn}> after the action finishes, even when it failed. Here the action is called
// manually from onSubmit instead, so every field keeps its value; the form is only cleared after a success
// (set resetOnSuccess={false} for settings-style forms). Field errors from the server show under the field.
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormContext.Provider value={{ state, pending }}>
      <form
        ref={formRef}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          // The submitter is included so buttons like <button name="intent" value="commit"> keep working.
          const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
          startTransition(() => dispatch(data));
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function useFormState() {
  return useContext(FormContext);
}

export function Field({
  label,
  name,
  hint,
  error,
  className,
  ...props
}: { label: string; name: string; hint?: string; error?: string } & ComponentProps<"input">) {
  const { state } = useContext(FormContext);
  const message = error ?? state.fieldErrors?.[name];
  const describedBy = message ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">
        {label}
        {props.required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </span>
      <input name={name} aria-invalid={message ? true : undefined} aria-describedby={describedBy} className={cx(inputClass, className)} {...props} />
      {message ? (
        <span id={`${name}-error`} className="mt-1 flex items-center gap-1 text-xs text-red-700">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {message}
        </span>
      ) : hint ? (
        <span id={`${name}-hint`} className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  hint,
  error,
  children,
  className,
  ...props
}: { label: string; name: string; hint?: string; error?: string; children: ReactNode } & ComponentProps<"select">) {
  const { state } = useContext(FormContext);
  const message = error ?? state.fieldErrors?.[name];
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">{label}</span>
      <select name={name} aria-invalid={message ? true : undefined} className={cx(inputClass, "pr-8", className)} {...props}>
        {children}
      </select>
      {message ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-red-700">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {message}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

// General (not field-specific) message from the last submit.
export function FormFeedback({ className }: { className?: string }) {
  const { state } = useContext(FormContext);
  if (state.error) return <Notice tone="error" className={className}>{state.error}</Notice>;
  if (state.success) return <Notice tone="success" className={className}>{state.success}</Notice>;
  return null;
}

export function SubmitButton({ children, pendingLabel, ...props }: { children: ReactNode; pendingLabel?: string } & Omit<ComponentProps<typeof Button>, "type" | "loading">) {
  const { pending } = useContext(FormContext);
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
