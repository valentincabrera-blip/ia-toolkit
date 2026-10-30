import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { marca } from "@/lib/marca";

export const metadata: Metadata = {
  title: marca.nombre,
  description: marca.lema,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [primera, ...resto] = marca.nombre.split(" ");
  return (
    <html lang="es">
      <body>
        <header className="cabecera">
          <div className="interior">
            <h1 className="nombre">
              <span>{primera}</span> {resto.join(" ")}
            </h1>
            <p className="lema">{marca.lema}</p>
            <nav>
              <Link href="/">La nota</Link>
              <Link href="/preguntar">Preguntar</Link>
              <Link href="/borradores">Borradores</Link>
              <Link href="/mapa">Mapa</Link>
              <Link href="/transparencia">Transparencia</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="pie">
          <div className="interior">
            {marca.equipo} · {marca.curso}. {marca.declaracionCorta}
          </div>
        </footer>
      </body>
    </html>
  );
}
