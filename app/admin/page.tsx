"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtVES, fmtUSD, timeAgo, TRADE_STATUS_LABEL } from "@/lib/format";

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

type Profile = { id: string; full_name: string | null; phone: string | null; is_admin: boolean; created_at: string };

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: sess } = await sb.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) {
      setAllowed(false);
      return;
    }
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", uid).single();
    if (!(prof as any)?.is_admin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);

    const { data: tData } = await sb
      .from("trades")
      .select("*, buyer_profile:profiles!trades_buyer_id_fkey(full_name), seller_profile:profiles!trades_seller_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setTrades((tData as Trade[]) ?? []);

    const { data: uData } = await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(100);
    setUsers((uData as Profile[]) ?? []);

    const { data: sData } = await sb.from("settings").select("key, value");
    const map: Record<string, string> = {};
    (sData ?? []).forEach((r: any) => (map[r.key] = r.value ?? ""));
    setSettings(map);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(tradeId: string, action: string, label: string) {
    if (!confirm(`${label}\n\n¿Confirmas esta acción?`)) return;
    setBusy(tradeId + action);
    const { error } = await supabaseBrowser().rpc("advance_trade", {
      p_trade_id: tradeId,
      p_action: action,
      p_note: `Acción de admin: ${label}`,
    });
    setBusy(null);
    if (error) return alert("Error: " + error.message);
    load();
  }

  async function saveSetting(key: string, value: string) {
    const { error } = await supabaseBrowser().from("settings").update({ value }).eq("key", key);
    if (error) return alert("Error guardando: " + error.message);
    setSettings((s) => ({ ...s, [key]: value }));
  }

  if (allowed === null) return <p className="text-slate-500 text-sm">Verificando permisos…</p>;
  if (!allowed)
    return (
      <div className="card text-center py-10">
        <p className="text-2xl mb-2">🔒</p>
        <p className="font-semibold">Acceso denegado</p>
        <p className="text-sm text-slate-500 mt-1">Esta sección es solo para el administrador.</p>
      </div>
    );

  const income = trades
    .filter((t) => t.status === "released")
    .reduce((s, t) => s + (t.fee_usd ?? 0), 0);
  const activeTrades = trades.filter((t) => !["released", "cancelled"].includes(t.status));

  const OVERRIDES: { key: string; label: string }[] = [
    { key: "manual_oficial", label: "BCV oficial manual (Bs)" },
    { key: "manual_paralelo", label: "Paralelo manual (Bs)" },
    { key: "manual_usdt_buy_ves", label: "USDT compra manual (Bs)" },
    { key: "manual_usdt_sell_ves", label: "USDT venta manual (Bs)" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">⚙️ Administración</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-slate-500">Ingresos por comisiones</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtUSD(income)} USD</p>
          <p className="text-xs text-slate-400">operaciones liberadas</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Operaciones activas</p>
          <p className="text-2xl font-bold tabular-nums">{activeTrades.length}</p>
          <p className="text-xs text-slate-400">requieren seguimiento</p>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Comisión y tasas manuales</h2>
        <div>
          <label className="label">Comisión por operación (%)</label>
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="decimal"
              value={settings.fee_pct ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, fee_pct: e.target.value }))}
            />
            <button onClick={() => saveSetting("fee_pct", settings.fee_pct ?? "1.0")} className="btn-secondary !w-auto px-4 text-sm">
              Guardar
            </button>
          </div>
        </div>
        {OVERRIDES.map((o) => (
          <div key={o.key}>
            <label className="label">{o.label}</label>
            <div className="flex gap-2">
              <input
                className="input"
                inputMode="decimal"
                placeholder="Vacío = automático"
                value={settings[o.key] ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, [o.key]: e.target.value }))}
              />
              <button onClick={() => saveSetting(o.key, settings[o.key] ?? "")} className="btn-secondary !w-auto px-4 text-sm">
                Guardar
              </button>
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-500">
          Las tasas manuales solo se usan si fallan las fuentes en vivo y no hay snapshots guardados.
        </p>
      </div>

      <h2 className="font-bold text-lg pt-2">Operaciones</h2>
      {trades.length === 0 ? (
        <p className="text-sm text-slate-500">No hay operaciones todavía.</p>
      ) : (
        <div className="space-y-3">
          {trades.map((t) => (
            <div key={t.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`badge ${t.status === "released" ? "bg-emerald-100 text-emerald-800" : t.status === "disputed" ? "bg-red-100 text-red-800" : t.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}>
                    {TRADE_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <p className="font-bold mt-1 tabular-nums">
                    {fmtUSD(t.amount_usd)} USD @ {fmtVES(t.rate_ves)} Bs
                  </p>
                  <p className="text-sm text-slate-600">
                    🧑‍💼 {t.buyer_profile?.full_name ?? "?"} → 🧑‍💻 {t.seller_profile?.full_name ?? "?"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {timeAgo(t.created_at)} · comisión {t.fee_pct}%
                    {t.fee_usd != null && ` → ${fmtUSD(t.fee_usd)} USD`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {["requested", "awaiting_buyer"].includes(t.status) && (
                  <button disabled={busy === t.id + "buyer_paid"} onClick={() => act(t.id, "buyer_paid", "Confirmar pago del comprador (verificaste el capture/transferencia)")} className="btn-secondary !py-2 text-sm">
                    ✅ Pago comprador
                  </button>
                )}
                {t.status === "awaiting_seller" && (
                  <button disabled={busy === t.id + "seller_delivered"} onClick={() => act(t.id, "seller_delivered", "Confirmar entrega del vendedor")} className="btn-secondary !py-2 text-sm">
                    📤 Entrega vendedor
                  </button>
                )}
                {t.status === "in_escrow" && (
                  <button disabled={busy === t.id + "release"} onClick={() => act(t.id, "release", `LIBERAR fondos. Comisión: ${fmtUSD((t.amount_usd * t.fee_pct) / 100)} USD`)} className="btn-primary !py-2 text-sm">
                    🔓 Liberar fondos
                  </button>
                )}
                {t.status === "disputed" && (
                  <>
                    <button disabled={busy === t.id + "resolve_escrow"} onClick={() => act(t.id, "resolve_escrow", "Resolver disputa: volver a custodia")} className="btn-secondary !py-2 text-sm">
                      ↩️ A custodia
                    </button>
                    <button disabled={busy === t.id + "resolve_cancel"} onClick={() => act(t.id, "resolve_cancel", "Resolver disputa: cancelar operación")} className="btn-danger !py-2 text-sm">
                      ✖️ Cancelar
                    </button>
                  </>
                )}
                {!["released", "cancelled"].includes(t.status) && (
                  <button disabled={busy === t.id + "cancel"} onClick={() => act(t.id, "cancel", "Cancelar esta operación")} className="btn-danger !py-2 text-sm col-span-2">
                    Cancelar operación
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-bold text-lg pt-2">Usuarios ({users.length})</h2>
      <div className="card divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="py-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{u.full_name ?? "Sin nombre"}</p>
              <p className="text-xs text-slate-400">{u.phone ?? "sin teléfono"} · desde {timeAgo(u.created_at)}</p>
            </div>
            {u.is_admin && <span className="badge bg-purple-100 text-purple-800">admin</span>}
          </div>
        ))}
      </div>

      <div className="card bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-800">
          ⚠️ <b>Recuerda:</b> esta app registra y ordena las operaciones, pero <b>no mueve dinero</b>.
          Verifica cada pago manualmente (capture de Zelle, transferencia de Binance) antes de confirmar o liberar.
        </p>
      </div>
    </div>
  );
}
