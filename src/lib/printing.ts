import "server-only";
import { cookies } from "next/headers";
import type { Tx } from "@/db/client";
import { findActivePrinterByCode } from "@/server/printers";

// Which printer this browser/device uses is remembered in a cookie (a till and a phone can use different printers).
const COOKIE = "apotek_printer";

export async function setDefaultPrinterCookie(code: string) {
  (await cookies()).set(COOKIE, code, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function readDefaultPrinterCode(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

// The device's printer if it is still active, else null (the sale just isn't printed automatically).
export async function defaultPrinterId(tx: Tx, pharmacyId: number): Promise<number | null> {
  const code = await readDefaultPrinterCode();
  if (!code) return null;
  return (await findActivePrinterByCode(tx, pharmacyId, code))?.id ?? null;
}
