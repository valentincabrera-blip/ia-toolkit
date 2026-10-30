# Clase 8 (30 oct): el agente busca por significado, conoce las regiones y corre solo

Todo lo de esta clase llega a tu fork con **Sync fork** y se activa con dos secretos y un commit. La guía con
capturas es [PASO_A_PASO_CLASE_8.md](PASO_A_PASO_CLASE_8.md). Este archivo explica qué hay detrás.

## 1. El RAG propio, en Neon

Cada estudiante crea **su propia base de datos** en [Neon](https://neon.com) (Postgres con la extensión
pgvector, plan Free, sin tarjeta, cuenta con GitHub). La cadena de conexión (`postgresql://…`) se guarda como el
secreto `DATABASE_URL` en Cloudflare, en la misma pantalla que `GEMINI_API_KEY`. Nunca va en GitHub.

Dos tablas, dos ideas (es contenido de la clase):

| Tabla | Qué guarda | Para qué preguntas | Cómo se busca |
|---|---|---|---|
| `trozos` | fragmentos de ~700 caracteres de los boletines + su vector (768 números) | de **texto**: "¿qué es un inactivo?", "¿qué sectores cayeron?" | por **significado**: el vector de la pregunta contra el de cada trozo (similitud coseno) |
| `tasas_regionales` | una fila por región: tasa, variación, hombres, mujeres, informalidad, fuente, URL | de **números**: "¿tasa en Ñuble?" | consulta **exacta** de la fila (herramienta `tasa_por_region`) |

Regla del producto: **las cifras regionales salen de `tasas_regionales`; el texto, de `trozos`.**

Piezas en el código (todas nuevas; el estudiante no las edita):

- `backend/src/datos/neon.ts`: conexión (`@neondatabase/serverless` por HTTP), esquema, búsqueda vectorial.
  Si Neon estaba dormido (se suspende tras 5 minutos sin uso) reintenta una vez: la primera consulta después de
  una pausa puede tardar uno o dos segundos.
- `backend/src/datos/embeddings.ts`: vectores con `gemini-embedding-001`, 768 dimensiones (el mismo modelo de la
  clase 6), normalizados.
- `backend/src/datos/indexar.ts` → ruta `/indexar?clave=<CLAVE_APROBACION>`: crea las tablas, trocea los
  documentos del corpus (335, 334, 331, glosario, boletín regional de la RM, y el 336 si ya está publicado en
  el INE), pide los vectores, los guarda y carga las 16 regiones. Opciones: `&boletin=336` (solo ese boletín),
  `&regiones=1` (solo las regiones), `&reiniciar=1` (borra todo y reindexa). Reindexar no duplica.
- `buscar_en_boletines` busca por significado si hay `DATABASE_URL` **y** trozos indexados; si no, por palabras,
  y la traza dice por qué ("sin DATABASE_URL", "índice vacío: abre /indexar" o el error). Cada resultado trae
  `via: "vector"` o `via: "local"`.
- `/evaluar?via=local` y `/evaluar?via=vector`: corren el banco de preguntas (`backend/src/corpus/banco_preguntas.json`)
  y muestran, por pregunta, el mejor fragmento y su fuente. No llaman al modelo que redacta.
- `/exportar.csv`: cifras y fuentes de los borradores y de las regiones, para Excel o Sheets.
- `GET /` informa `rag` (`vector` o `local`), `trozos`, `regiones` y `ultimoTrimestreRegional`.

Sin `DATABASE_URL`, todo sigue funcionando como en la clase 7, con búsqueda por palabras.

> ⚠ **Banco de preguntas:** las preguntas 1–14 de `banco_preguntas.json` son un borrador armado desde el corpus.
> Reemplazarlas por las 14 originales de la clase 6 antes del viernes (las 4 regionales R1–R4 son de esta clase).

## 2. Las cifras regionales: fuente elegida

**Fuente:** los 16 boletines regionales de la ENE del INE, trimestre junio–agosto 2026, publicados el
30-09-2026. Las cifras están en `backend/src/corpus/regiones.json`, una fila por región, **cada una con la URL
de su boletín**. Se armó a mano desde los PDF y se cruzó con la serie oficial en Excel del INE:
`https://www.ine.gob.cl/docs/default-source/ocupacion-y-desocupacion/cuadros-estadisticos/series-vigentes/indicadores_principales_reg_sex.xlsx`
(tasa, hombres, mujeres y la tasa de un año antes coinciden en las 16 regiones; la informalidad sale de los PDF).

Por qué no se extrae automáticamente: los boletines regionales **no siguen un patrón de URL**.

- La Región Metropolitana está en el sitio nacional:
  `https://www.ine.gob.cl/docs/default-source/ocupacion-y-desocupacion/boletines/2026/rm/ene-rm-123.pdf`.
