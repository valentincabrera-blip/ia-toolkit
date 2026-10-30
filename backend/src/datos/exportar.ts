// EXPORTAR (clase 8): las cifras y fuentes de los borradores (y de las regiones) en una planilla.
// /exportar.csv se abre en Excel o en Google Sheets. Lleva BOM UTF-8 para que Excel lea bien las tildes.
import type { Env } from "../tipos";
import { leerBorradoresCompletos } from "../herramientas/memoria";
import { leerRegiones } from "./regiones";

const COLUMNAS = ["tipo", "fecha", "titulo_o_region", "nombre_cifra", "valor", "variacion", "fuente", "url", "estado"];

function celda(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportarCsv(env: Env): Promise<string> {
  const filas: unknown[][] = [];
  for (const b of await leerBorradoresCompletos(env)) {
    const url = b.boletin ? `https://www.ine.gob.cl/docs/default-source/ocupacion-y-desocupacion/boletines/2026/nacional/ene-nacional-${b.boletin}.pdf` : "";
    if (!b.cifras.length) filas.push(["borrador", b.creado.slice(0, 10), b.titulo, "", "", "", b.fuentes.join(" | "), url, b.estado]);
    for (const c of b.cifras) filas.push(["borrador", b.creado.slice(0, 10), b.titulo, c.nombre, c.valor, c.variacion ?? "", c.fuente, url, b.estado]);
  }
  const reg = await leerRegiones(env);
  for (const r of reg.regiones) {
    filas.push(["region", reg.fecha_publicacion, r.region, `tasa de desocupación (${reg.trimestre})`,
      r.tasa === null ? "" : `${String(r.tasa).replace(".", ",")}%`,
      r.variacion_pp === null ? "" : `${r.variacion_pp > 0 ? "+" : ""}${String(r.variacion_pp).replace(".", ",")} pp.`,
      r.fuente, r.url, "publicada por el INE"]);
  }
  return "﻿" + [COLUMNAS, ...filas].map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
