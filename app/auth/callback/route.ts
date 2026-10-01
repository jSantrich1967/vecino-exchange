import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Recibe los enlaces de los correos de Supabase (confirmación de cuenta y
 * recuperación de clave): intercambia el `code` por la sesión y redirige.
 * Uso: ?next=/actualizar-clave para el flujo de recuperación.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") || "/";
  // Solo destinos internos: evita open redirects.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const sb = supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=enlace", url.origin));
}
