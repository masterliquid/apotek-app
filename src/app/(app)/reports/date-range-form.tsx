import { PrintButton } from "./print-button";

export function DateRangeForm({ from, to }: { from: string; to: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
      <label>From<input type="date" name="from" defaultValue={from} className="mt-1 block rounded-md border border-slate-300 px-3 py-2" /></label>
      <label>To<input type="date" name="to" defaultValue={to} className="mt-1 block rounded-md border border-slate-300 px-3 py-2" /></label>
      <button className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">Show</button>
      <PrintButton />
    </form>
  );
}
