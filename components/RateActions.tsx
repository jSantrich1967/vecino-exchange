"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      onClick={() => {
        setSpinning(true);
        router.refresh();
        setTimeout(() => setSpinning(false), 1200);
      }}
      className="btn-secondary !w-auto px-4 py-2 text-sm"
    >
      <span className={spinning ? "inline-block animate-spin" : ""}>🔄</span> Actualizar
    </button>
  );
}

export function WhatsAppCopyButton({ message }: { message: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(message);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          alert("No se pudo copiar. Copia el texto manualmente.");
        }
      }}
      className="btn-primary"
    >
      {ok ? "✅ ¡Copiado!" : "📋 Copiar para WhatsApp"}
    </button>
  );
}
