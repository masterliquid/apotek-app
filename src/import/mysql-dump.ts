// Reads the INSERT statements of a phpMyAdmin / mysqldump file into plain rows. Every value stays a string (or null):
// money such as '1375000.00' must not pass through a JavaScript number.
export type DumpRow = Record<string, string | null>;
export type ParsedDump = Map<string, DumpRow[]>;

const ESCAPES: Record<string, string> = { "0": "\0", n: "\n", r: "\r", t: "\t", b: "\b", Z: "\x1a" };

// Reads one value starting at `i`; returns [value, next index].
function readValue(sql: string, i: number): [string | null, number] {
  if (sql[i] === "'") {
    let out = "";
    i += 1;
    for (;;) {
      const ch = sql[i];
      if (ch === undefined) throw new Error("Unterminated string in SQL dump");
      if (ch === "\\") {
        const next = sql[i + 1];
        out += ESCAPES[next] ?? next; // \' \" \\ and anything else map to the character itself
        i += 2;
      } else if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 2;
        } else return [out, i + 1];
      } else {
        out += ch;
        i += 1;
      }
    }
  }
  let end = i;
  while (end < sql.length && sql[end] !== "," && sql[end] !== ")") end += 1;
  const raw = sql.slice(i, end).trim();
  return [raw.toUpperCase() === "NULL" ? null : raw, end];
}

const skipSpaces = (sql: string, i: number) => {
  while (i < sql.length && /\s/.test(sql[i])) i += 1;
  return i;
};

export function parseMysqlDump(sql: string): ParsedDump {
  const tables: ParsedDump = new Map();
  const header = /INSERT INTO `(\w+)` \(([^)]*)\) VALUES\s*/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(sql))) {
    const table = match[1];
    const columns = match[2].split(",").map((c) => c.trim().replace(/`/g, ""));
    const rows = tables.get(table) ?? [];
    let i = header.lastIndex;
    for (;;) {
      i = skipSpaces(sql, i);
      if (sql[i] !== "(") throw new Error(`Expected "(" in INSERT for ${table} near position ${i}`);
      i += 1;
      const values: (string | null)[] = [];
      for (;;) {
        i = skipSpaces(sql, i);
        const [value, next] = readValue(sql, i);
        values.push(value);
        i = skipSpaces(sql, next);
        if (sql[i] === ",") i += 1;
        else if (sql[i] === ")") {
          i += 1;
          break;
        } else throw new Error(`Unexpected "${sql[i]}" in a row of ${table}`);
      }
      if (values.length !== columns.length) throw new Error(`A row of ${table} has ${values.length} values but ${columns.length} columns`);
      rows.push(Object.fromEntries(columns.map((c, k) => [c, values[k]])));
      i = skipSpaces(sql, i);
      if (sql[i] === ",") i += 1;
      else break; // ";" ends the statement
    }
    tables.set(table, rows);
    header.lastIndex = i;
  }
  return tables;
}
