import { describe, expect, it } from "vitest";
import { parseMysqlDump } from "@/import/mysql-dump";

describe("MySQL dump parser", () => {
  it("reads rows, keeps numbers as exact strings and understands NULL", () => {
    const sql = "INSERT INTO `t1` (`ID`, `NAME`, `PRICE`, `NOTE`) VALUES\n(1, 'Paracetamol', '1375000.00', NULL),\n(2, 'Amoxicillin', '0.50', 'ok');\n";
    expect(parseMysqlDump(sql).get("t1")).toEqual([
      { ID: "1", NAME: "Paracetamol", PRICE: "1375000.00", NOTE: null },
      { ID: "2", NAME: "Amoxicillin", PRICE: "0.50", NOTE: "ok" },
    ]);
  });

  it("handles quotes, backslash escapes, commas and parentheses inside strings", () => {
    const sql = "INSERT INTO `t` (`A`, `B`) VALUES (1, 'it\\'s a \"test\", (really)\\nline2'), (2, 'O''Brien\\\\x');";
    expect(parseMysqlDump(sql).get("t")).toEqual([
      { A: "1", B: 'it\'s a "test", (really)\nline2' },
      { A: "2", B: "O'Brien\\x" },
    ]);
  });

  it("joins several INSERT statements of one table and keeps tables apart", () => {
    const sql = "INSERT INTO `a` (`X`) VALUES (1);\nINSERT INTO `b` (`Y`) VALUES ('p');\nINSERT INTO `a` (`X`) VALUES (2),(3);";
    const parsed = parseMysqlDump(sql);
    expect(parsed.get("a")?.map((r) => r.X)).toEqual(["1", "2", "3"]);
    expect(parsed.get("b")).toEqual([{ Y: "p" }]);
  });

  it("reports a malformed dump instead of guessing", () => {
    expect(() => parseMysqlDump("INSERT INTO `a` (`X`, `Y`) VALUES (1);")).toThrow(/1 values but 2 columns/);
    expect(() => parseMysqlDump("INSERT INTO `a` (`X`) VALUES ('open")).toThrow(/Unterminated/);
  });
});
