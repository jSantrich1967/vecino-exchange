"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Fijar nueva clave tras el enlace de recuperación del correo.
 * Llega con sesión temporal válida desde /auth/callback?next=/actualizar-clave.
 */
export default function ActualizarClavePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setMsg({ ok: false, text: "La clave debe tener al menos 6 caracteres." });
      return;
    }
    if (password !== confirm) {
      setMsg({ ok: false, text: "Las claves no coinciden." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ ok: true, text: "Clave actualizada. Te llevamos al inicio de sesión…" });
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setMsg({
        ok: false,
        text: err?.message ?? "No se pudo actualizar la clave. Pide un enlace nuevo.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto pt-8">
      <div className="text-center mb-6">
        <p className="text-4xl">🔑</p>
        <h1 className="text-2xl font-bold mt-2">Actualizar clave</h1>
        <p className="text-sm text-slate-500">Escribe tu nueva clave para la cuenta.</p>
      </div>

      <div className="card">
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Nueva clave</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="label">Confirma la clave</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          {msg && (
            <p
              className={`text-sm rounded-xl p-2 ${
                msg.ok ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"
              }`}
            >
              {msg.text}
            </p>
          )}
          <button className="btn-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar nueva clave"}
          </button>
        </form>
      </div>
    </div>
  );
}
