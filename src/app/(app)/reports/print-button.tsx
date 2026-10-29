"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 print:hidden">
      Print / save as PDF
    </button>
  );
}
