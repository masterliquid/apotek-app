import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Same rule as createPrinter: the name is passed to `lp -d`, so only plain characters.
export const OS_PRINTER_NAME_RE = /^[\w .()-]{1,100}$/;

export type OsPrinterDiscovery = { names: string[]; note: string | null };

// Parses `lpstat -p` (CUPS on macOS/Linux). Ignores names that would be rejected when saving a printer.
export function parseLpstatPrinters(stdout: string): string[] {
  const names = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^printer\s+(.+?)\s+(?:is|now|disabled|unknown)\b/i.exec(line.trim());
    const name = match?.[1]?.trim() ?? "";
    if (OS_PRINTER_NAME_RE.test(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function listOsPrinters(): Promise<OsPrinterDiscovery> {
  if (process.platform === "win32") {
    return { names: [], note: "Listing Windows printers is not supported yet. Use a network (IP) printer, or the browser print page." };
  }
  try {
    const { stdout } = await execFileAsync("lpstat", ["-p"], { timeout: 5_000, encoding: "utf8" });
    return discoveryFromLpstat(stdout);
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    const names = parseLpstatPrinters(stdout);
    if (names.length > 0) return { names, note: null };
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const dockerHint = code === "ENOENT";
    return {
      names: [],
      note: dockerHint
        ? "Could not list printers (CUPS `lpstat` is not available — typical inside Docker). Network printers still work. For an installed printer, run the app and print worker on the host."
        : "Could not list printers on this computer. You can still type the printer name exactly as the system shows it, or use a network printer.",
    };
  }
}

function discoveryFromLpstat(stdout: string): OsPrinterDiscovery {
  const names = parseLpstatPrinters(stdout);
  if (names.length === 0) {
    return {
      names: [],
      note: "No printers are installed on this computer. Add one in the system printer settings, then scan again. If the app is running in Docker it cannot see USB printers — run `pnpm dev` and `pnpm worker` on the host.",
    };
  }
  return { names, note: null };
}
