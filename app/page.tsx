import { getRates } from "@/lib/rates";
import { fmtVES, timeAgo } from "@/lib/format";
import { RefreshButton, WhatsAppCopyButton } from "@/components/RateActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function RateCard({
  title,
  value,
  sub,
  live,
}: {
  title: string;
  value: string;
  sub: string;
  live: boolean;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <span
          className={`badge ${live ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
        >
          {live ? "● en vivo" : "● referencial"}
        </span>
      </div>
      <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}

export default async function TasasPage() {
  const r = await getRates();

  const spread =
    r.usdt_sell_ves != null && r.paralelo != null
      ? ((r.usdt_sell_ves - r.paralelo) / r.paralelo) * 100
      : null;

  const waMessage = [
    "💵 *TASAS VECINO EXCHANGE*",
    `🏦 BCV oficial: ${fmtVES(r.oficial)} Bs`,
    `💱 Paralelo: ${fmtVES(r.paralelo)} Bs`,
    `🪙 USDT Binance: compra ${fmtVES(r.usdt_buy_ves)} / venta ${fmtVES(r.usdt_sell_ves)} Bs`,
    spread != null
      ? `📈 Spread USDT vs paralelo: ${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%`
      : "📈 Spread: sin datos",
    r.stale
      ? "⚠️ Tasas referenciales (sin conexión en vivo)"
      : "✅ Tasas en vivo",
  ].join("\n");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasas de hoy</h1>
          <p className="text-sm text-slate-500">
            Actualizado {timeAgo(r.updated_at)}
            {r.stale && " · datos referenciales"}
          </p>
        </div>
        <RefreshButton />
      </div>

      {r.stale && (
        <div className="card border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            ⚠️ No se pudo conectar con las fuentes en vivo. Se muestran los
            últimos valores guardados o los fijados por el administrador. No
            operes con estos números sin confirmarlos.
          </p>
        </div>
      )}

      <RateCard
        title="🏦 Dólar BCV (oficial)"
        value={`${fmtVES(r.oficial)} Bs`}
        sub="Fuente: DolarAPI · ve.dolarapi.com"
        live={r.live.oficial}
      />
      <RateCard
        title="💱 Dólar paralelo"
        value={`${fmtVES(r.paralelo)} Bs`}
        sub="Fuente: DolarAPI · ve.dolarapi.com"
        live={r.live.paralelo}
      />
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-500">🪙 USDT · Binance P2P</h3>
          <span
            className={`badge ${r.live.usdt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
          >
            {r.live.usdt ? "● en vivo" : "● referencial"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">Si COMPRAS USDT pagas</p>
            <p className="text-xl font-bold tabular-nums">{fmtVES(r.usdt_buy_ves)}</p>
            <p className="text-xs text-slate-400">Bs por USDT</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">Si VENDES USDT te dan</p>
            <p className="text-xl font-bold tabular-nums">{fmtVES(r.usdt_sell_ves)}</p>
            <p className="text-xs text-slate-400">Bs por USDT</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Mejores 5 anuncios de comerciantes verificados · Fuente: Binance P2P
        </p>
      </div>

      <div className="card bg-emerald-50 border-emerald-200">
        <h3 className="text-sm font-medium text-emerald-900">📈 Spread USDT vs paralelo</h3>
        <p className="text-3xl font-bold text-emerald-800 mt-1 tabular-nums">
          {spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%` : "—"}
        </p>
        <p className="text-xs text-emerald-700 mt-1">
          Cuánto más (o menos) paga el USDT de Binance frente al dólar paralelo.
          Un spread alto = oportunidad de arbitraje.
        </p>
      </div>

      <WhatsAppCopyButton message={waMessage} />

      <div className="card">
        <h3 className="font-semibold text-sm mb-1">¿Cómo funciona?</h3>
        <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
          <li>Publica o acepta una oferta en el <b>Mercado</b>.</li>
          <li>La operación entra en <b>custodia</b>: nadie mueve nada sin confirmar.</li>
          <li>El administrador verifica cada pago fuera de la app (capture de Zelle, transferencia de Binance) y lo confirma aquí.</li>
          <li>Al liberarse, la app descuenta la comisión automáticamente.</li>
        </ol>
      </div>
    </div>
  );
}
