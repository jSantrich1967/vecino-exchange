import { NextResponse } from "next/server";
import { getRates } from "@/lib/rates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/rates — tasas en vivo (Binance P2P + DolarAPI) con respaldos. Solo servidor. */
export async function GET() {
  try {
    const rates = await getRates();
    return NextResponse.json(rates, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        oficial: null,
        paralelo: null,
        usdt_buy_ves: null,
        usdt_sell_ves: null,
        updated_at: null,
        stale: true,
        live: { oficial: false, paralelo: false, usdt: false },
        error: e?.message ?? "Error consultando tasas",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
