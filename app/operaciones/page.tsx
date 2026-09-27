"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  fmtVES,
  fmtUSD,
  timeAgo,
  TRADE_STEPS,
  TRADE_STATUS_LABEL,
  tradeStepIndex,
} from "@/lib/format";

type Trade = {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount_usd: number;
  rate_ves: number;
  fee_pct: number;
  fee_usd: number | null;
  status: string;
  created_at: string;
  buyer_profile?: { full_name: string | null } | null;
  seller_profile?: { full_name: string | null } | null;
};

type TradeEvent = {
  id: string;
  action: string;
  note: string | null;
  created_at: string;
  actor_id: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  created: "Operación creada",
  buyer_paid: "Comprador marcó pago realizado",
  seller_delivered: "Vendedor marcó entrega realizada",
  release: "Administrador liberó fondos",
  cancel: "Operación cancelada",
  dispute: "Problema reportado",
  resolve_escrow: "Disputa resuelta: vuelve a custodia",
  resolve_cancel: "Disputa resuelta: cancelada",
};

function Stepper({ status }: { status: string }) {
  const idx = tradeStepIndex(status);
  if (idx < 0)
    return (
      <p className="text-sm font-semibold text-amber-700">
        ⚠️ {TRADE_STATUS_LABEL[status] ?? status}
      </p>
    );
  return (
    <ol className="space-y-0">
      {TRADE_STEPS.map((label, i) => (
        <li key={label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i < idx
                  ? "bg-emerald-600 text-white"
                  : i === idx
                    ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-600"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < idx ? "✓" : i + 1}
            </div>
            {i < TRADE_STEPS.length - 1 && (
              <div className={`w-0.5 h-5 ${i < idx ? "bg-emerald-600" : "bg-slate-200"}`} />
            )}
          </div>
          <p
            className={`pt-1 text-sm ${i === idx ? "font-bold text-slate-900" : i < idx ? "text-slate-600" : "text-slate-400"}`}
          >
            {label}
            {i === idx && <span className="text-emerald-700"> ← estás aquí</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default function OperacionesPage() {
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [events, setEvents] = useState<Record<string, TradeEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: sess } = await sb.auth.getSession();
    const id = sess.session?.user?.id ?? null;
    setUid(id);
    if (!id) {
      setLoading(false);
      return;
    }
    const { data } = await sb
      .from("trades")
      .select(
        "*, buyer_profile:profiles!trades_buyer_id_fkey(full_name), seller_profile:profiles!trades_seller_id_fkey(full_name)"
      )
      .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
      .order("created_at", { ascending: false });
    const list = (data as Trade[]) ?? [];
    setTrades(list);
    const ev: Record<string, TradeEvent[]> = {};
    for (const t of list) {
      const { data: evData } = await sb
        .from("trade_events")
        .select("*")
        .eq("trade_id", t.id)
        .order("created_at", { ascending: true });
      ev[t.id] = (evData as TradeEvent[]) ?? [];
    }
    setEvents(ev);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(tradeId: string, action: string, confirmMsg?: string, note?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    let finalNote = note;
    if (action === "dispute") {
      finalNote = prompt("Describe el problema (lo verá el administrador):") ?? "";
      if (!finalNote) return;
    }
    setBusy(tradeId + action);
    const { error } = await supabaseBrowser().rpc("advance_trade", {
      p_trade_id: tradeId,
      p_action: action,
      p_note: finalNote ?? null,
    });
    setBusy(null);
    if (error) return alert("No se pudo completar: " + error.message);
    load();
  }

  if (loading) return <p className="text-slate-500 text-sm">Cargando tus operaciones…</p>;
  if (!uid)
    return (
      <div className="card text-center py-8">
        <p className="mb-3">Inicia sesión para ver tus operaciones.</p>
        <button onClick={() => router.push("/login")} className="btn-primary !w-auto px-6">
          Entrar
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis operaciones</h1>

      <div className="card bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-900">
          🔒 <b>Custodia Vecino Exchange:</b> el administrador verifica cada pago
          fuera de la app (capture de Zelle, transferencia de Binance) y lo confirma
          aquí antes de liberar. <b>Nunca entregues sin que la operación esté en custodia confirmada.</b>
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="card text-center text-slate-500 text-sm py-8">
          Aún no tienes operaciones. Ve al <b>Mercado</b> y acepta una oferta. 🤝
        </div>
      ) : (
        trades.map((t) => {
          const isBuyer = t.buyer_id === uid;
          const role = isBuyer ? "Comprador" : "Vendedor";
          const other = isBuyer ? t.seller_profile?.full_name : t.buyer_profile?.full_name;
          const final = ["released", "cancelled"].includes(t.status);
          return (
            <div key={t.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`badge ${t.status === "released" ? "bg-emerald-100 text-emerald-800" : t.status === "disputed" ? "bg-red-100 text-red-800" : t.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}
                  >
                    {TRADE_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <p className="text-xl font-bold mt-1 tabular-nums">
                    {fmtUSD(t.amount_usd)} USD <span className="text-sm font-normal text-slate-500">@ {fmtVES(t.rate_ves)} Bs</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    {role} · con {other ?? "vecino"} · {timeAgo(t.created_at)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Total: {fmtVES(t.amount_usd * t.rate_ves)} Bs · Comisión {t.fee_pct}%
                    {t.fee_usd != null && ` (${fmtUSD(t.fee_usd)} USD)`}
                  </p>
                </div>
              </div>

              {!final && <Stepper status={t.status} />}

              {!final && (
                <div className="space-y-2">
                  {isBuyer && ["requested", "awaiting_buyer"].includes(t.status) && (
                    <button
                      disabled={busy === t.id + "buyer_paid"}
                      onClick={() => act(t.id, "buyer_paid", "¿Confirmas que YA realizaste el pago al vendedor?")}
                      className="btn-primary"
                    >
                      ✅ Ya pagué
                    </button>
                  )}
                  {!isBuyer && t.status === "awaiting_seller" && (
                    <button
                      disabled={busy === t.id + "seller_delivered"}
                      onClick={() => act(t.id, "seller_delivered", "¿Confirmas que YA entregaste los fondos al comprador?")}
                      className="btn-primary"
                    >
                      📤 Ya entregué
                    </button>
                  )}
                  {t.status !== "disputed" && (
                    <button
                      disabled={busy === t.id + "dispute"}
                      onClick={() => act(t.id, "dispute")}
                      className="btn-danger"
                    >
                      ⚠️ Reportar problema
                    </button>
                  )}
                  {t.status === "disputed" && (
                    <p className="text-sm text-red-700 bg-red-50 rounded-xl p-3">
                      El administrador está revisando tu caso. Te contactará por el grupo.
                    </p>
                  )}
                </div>
              )}

              <details className="text-sm">
                <summary className="cursor-pointer text-slate-500 font-medium">Ver historial</summary>
                <ul className="mt-2 space-y-1.5">
                  {(events[t.id] ?? []).map((e) => (
                    <li key={e.id} className="text-slate-600">
                      <span className="text-slate-400 text-xs">{timeAgo(e.created_at)} · </span>
                      {ACTION_LABEL[e.action] ?? e.action}
                      {e.note && <span className="text-slate-500"> — {e.note}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })
      )}
    </div>
  );
}
