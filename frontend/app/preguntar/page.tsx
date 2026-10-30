"use client";
// Preguntar: el lector hace una pregunta y el agente responde con el corpus (RAG) y cita sus fuentes.
import { useState } from "react";
import { api, type Paso } from "@/lib/api";
import { Traza } from "@/components/Traza";

const EJEMPLOS = [
  "¿Cuál fue la tasa de desocupación en el último trimestre?",
  "¿Cuántas personas están desocupadas y cuántas inactivas?",
  "¿Qué diferencia hay entre una persona desocupada y una inactiva?",
  "¿Cuál es la tasa de desocupación en la comuna de Maipú?",
  "¿Cuál es la tasa de desocupación en Ñuble?",
];

export default function Preguntar() {
  const [pregunta, setPregunta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resp, setResp] = useState<{ respuesta: string; fuentes: string[]; modelo: string; via?: "vector" | "local" | "tabla" | null; traza: Paso[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(p = pregunta) {
    if (p.trim().length < 4) return;
    setOcupado(true); setError(null); setResp(null); setPregunta(p);
    const r = await api.preguntar(p.trim());
    setOcupado(false);
    if (r.ok) setResp(r.datos as { respuesta: string; fuentes: string[]; modelo: string; via?: "vector" | "local" | "tabla" | null; traza: Paso[] });
    else setError((r.datos as { error?: string }).error ?? `Error ${r.status}`);
  }

  return (
    <>
      <p className="kicker">Preguntar</p>
      <h1 className="titular">Pregúntale al agente sobre el empleo en Chile</h1>
      <p className="bajada">Responde solo con los boletines del INE que tiene cargados y dice de dónde sale cada cifra. Si no consta, lo dice.</p>
      <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="Escribe tu pregunta…" />
      <div className="fila" style={{ marginTop: 10 }}>
        <button className="boton" disabled={ocupado} onClick={() => enviar()}>{ocupado ? "Buscando y redactando…" : "Preguntar"}</button>
        {EJEMPLOS.map((e) => (
          <button key={e} className="boton secundario" style={{ fontWeight: 400, fontSize: 13 }} disabled={ocupado} onClick={() => enviar(e)}>{e}</button>
        ))}
      </div>
      {error && <div className="aviso">{error}</div>}
      {resp && (
        <div className="caja">
          <h3>Respuesta ({resp.modelo}){resp.via && <span style={{ fontWeight: 400, color: "var(--gris)" }}> · {resp.via === "vector" ? "búsqueda por significado" : resp.via === "tabla" ? "consulta exacta a la tabla regional" : "búsqueda por palabras"}</span>}</h3>
          <p style={{ fontSize: 18, margin: "0 0 10px" }}>{resp.respuesta}</p>
          {resp.fuentes.length > 0 && (
            <ul className="fuentes">
              {resp.fuentes.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          <Traza pasos={resp.traza} />
        </div>
      )}
    </>
  );
}
