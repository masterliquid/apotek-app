import { describe, expect, it } from "vitest";
import { can, canManageRole } from "@/server/auth/permissions";
import { verifyLegacySha1 } from "@/server/auth/password";
import { toMoney } from "@/server/money";
import { computeProductPrices, nextBaseCostAfterReceipt } from "@/server/pricing";
import { toBaseQty } from "@/server/units";
import { createHash } from "node:crypto";

describe("legacy pricing rule", () => {
  it("buy price = base cost + 10%, recommended = buy price + margin", () => {
    expect(computeProductPrices({ baseCost: "10000", markupPct: "10", marginPct: "20" })).toEqual({
      buyPrice: "11000.00",
      recommendedPrice: "13200.00",
    });
  });

  it("computes recommended price from the unrounded buy price, like the legacy code", () => {
    // 1234.55 * 1.1 = 1358.005 -> stored 1358.01; recommended uses 1358.005 * 1.15 = 1561.70575 -> 1561.71
    expect(computeProductPrices({ baseCost: "1234.55", markupPct: "10", marginPct: "15" })).toEqual({
      buyPrice: "1358.01",
      recommendedPrice: "1561.71",
    });
  });

  it("avoids binary floating point errors", () => {
    expect(toMoney("0.1").toString()).toBe("0.10");
    expect(computeProductPrices({ baseCost: "0.1", markupPct: "0", marginPct: "200" }).recommendedPrice).toBe("0.30");
  });

  it("rejects a negative base cost", () => {
    expect(() => computeProductPrices({ baseCost: "-1", markupPct: "10", marginPct: "0" })).toThrow();
  });

  it("goods receipt only raises base cost, never lowers it", () => {
    expect(nextBaseCostAfterReceipt("1000", "1200")).toBe("1200.00");
    expect(nextBaseCostAfterReceipt("1000", "800")).toBe("1000.00");
  });
});

describe("unit conversion", () => {
  it("converts pack quantities to base units", () => {
    expect(toBaseQty(3, 10)).toBe(30);
    expect(toBaseQty(5, 1)).toBe(5);
  });

  it("rejects fractions, zero and invalid factors", () => {
    expect(() => toBaseQty(1.5, 10)).toThrow();
    expect(() => toBaseQty(0, 10)).toThrow();
    expect(() => toBaseQty(1, 0)).toThrow();
  });
});

describe("role permissions", () => {
  it("cashier can sell but cannot see costs, profit, or manage users", () => {
    expect(can("cashier", "sales.sell")).toBe(true);
    expect(can("cashier", "costs.view")).toBe(false);
    expect(can("cashier", "reports.profit")).toBe(false);
    expect(can("cashier", "users.manage")).toBe(false);
    expect(can("cashier", "sales.return")).toBe(false);
  });

  it("pharmacist can purchase and adjust stock but not commit an opname or edit prices", () => {
    expect(can("pharmacist", "purchasing.manage")).toBe(true);
    expect(can("pharmacist", "inventory.adjust")).toBe(true);
    expect(can("pharmacist", "inventory.commit_opname")).toBe(false);
    expect(can("pharmacist", "products.edit_prices")).toBe(false);
  });

  it("admin manages everyone except owners; owner manages all", () => {
    expect(canManageRole("admin", "cashier")).toBe(true);
    expect(canManageRole("admin", "admin")).toBe(true);
    expect(canManageRole("admin", "owner")).toBe(false);
    expect(canManageRole("owner", "owner")).toBe(true);
    expect(canManageRole("pharmacist", "cashier")).toBe(false);
  });
});

describe("legacy password hash", () => {
  it("verifies sha1(salt + password) as produced by PHP sha1()", () => {
    const salt = "5f1a2b3c4d5e6.12345678";
    const stored = createHash("sha1").update(salt + "rahasia123").digest("hex");
    expect(verifyLegacySha1("rahasia123", salt, stored)).toBe(true);
    expect(verifyLegacySha1("rahasia124", salt, stored)).toBe(false);
  });
});
