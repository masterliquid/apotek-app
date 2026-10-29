// Role permissions per pharmacy. Matches the matrix in _audit/PHASE1_AUDIT_AND_PHASE2_PROPOSAL.md §10.2.
// Every Server Action checks one of these on the server; hiding buttons in the UI is not enough.

export const ROLES = ["owner", "admin", "pharmacist", "cashier"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "sales.sell", // create/commit sales, print and reprint receipts
  "sales.void_own",
  "sales.void_any",
  "sales.return",
  "products.view", // name, sell price, stock
  "products.edit_details", // everything except prices
  "products.edit_prices",
  "costs.view", // base cost, buy price, margin
  "purchasing.manage", // purchase orders, goods receipts, purchase returns
  "inventory.adjust", // stock adjustments, create stock opname
  "inventory.commit_opname",
  "partners.manage", // suppliers and customers
  "customers.create",
  "debts.view",
  "debts.manage",
  "reports.sales_all",
  "reports.sales_own",
  "reports.profit", // profit and stock value
  "users.manage",
  "settings.manage", // pharmacy settings, printers, payment methods
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  admin: ALL,
  pharmacist: [
    "sales.sell",
    "sales.void_own",
    "sales.void_any",
    "sales.return",
    "products.view",
    "products.edit_details",
    "costs.view",
    "purchasing.manage",
    "inventory.adjust",
    "partners.manage",
    "customers.create",
    "debts.view",
    "reports.sales_all",
    "reports.sales_own",
  ],
  cashier: ["sales.sell", "sales.void_own", "products.view", "customers.create", "reports.sales_own"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Owners manage everyone; admins manage everyone except owners; other roles manage no one.
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (!can(actorRole, "users.manage")) return false;
  if (actorRole === "owner") return true;
  return targetRole !== "owner";
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
