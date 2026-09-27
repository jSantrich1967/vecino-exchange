/**
 * Tasas en vivo — SOLO servidor.
 *
 * Fuentes verificadas 2026-09-27:
 *  - Binance P2P: POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
 *      tradeType "BUY"  -> anunciantes VENDEN USDT -> precio que PAGAMOS por comprar USDT
 *      tradeType "SELL" -> anunciantes COMPRAN USDT -> precio que RECIBIMOS al vender USDT
 *      (el campo adv.tradeType es el lado del anunciante, opuesto al de búsqueda)
 *  - DolarAPI: GET https://ve.dolarapi.com/v1/dolares/oficial   -> .promedio (BCV)
 *              GET https://ve.dolarapi.com/v1/dolares/paralelo  -> .promedio
 *
 * Cadena de respaldo: en vivo -> último snapshot en BD -> overrides manuales del admin.
 * Nunca se inventan números: si todo falla, se devuelven nulls con stale:true.
 */
import { supabaseAdmin } from "./supabase/server";

export type Rates = {
  /** BCV oficial, Bs por USD */
  oficial: number | null;
  /** Paralelo, Bs por USD */
  paralelo: number | null;
  /** Lo que PAGAS por comprar 1 USDT en Binance P2P (mejor precio de compra) */
  usdt_buy_ves: number | null;
  /** Lo que TE DAN por vender 1 USDT en Binance P2P (mejor precio de venta) */
  usdt_sell_ves: number | null;
  updated_at: string | null;
  /** true si ningún dato vino en vivo */
  stale: boolean;
  live: { oficial: boolean; paralelo: boolean; usdt: boolean };
};

const BINANCE_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const DOLARAPI_OFICIAL = "https://ve.dolarapi.com/v1/dolares/oficial";
const DOLARAPI_PARALELO = "https://ve.dolarapi.com/v1/dolares/paralelo";

let cache: { at: number; rates: Rates } | null = null;
const CACHE_MS = 60_000;

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function binanceBest(side: "BUY" | "SELL"): Promise<number | null> {
  const body = {
    fiat: "VES",
    page: 1,
    rows: 5,
    tradeType: side,
    asset: "USDT",
    payTypes: [],
    classifies: ["mass", "profession"],
    tradedWith: false,
  };
  const data = await fetchJson(BINANCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const prices: number[] = (data?.data ?? [])
    .map((a: any) => parseFloat(a?.adv?.price))
    .filter((p: number) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return null;
  // Comprando USDT (side BUY): queremos pagar lo MENOS posible.
  // Vendiendo USDT (side SELL): queremos recibir lo MÁS posible.
  return side === "BUY" ? Math.min(...prices) : Math.max(...prices);
}

async function dolarApiPromedio(url: string): Promise<number | null> {
  const data = await fetchJson(url);
  const v = parseFloat(data?.promedio);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function readSnapshots(): Promise<Record<string, { buy: number | null; sell: number | null; at: string }>> {
  const admin = supabaseAdmin();
  if (!admin) return {};
  const { data } = await admin
    .from("rate_snapshots")
    .select("source, buy_ves, sell_ves, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(12);
  const out: Record<string, { buy: number | null; sell: number | null; at: string }> = {};
  for (const row of data ?? []) {
    if (!out[row.source]) {
      out[row.source] = {
        buy: row.buy_ves != null ? Number(row.buy_ves) : null,
        sell: row.sell_ves != null ? Number(row.sell_ves) : null,
        at: row.fetched_at,
      };
    }
  }
  return out;
}

async function readOverrides(): Promise<Record<string, number | null>> {
  const admin = supabaseAdmin();
  if (!admin) return {};
  const { data } = await admin.from("settings").select("key, value");
  const get = (k: string): number | null => {
    const v = data?.find((r) => r.key === k)?.value?.trim();
    if (!v) return null;
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    oficial: get("manual_oficial"),
    paralelo: get("manual_paralelo"),
    usdt_buy: get("manual_usdt_buy_ves"),
    usdt_sell: get("manual_usdt_sell_ves"),
  };
}

export async function getRates(): Promise<Rates> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rates;

  const [oficialR, paraleloR, buyR, sellR] = await Promise.allSettled([
    dolarApiPromedio(DOLARAPI_OFICIAL),
    dolarApiPromedio(DOLARAPI_PARALELO),
    binanceBest("BUY"),
    binanceBest("SELL"),
  ]);

  const liveOficial = oficialR.status === "fulfilled" ? oficialR.value : null;
  const liveParalelo = paraleloR.status === "fulfilled" ? paraleloR.value : null;
  const liveBuy = buyR.status === "fulfilled" ? buyR.value : null;
  const liveSell = sellR.status === "fulfilled" ? sellR.value : null;
  const anyLive = liveOficial != null || liveParalelo != null || liveBuy != null || liveSell != null;

  // Guardar snapshot de lo que sí llegó en vivo
  const admin = supabaseAdmin();
  if (admin && anyLive) {
    const now = new Date().toISOString();
    const rows = [];
    if (liveOficial != null) rows.push({ source: "oficial", buy_ves: liveOficial, sell_ves: liveOficial, fetched_at: now });
    if (liveParalelo != null) rows.push({ source: "paralelo", buy_ves: liveParalelo, sell_ves: liveParalelo, fetched_at: now });
    if (liveBuy != null || liveSell != null)
      rows.push({ source: "usdt", buy_ves: liveBuy, sell_ves: liveSell, fetched_at: now });
    if (rows.length > 0) await admin.from("rate_snapshots").insert(rows);
  }

  const snaps = anyLive ? {} : await readSnapshots();
  const overrides = anyLive ? {} : await readOverrides();

  const pick = (
    live: number | null,
    snapBuy: number | null | undefined,
    snapSell: number | null | undefined,
    override: number | null | undefined,
    useSell = false
  ): number | null => {
    if (live != null) return live;
    const s = useSell ? snapSell : snapBuy;
    if (s != null) return s;
    return override ?? null;
  };

  const rates: Rates = {
    oficial: pick(liveOficial, snaps.oficial?.buy, snaps.oficial?.sell, overrides.oficial),
    paralelo: pick(liveParalelo, snaps.paralelo?.buy, snaps.paralelo?.sell, overrides.paralelo),
    usdt_buy_ves: pick(liveBuy, snaps.usdt?.buy, snaps.usdt?.sell, overrides.usdt_buy),
    usdt_sell_ves: pick(liveSell, snaps.usdt?.buy, snaps.usdt?.sell, overrides.usdt_sell, true),
    updated_at: anyLive
      ? new Date().toISOString()
      : [snaps.oficial?.at, snaps.paralelo?.at, snaps.usdt?.at].filter(Boolean).sort().pop() ?? null,
    stale: !anyLive,
    live: {
      oficial: liveOficial != null,
      paralelo: liveParalelo != null,
      usdt: liveBuy != null || liveSell != null,
    },
  };

  cache = { at: Date.now(), rates };
  return rates;
}

/** Solo para pruebas locales: invalida el caché en memoria. */
export function clearRatesCache() {
  cache = null;
}
