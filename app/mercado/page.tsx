"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtVES, fmtUSD, timeAgo, PAY_METHODS } from "@/lib/format";

type Offer = {
  id: string;
  user_id: string;
  side: "buy" | "sell";
  asset: string;
  amount: number;
  rate_ves: number;
  pay_method: string | null;
  note: string | null;
  status: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export default function MercadoPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [filterSide, setFilterSide] = useState<"all" | "buy" | "sell">("all");
  const [filterPay, setFilterPay] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [refRate, setRefRate] = useState<number | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  // Form
  const [fSide, setFSide] = useState<"buy" | "sell">("sell");
  const [fAmount, setFAmount] = useState("");
  const [fRate, setFRate] = useState("");
  const [fPay, setFPay] = useState<string>(PAY_METHODS[0]);
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: sess } = await sb.auth.getSession();
    setUid(sess.session?.user?.id ?? null);
    const { data, error } = await sb
      .from("offers")
      .select("*, profiles(full_name)")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (!error) setOffers((data as Offer[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/rates")
      .then((r) => r.json())
      .then((j) => setRefRate(j.paralelo ?? j.oficial ?? null))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (showForm && refRate != null && !fRate) setFRate(refRate.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, refRate]);

  const filtered = useMemo(
    () =>
      offers.filter(
        (o) =>
          (filterSide === "all" || o.side === filterSide) &&
          (filterPay === "all" || o.pay_method === filterPay)
      ),
    [offers, filterSide, filterPay]
  );

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return router.push("/login");
    const amount = parseFloat(fAmount);
    const rate = parseFloat(fRate);
    if (!Number.isFinite(amount) || amount <= 0) return alert("Monto inválido");
    if (!Number.isFinite(rate) || rate <= 0) return alert("Tasa inválida");
    setSaving(true);
    const { error } = await supabaseBrowser().from("offers").insert({
      user_id: uid,
      side: fSide,
      asset: "USD",
      amount,
      rate_ves: rate,
      pay_method: fPay,
      note: fNote || null,
    });
    setSaving(false);
    if (error) return alert("Error publicando: " + error.message);
    setShowForm(false);
    setFAmount("");
    setFRate("");
    setFNote("");
    load();
  }

  async function accept(o: Offer) {
    if (!uid) return router.push("/login");
    if (o.user_id === uid) return alert("Es tu propia oferta");
    const total = o.amount * o.rate_ves;
    if (
      !confirm(
        `¿Aceptar esta oferta?\n\n${o.side === "sell" ? "Compras" : "Vendes"} ${fmtUSD(o.amount)} USD a ${fmtVES(o.rate_ves)} Bs\nTotal: ${fmtVES(total)} Bs\nMétodo: ${o.pay_method ?? "—"}\n\nSe creará una operación en custodia.`
      )
    )
      return;
    setAccepting(o.id);
    const { data, error } = await supabaseBrowser().rpc("accept_offer", {
      p_offer_id: o.id,
    });
    setAccepting(null);
    if (error) return alert("No se pudo aceptar: " + error.message);
    router.push("/operaciones");
  }

  async function cancelOffer(id: string) {
    if (!confirm("¿Cancelar esta oferta?")) return;
    const { error } = await supabaseBrowser()
      .from("offers")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return alert("Error: " + error.message);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mercado</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-secondary !w-auto px-4 py-2 text-sm">
          {showForm ? "Cerrar" : "＋ Publicar oferta"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={publish} className="card space-y-3">
          <h2 className="font-semibold">Nueva oferta</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFSide("sell")}
              className={`rounded-xl py-2.5 font-semibold border ${fSide === "sell" ? "bg-emerald-700 text-white border-emerald-700" : "bg-white border-slate-300"}`}
            >
              Vendo USD
            </button>
            <button
              type="button"
              onClick={() => setFSide("buy")}
              className={`rounded-xl py-2.5 font-semibold border ${fSide === "buy" ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-300"}`}
            >
              Compro USD
            </button>
          </div>
          <div>
            <label className="label">Monto (USD)</label>
            <input className="input" inputMode="decimal" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="100" required />
          </div>
          <div>
            <label className="label">
              Tasa (Bs por USD){" "}
              {refRate != null && <span className="text-slate-400 font-normal">· referencia: {fmtVES(refRate)}</span>}
            </label>
            <input className="input" inputMode="decimal" value={fRate} onChange={(e) => setFRate(e.target.value)} placeholder="945.00" required />
          </div>
          <div>
            <label className="label">Método de pago</label>
            <select className="input" value={fPay} onChange={(e) => setFPay(e.target.value)}>
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nota (opcional)</label>
            <input className="input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="Ej: entrego en el condominio" maxLength={140} />
          </div>
          <button className="btn-primary" disabled={saving}>
            {saving ? "Publicando…" : "Publicar oferta"}
          </button>
        </form>
      )}

      <div className="flex gap-2 flex-wrap">
        {(["all", "buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterSide(s)}
            className={`text-sm rounded-full px-3 py-1.5 border ${filterSide === s ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}
          >
            {s === "all" ? "Todas" : s === "buy" ? "Compras" : "Ventas"}
          </button>
        ))}
        <select
          className="text-sm rounded-full px-3 py-1.5 border border-slate-300 bg-white"
          value={filterPay}
          onChange={(e) => setFilterPay(e.target.value)}
        >
          <option value="all">Todo método</option>
          {PAY_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Cargando ofertas…</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-slate-500 text-sm py-8">
          No hay ofertas con esos filtros. ¡Publica la primera! 🤝
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`badge ${o.side === "sell" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                    {o.side === "sell" ? "Vende USD" : "Compra USD"}
                  </span>
                  <p className="text-xl font-bold mt-1 tabular-nums">
                    {fmtUSD(o.amount)} USD <span className="text-sm font-normal text-slate-500">@ {fmtVES(o.rate_ves)} Bs</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    💳 {o.pay_method ?? "—"} · 👤 {o.profiles?.full_name ?? "Vecino"} · {timeAgo(o.created_at)}
                  </p>
                  {o.note && <p className="text-sm text-slate-500 mt-1">“{o.note}”</p>}
                  <p className="text-xs text-slate-400 mt-1">Total aprox: {fmtVES(o.amount * o.rate_ves)} Bs</p>
                </div>
              </div>
              <div className="mt-3">
                {o.user_id === uid ? (
                  <button onClick={() => cancelOffer(o.id)} className="btn-danger !py-2 text-sm">
                    Cancelar mi oferta
                  </button>
                ) : (
                  <button
                    onClick={() => accept(o)}
                    disabled={accepting === o.id}
                    className="btn-primary !py-2.5 text-sm"
                  >
                    {accepting === o.id ? "Creando operación…" : o.side === "sell" ? "Comprar" : "Vender"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
