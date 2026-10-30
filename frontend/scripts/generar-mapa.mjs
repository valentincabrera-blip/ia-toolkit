// Genera frontend/lib/mapa-chile.ts: el contorno de las 16 regiones de Chile como trazos SVG, en tres tramos
// (norte, centro y sur) dibujados lado a lado con la misma escala, para que el mapa quepa en un teléfono.
// No hace falta correrlo en clase: el archivo generado ya está en el repositorio.
//
// Fuente: Natural Earth, Admin 1 – States, Provinces, escala 1:10m (dominio público).
//   https://www.naturalearthdata.com/  ·  archivo: ne_10m_admin_1_states_provinces.geojson (filtrado a Chile)
// Uso: node scripts/generar-mapa.mjs <chile_admin1.geojson>
import { readFileSync, writeFileSync } from "node:fs";

const ESCALA = 40;          // unidades SVG por grado
const TOLERANCIA = 0.012;   // simplificación (grados): menos puntos, mismo contorno a la vista
const AREA_MINIMA = 0.004;  // islas más chicas que esto (grados²) no se dibujan
const SEPARACION = 24;      // espacio entre tramos

const TRAMOS = [
  { id: "norte", nombre: "Norte", regiones: ["AP", "TA", "AN", "AT"] },
  { id: "centro", nombre: "Centro", regiones: ["CO", "VS", "RM", "LI", "ML", "NB", "BI", "AR", "LR"] },
  { id: "sur", nombre: "Sur", regiones: ["LL", "AI", "MA"] },
];

const geo = JSON.parse(readFileSync(process.argv[2], "utf8"));
const porCodigo = new Map(geo.features.map((f) => [f.properties.iso_3166_2.replace("CL-", ""), f]));

function areaAnillo(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function simplificar(puntos, tol) {   // Douglas-Peucker
  if (puntos.length < 3) return puntos;
  const [a, b] = [puntos[0], puntos[puntos.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const [x, y] = puntos[i];
    const largo = Math.hypot(b[1] - a[1], b[0] - a[0]);
    const d = largo === 0   // contorno cerrado (primer punto = último): distancia al punto de partida
      ? Math.hypot(x - a[0], y - a[1])
      : Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / largo;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return [...simplificar(puntos.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(puntos.slice(idx), tol)];
}

function anillos(f) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.map((p) => p[0])                                    // solo el contorno exterior
    .filter((r) => r.every(([x]) => x > -77))                       // sin Rapa Nui ni Juan Fernández
    .filter((r) => areaAnillo(r) >= AREA_MINIMA);
}

let x0 = 0;
const salidaTramos = [];
const regiones = {};
for (const t of TRAMOS) {
  const todos = t.regiones.flatMap((c) => anillos(porCodigo.get(c)));
  const xs = todos.flat().map((p) => p[0]), ys = todos.flat().map((p) => p[1]);
  const [minX, maxX, maxY] = [Math.min(...xs), Math.max(...xs), Math.max(...ys)];
  const latMedia = (Math.min(...ys) + maxY) / 2;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const proyectar = ([lon, lat]) => [(x0 + (lon - minX) * k * ESCALA).toFixed(1), ((maxY - lat) * ESCALA).toFixed(1)];
  for (const c of t.regiones) {
    regiones[c] = anillos(porCodigo.get(c)).map((r) => {
      const pts = simplificar(r, TOLERANCIA).map(proyectar);
      return "M" + pts.map((p) => p.join(",")).join("L") + "Z";
    }).join("");
  }
  const ancho = (maxX - minX) * k * ESCALA;
  salidaTramos.push({ id: t.id, nombre: t.nombre, x: Number(x0.toFixed(1)), ancho: Number(ancho.toFixed(1)) });
  x0 += ancho + SEPARACION;
}
const alto = Math.max(...Object.values(regiones).flatMap((d) => d.match(/,[\d.]+/g).map((s) => Number(s.slice(1)))));

const ts = `// Generado por scripts/generar-mapa.mjs. No editar a mano.
// Contorno de las 16 regiones de Chile en tres tramos (norte, centro, sur) a la misma escala.
// Fuente: Natural Earth, Admin 1, 1:10m (dominio público), https://www.naturalearthdata.com/
// Simplificado; sin territorio insular (Rapa Nui, Juan Fernández) ni antártico.
export const MAPA = ${JSON.stringify({ ancho: Number((x0 - SEPARACION).toFixed(1)), alto: Math.ceil(alto), tramos: salidaTramos })} as const;

export const TRAZOS: Record<string, string> = ${JSON.stringify(regiones, null, 1)};
`;
writeFileSync(new URL("../lib/mapa-chile.ts", import.meta.url), ts);
console.log(`mapa-chile.ts: ${(ts.length / 1024).toFixed(0)} KB, ${Object.keys(regiones).length} regiones`);