- Las otras 15 están en `https://regiones.ine.gob.cl/documentos/default-source/region-<número romano>/…/boletines/2026/<nombre libre>.pdf`,
  con nombres distintos por región (`informe-empleo-junio-agosto-2026.pdf`, `boletin-empleo-jja2026.pdf`,
  `emp_jja_2026_(3-0).pdf`…). Antofagasta usa la carpeta `estadistica` (sin s) y Biobío está en `regiones.ine.cl`.
- La forma confiable de encontrarlos es la página de cada región:
  `https://regiones.ine.gob.cl/<región>/estadisticas-por-tema/mercado-laboral/ocupacion-y-desocupacion`.

**Para el trimestre julio–septiembre 2026** (boletines regionales del 29 o 30 de octubre): actualizar
`regiones.json` con las 16 cifras nuevas y sus URL (o la planilla Excel, hojas `AS_<código>`), cambiar
`trimestre`, `fecha_publicacion`, `boletin` y `nacional`, hacer commit, y en cada agente abrir
`/indexar?clave=…&regiones=1`. La tabla guarda un trimestre por fila, así que el anterior se conserva.

El corpus también trae el texto del boletín regional de la Región Metropolitana (junio–agosto 2026), para que la
búsqueda por significado tenga material regional. La ENE no entrega cifras por comuna, y el agente lo dice
(`backend/src/agente/skills/regiones.md`).

## 3. El disparador (cron)

En `backend/wrangler.jsonc`, al final:

1. Agrega una coma después de la llave que cierra el bloque `"vars": { … }`.
2. Quita las dos barras `//` delante de `"triggers": { "crons": ["30 12 * * *"] },`.
3. **Commit changes**. Al desplegarse, el agente corre solo todos los días a las 09:30 de Chile (12:30 UTC).

Verificar: en Cloudflare, Worker → **Settings → Trigger events → Cron triggers** muestra el cron. Al día siguiente,
`/borradores` tiene un borrador con `"motivo": "cron"` (o, si no hubo boletín nuevo, nada: es lo esperado).
El registro de cada corrida se lee en Worker → **Logs**.

## 4. El mapa (esqueleto para la clase 9, no se anuncia en la 8)

- Backend: `GET /regiones` → `{ trimestre, fecha_publicacion, nacional, regiones: [...] }`, con CORS.
- Frontend: página `/mapa` (enlace "Mapa" en la navegación). Mapa SVG en tres tramos (norte, centro y sur) a la
  misma escala, coloreado con el color de la marca del equipo; al tocar una región, tarjeta con tasa, variación,
  comparación con el país y fuente. Geometría de Natural Earth (dominio público), en `frontend/lib/mapa-chile.ts`,
  generada por `frontend/scripts/generar-mapa.mjs` (70 KB, sin Rapa Nui ni Juan Fernández). Los textos entre
  `[ … ]` los escribe el equipo en la clase 9.

## 5. MCP

Sin cambios: el servidor MCP sigue en `https://ia-toolkit.<subdominio>.workers.dev/mcp` (`ultima_tasa`,
`buscar_en_boletines`, `estado_del_agente`). No entra en la clase 8.

## Regla para el profesor: actualizaciones del maestro sin conflictos

Los estudiantes editan estos archivos. **Las actualizaciones del maestro no los tocan**:

- `backend/src/agente/objetivo.md` (el bloque "Lo que el equipo editorial quiere cambiar")
- `backend/src/agente/skills/respuesta-ene.md`
- archivos nuevos en `backend/src/herramientas/` y la lista de `backend/src/herramientas/index.ts`
- `backend/wrangler.jsonc` (`NOMBRE_EQUIPO`, y la línea de cron que descomentan en esta clase)
- `frontend/lib/marca.ts`, `frontend/app/globals.css` y los textos de `frontend/app/transparencia/page.tsx`
- la sección "Mis direcciones" de `README.md`

Cómo se hizo en la clase 8 para no chocar:

- Las herramientas que agrega el curso van en `backend/src/herramientas/extra.ts`. `index.ts` cambió una sola vez
  (un `import` arriba y `...herramientasDelCurso` **después** del comentario donde los estudiantes agregan las
  suyas). Desde ahora, una herramienta nueva del curso solo toca `extra.ts`.
- La regla de regiones no va en `respuesta-ene.md` sino en un archivo nuevo, `skills/regiones.md`, que el bucle
  lee junto al procedimiento del equipo.
- En `wrangler.jsonc` solo se reemplazó el comentario de AI Search (que ya no se usa) por uno sobre Neon.

