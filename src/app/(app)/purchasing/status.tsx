import { Badge } from "@/components/ui";

export type OrderStatus = "open" | "partial" | "received" | "closed" | "cancelled";

const LABELS: Record<OrderStatus, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  open: { label: "Waiting for delivery", tone: "info" },
  partial: { label: "Partially received", tone: "warning" },
  received: { label: "Received", tone: "success" },
  closed: { label: "Closed (short)", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const isWaiting = (status: OrderStatus) => status === "open" || status === "partial";
