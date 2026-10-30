"use client";
// El mapa regional: la tasa de desocupación de cada región del último trimestre, con la tasa nacional como
// referencia. Los datos vienen del backend (GET /regiones), que los toma de los boletines regionales del INE.
// Lo que está entre corchetes [ … ] lo escribe el equipo (clase 9).
import { useEffect, useMemo, useState } from "react";
import { api, type Region, type Regiones } from "@/lib/api";
import { MAPA, TRAZOS } from "@/lib/mapa-chile";

const coma = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "s/d" : n.toFixed(d).replace(".", ","));
const signo = (n: number | null) => (n === null ? "s/d" : `${n > 0 ? "+" : ""}${coma(n)} pp.`);

export default function Mapa() {
  const [datos, setDatos] = useState<Regiones | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);

  useEffect(() => {
    api.regiones()
      .then((r) => (r.ok ? setDatos(r.datos as Regiones) : setAviso("Este agente todavía no cargó datos regionales: abre /indexar en el backend.")))
      .catch(() => setAviso("No pude hablar con el backend."));
  }, []);

  const porCodigo = useMemo(() => new Map((datos?.regiones ?? []).map((r) => [r.codigo, r])), [datos]);
  const [min, max] = useMemo(() => {
    const t = (datos?.regiones ?? []).map((r) => r.tasa).filter((x): x is number => x !== null);
    return t.length ? [Math.min(...t), Math.max(...t)] : [0, 1];
  }, [datos]);
  // Más oscuro = más desocupación. El color es el de la marca del equipo (var(--acento) en globals.css).
  const intensidad = (r?: Region) => (r?.tasa == null ? 0.08 : 0.15 + (0.85 * (r.tasa - min)) / (max - min || 1));
  const region = elegida ? porCodigo.get(elegida) : undefined;

  return (
    <>
      <p className="kicker">Mapa</p>
      <h1 className="titular">[Titular del equipo sobre el desempleo en las regiones]</h1>
      <p className="bajada">
        {datos ? <>Tasa de desocupación por región, trimestre {datos.trimestre}. El país: <strong>{coma(datos.nacional.tasa)}%</strong> ({signo(datos.nacional.variacion_pp)} en doce meses).</> : "Cargando las cifras regionales…"}
      </p>
      {aviso && <div className="aviso">{aviso}</div>}

      {datos && (
        <>
          <svg viewBox={`-4 -24 ${MAPA.ancho + 8} ${MAPA.alto + 28}`} role="img" aria-label={`Mapa de Chile por regiones, tasa de desocupación ${datos.trimestre}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {MAPA.tramos.map((t) => (
              <text key={t.id} x={t.x} y={-8} fontSize={14} fill="var(--gris)" fontFamily="var(--sans)" letterSpacing="0.08em">{t.nombre.toUpperCase()}</text>
            ))}
            {Object.entries(TRAZOS).map(([codigo, d]) => {
              const r = porCodigo.get(codigo);
              return (
                <path key={codigo} d={d} onClick={() => setElegida(codigo)}
                  fill="var(--acento)" fillOpacity={intensidad(r)}
                  stroke={elegida === codigo ? "var(--tinta)" : "var(--papel)"} strokeWidth={elegida === codigo ? 2 : 0.8}
                  style={{ cursor: "pointer" }}>
                  <title>{r ? `${r.region}: ${coma(r.tasa)}%` : codigo}</title>
                </path>
              );
            })}
          </svg>

          <div className="fila" style={{ alignItems: "center", gap: 8, fontSize: 13, color: "var(--gris)", margin: "6px 0 0" }}>
            <span>{coma(min)}%</span>
            <span style={{ flex: "0 0 140px", height: 10, borderRadius: 5, background: "linear-gradient(90deg, color-mix(in srgb, var(--acento) 15%, var(--papel)), var(--acento))" }} />
            <span>{coma(max)}%</span>
            <span>· Toca una región para ver su cifra.</span>
          </div>

          {region && (
            <div className="caja">
              <h3>{region.region}</h3>
              <p style={{ fontSize: 28, fontFamily: "var(--serif)", margin: "0 0 4px" }}>{coma(region.tasa)}%</p>
              <p style={{ margin: "0 0 8px" }}>
                {signo(region.variacion_pp)} en doce meses ·{" "}
                {region.tasa === null ? "sin comparación" : region.tasa === datos.nacional.tasa ? "igual que el país"
                  : `${coma(Math.abs(region.tasa - datos.nacional.tasa))} pp. ${region.tasa > datos.nacional.tasa ? "sobre" : "bajo"} el país`}
              </p>
              <p style={{ fontSize: 14, color: "var(--gris)", margin: "0 0 8px" }}>
                Mujeres {coma(region.tasa_mujeres)}% · Hombres {coma(region.tasa_hombres)}% · Informalidad {coma(region.informalidad)}%
              </p>
              <p style={{ fontSize: 13, margin: 0 }}>Fuente: <a href={region.url} target="_blank" rel="noreferrer">{region.fuente}</a></p>
            </div>
          )}

          <div className="cuerpo">
            <p>[Lo que el equipo quiere que el lector entienda de este mapa.]</p>
            <p style={{ fontSize: 14, color: "var(--gris)" }}>
              La Encuesta Nacional de Empleo entrega cifras nacionales y regionales; no entrega cifras por comuna.
              Mapa: Natural Earth (dominio público), sin territorio insular.
            </p>
          </div>

          <details>
            <summary>Ver la tabla de las 16 regiones</summary>
            <ul className="fuentes">
              {[...datos.regiones].sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0)).map((r) => (
                <li key={r.codigo}><a href={r.url} target="_blank" rel="noreferrer">{r.region}</a>: {coma(r.tasa)}% ({signo(r.variacion_pp)})</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  );
}
