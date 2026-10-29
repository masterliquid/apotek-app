import type { Permission } from "@/server/auth/permissions";

// Menu structure. Icons are names (strings) so this can be used from Server Components and mapped to icons in the client shell.
export type NavIcon =
  | "dashboard" | "cart" | "receipt" | "undo" | "pill" | "adjust" | "clipboard" | "truck" | "return" | "supplier" | "payable" | "receivable"
  | "chart" | "customers" | "tag" | "ruler" | "status" | "printer" | "settings" | "users";

export type NavEntry = { label: string; href: string; icon: NavIcon; permission?: Permission };
export type NavGroup = { section: string; items: NavEntry[] };

export const NAV: NavGroup[] = [
  { section: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }] },
  {
    section: "Sales",
    items: [
      { label: "Point of Sale", href: "/pos", icon: "cart", permission: "sales.sell" },
      { label: "Sales history", href: "/sales", icon: "receipt", permission: "sales.sell" },
      { label: "Sales returns", href: "/returns", icon: "undo", permission: "sales.return" },
    ],
  },
  {
    section: "Stock",
    items: [
      { label: "Products", href: "/products", icon: "pill", permission: "products.view" },
      { label: "Adjustments", href: "/inventory/adjustments", icon: "adjust", permission: "inventory.adjust" },
      { label: "Stock opname", href: "/inventory/opname", icon: "clipboard", permission: "inventory.adjust" },
    ],
  },
  {
    section: "Purchasing",
    items: [
      { label: "Purchase orders", href: "/purchasing", icon: "truck", permission: "purchasing.manage" },
      { label: "Purchase returns", href: "/purchase-returns", icon: "return", permission: "purchasing.manage" },
      { label: "Suppliers", href: "/master/suppliers", icon: "supplier", permission: "partners.manage" },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Payables", href: "/debts/payables", icon: "payable", permission: "debts.view" },
      { label: "Receivables", href: "/debts/receivables", icon: "receivable", permission: "debts.view" },
      { label: "Reports", href: "/reports", icon: "chart", permission: "reports.sales_own" },
    ],
  },
  {
    section: "Data",
    items: [
      { label: "Customers", href: "/master/customers", icon: "customers", permission: "customers.create" },
      { label: "Categories", href: "/master/categories", icon: "tag", permission: "products.edit_details" },
      { label: "Units", href: "/master/units", icon: "ruler", permission: "products.edit_details" },
      { label: "Statuses", href: "/master/statuses", icon: "status", permission: "products.edit_details" },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Printers", href: "/settings/printers", icon: "printer", permission: "sales.sell" },
      { label: "Pharmacy", href: "/settings/pharmacy", icon: "settings", permission: "settings.manage" },
      { label: "Users", href: "/users", icon: "users", permission: "users.manage" },
    ],
  },
];
