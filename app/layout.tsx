import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Vecino Exchange — Compra y venta de dólares entre vecinos",
  description:
    "Mercado P2P de USD/USDT para la comunidad: tasas en vivo, ofertas entre vecinos y custodia verificada por el administrador.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <main className="max-w-xl mx-auto px-4 pb-24 pt-4">{children}</main>
      </body>
    </html>
  );
}