**Prueba hecha (simulada con git, 27-10-2026):** un fork con la herramienta real de Jules (`calcular_variacion`),
una regla en `objetivo.md`, una línea al final de `respuesta-ene.md`, `NOMBRE_EQUIPO`, marca, color, textos de
transparencia y "Mis direcciones" se mezcló con la actualización de la clase 8 **sin conflictos**; el resultado
compila y construye. Falta la prueba con el botón real **Sync fork** en un fork de otra cuenta.

### Resultado de `/evaluar` en el ensayo (para la discusión de clase)

Mejor fragmento por pregunta. "Acierta" = trae el documento esperado (las 3 trampas no cuentan).

| | Por palabras | Por significado |
|---|---|---|
| Aciertos | 10 de 15 | 11 de 15 |
| Dónde falla | "¿cuántas personas desocupadas?" e "informalidad" traen el boletín de la RM (mismas palabras); "trimestre móvil", "puntos porcentuales" y "cómo se calcula" no encuentran el glosario | "tasa de las mujeres" trae la RM; "ajustada estacionalmente" trae el 334 en vez del 335; "¿la ENE entrega datos por región?" y la comuna traen la RM |
| Trampas (causas, proyecciones, comuna) | Siempre devuelve algo | Siempre devuelve algo |

Para la clase: la búsqueda por significado arregla las preguntas de definiciones, pero no es perfecta; ninguna
búsqueda "sabe" que algo no consta (lo decide el modelo con el objetivo y el procedimiento); y "¿qué región tiene
la tasa más alta?" no se responde buscando texto: se responde con la tabla.

## Motor del agente: `propio` o `adk`

`MOTOR` en `backend/wrangler.jsonc` elige el motor del bucle. El valor por defecto del maestro es `propio`.

- **Presupuesto de CPU.** El plan Free de Workers permite 10 ms de CPU por petición. El agente casi no usa CPU
  (el PDF lo convierte Workers AI; las llamadas a Gemini y a Neon son espera de red). Si en producción aparecen
  errores "Exceeded CPU" (Worker → **Logs**), las salidas son volver a `MOTOR=propio`, indexar boletín por
  boletín (`/indexar?…&boletin=335`) o pasar al plan Workers Paid (US$5/mes). Decisión del profesor.
- **Diferencia de comportamiento.** El motor propio prueba los modelos de `GEMINI_MODELOS` en orden y
  reintenta ante 429/5xx; el motor `adk` usa solo el primero.

### Registro de pruebas

| Fecha | Prueba | Resultado |
|---|---|---|
| 22-10-2026 | `/correr?forzar=1`, motor propio, Gemini | 25 s, `gemini-3.6-flash`, 6 cifras con fuente, sin problemas en los límites |
| 22-10-2026 | `/correr?forzar=1`, motor adk, Gemini | 26 s, 5 cifras con fuente, sin errores de CPU |
| 27-10-2026 | Matriz sin `DATABASE_URL` (local) | `rag: "local"`; `/regiones` desde el archivo (16); `/evaluar?via=local` 18 preguntas; `/exportar.csv` con BOM; `/correr` igual que en la clase 7 |
| 27-10-2026 | Bundle del backend | 678 KB gzip (límite 3 MB) |
| 28-10-2026 | `GET /` recién puesto `DATABASE_URL` | Error "relation trozos does not exist" (arreglado en 5cea147); ahora dice "Neon conectado pero vacío" |
| 28-10-2026 | `/indexar` completo en producción (Neon AWS us-east-2) | **9,6 s**: 5 documentos, 43 trozos, 43 vectores, 16 regiones. Panel → Metrics: CPU **7 ms**, 0 "Exceeded CPU Time Limits", 0 errores. Gemini ~1,9 s por lote, Neon ~185 ms por consulta |
| 28-10-2026 | `GET /` con índice | `rag: "vector"`, 43 trozos, 16 regiones, 0,8 s |
| 28-10-2026 | `/preguntar` texto (desocupada vs inactiva) | 12,9 s, `via: vector`, respuesta correcta con fuente (glosario) |
| 28-10-2026 | `/preguntar` "Ñuble", "santiago", "comuna de Puente Alto" | 7–9 s; `tasa_por_region` con "Ñuble", "RM" y "Región Metropolitana"; las dos últimas aclaran que la ENE no entrega comunas y ofrecen la RM |
| 28-10-2026 | `/evaluar` | local 0,9 s; vector 3,6 s (18 vectores en una llamada, 1 consulta a Neon). Ver resultado abajo |
| 28-10-2026 | `/exportar.csv` | BOM UTF-8, 44 filas (borradores + 16 regiones) |
| 28-10-2026 | Neon dormido (6,7 min sin uso) | primera consulta 1,8 s (contra 0,8 s despierto); sin error. Basta con decirlo en clase |
