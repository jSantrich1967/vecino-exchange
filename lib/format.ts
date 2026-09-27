export function fmtVES(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "hace 3 min", "hace 1 h", "ayer"... */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "sin datos";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "ahora mismo";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export const PAY_METHODS = ["Zelle", "Efectivo", "Binance", "Transferencia"] as const;

export const TRADE_STEPS = [
  "Solicitud",
  "Comprador paga",
  "Vendedor entrega",
  "Custodia confirmada",
  "Liberado",
] as const;

export const TRADE_STATUS_LABEL: Record<string, string> = {
  requested: "Solicitada",
  awaiting_buyer: "Esperando pago del comprador",
  awaiting_seller: "Esperando entrega del vendedor",
  in_escrow: "En custodia",
  released: "Liberada",
  cancelled: "Cancelada",
  disputed: "En disputa",
};

export function tradeStepIndex(status: string): number {
  switch (status) {
    case "requested":
      return 0;
    case "awaiting_buyer":
      return 1;
    case "awaiting_seller":
      return 2;
    case "in_escrow":
      return 3;
    case "released":
      return 4;
    default:
      return -1;
  }
}
