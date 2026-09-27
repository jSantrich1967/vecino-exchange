"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABS = [
  { href: "/", label: "Tasas", icon: "📊" },
  { href: "/mercado", label: "Mercado", icon: "🤝" },
  { href: "/operaciones", label: "Operaciones", icon: "🔒" },
  { href: "/admin", label: "Admin", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = supabaseBrowser().auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user?.email ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-emerald-800 text-white shadow">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">
            💵 Vecino Exchange
          </Link>
          {email ? (
            <button
              onClick={async () => {
                await supabaseBrowser().auth.signOut();
                router.push("/login");
                router.refresh();
              }}
              className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded-full px-3 py-1.5"
            >
              Salir
            </button>
          ) : (
            <Link
              href="/login"
              className="text-xs bg-white text-emerald-800 font-semibold rounded-full px-3 py-1.5"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200">
        <div className="max-w-xl mx-auto grid grid-cols-4">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center py-2.5 text-xs font-medium ${
                  active ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
