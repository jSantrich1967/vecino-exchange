"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    params.get("error") === "enlace"
      ? "El enlace del correo venció o no es válido. Pide uno nuevo."
      : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const sb = supabaseBrowser();
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo("Cuenta creada. Revisa tu correo y confirma la cuenta para entrar.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message ?? "Error de autenticación");
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      setError("Escribe tu correo primero para enviarte el enlace.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-clave`,
      });
      if (error) throw error;
      setInfo("Te enviamos un enlace a tu correo para crear una nueva clave.");
    } catch (err: any) {
      setError(err.message ?? "No se pudo enviar el correo de recuperación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto pt-8">
      <div className="text-center mb-6">
        <p className="text-4xl">💵</p>
        <h1 className="text-2xl font-bold mt-2">Vecino Exchange</h1>
        <p className="text-sm text-slate-500">Compra y vende dólares con tus vecinos, con custodia verificada.</p>
      </div>

      <div className="card">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-xl py-2 font-semibold ${mode === "login" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-xl py-2 font-semibold ${mode === "signup" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
          >
            Registrarme
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="label">Nombre y apellido</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" required />
            </div>
          )}
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" required />
          </div>
          <div>
            <label className="label">Clave</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-2">{error}</p>}
          {info && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-2">{info}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          {mode === "login" && (
            <button
              type="button"
              onClick={forgotPassword}
              disabled={busy}
              className="text-sm text-emerald-700 font-semibold hover:underline w-full text-center"
            >
              ¿Olvidaste tu clave?
            </button>
          )}
        </form>
      </div>

      <p className="text-xs text-slate-400 text-center mt-4">
        Al registrarte aceptas operar de buena fe. El administrador verifica cada pago antes de liberar fondos.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-slate-500 text-sm pt-8 text-center">Cargando…</p>}>
      <LoginForm />
    </Suspense>
  );
}
