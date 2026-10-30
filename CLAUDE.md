# Agente ENE · instrucciones para el agente de desarrollo

Este archivo es el "system prompt" del proyecto: lo lees antes de hacer cualquier cosa aquí. `AGENTS.md` es una
copia exacta (la leen Jules, Codex y Antigravity). Quien te pide cosas es un equipo de estudiantes de periodismo
de la Universidad de Chile, sin formación técnica, en el electivo "Agentes de IA para periodismo". Tu trabajo es
ayudarles a construir, entender y poner en producción su propio agente. Lo que construyen es suyo: cada cambio
tiene que quedar explicado en lenguaje de redacción, no de ingeniería.

## Qué es este proyecto

Un **agente** que vigila los boletines de la Encuesta Nacional de Empleo (ENE) del INE de Chile. Cuando aparece
un boletín nuevo, lo descarga, extrae las cifras, redacta un borrador de nota con fuentes y lo deja para que
una persona lo apruebe. Tiene dos mitades desplegadas por separado:

- `backend/` → un **Cloudflare Worker** (TypeScript). Ahí vive el agente: su objetivo, sus herramientas, su
  bucle, su memoria, sus límites, y un servidor **MCP** que presta las herramientas a otros agentes.
- `frontend/` → una app **Next.js** desplegada en **Vercel**. Es la cara pública: la nota publicada, un chat
  para preguntar, la mesa de edición (aprobar/rechazar) y la página de transparencia.

El modelo de lenguaje que corre dentro del agente es Gemini (clave del profesor). Si la clave falta, el
backend usa un modelo simulado que sigue un guion fijo: todo funciona igual, pero la traza lo dice.

## Cómo llega un cambio a producción (no hay comandos de despliegue)

Cada estudiante trabaja en **su fork** de `sil7en/ia-toolkit` en GitHub. El fork está conectado a dos servicios
que despliegan solos cuando cambia la rama `main`:

- Cloudflare **Workers Builds** (carpeta `backend`) → `https://ia-toolkit.<subdominio>.workers.dev`
- **Vercel** (carpeta `frontend`) → `https://<proyecto>.vercel.app`

Por eso, desplegar = hacer commit en `main` (o fusionar un pull request). Nunca uses `wrangler deploy`,
`wrangler login`, `wrangler secret`, `vercel` ni `vercel login`: el despliegue no pasa por tu terminal. Los
secretos (`GEMINI_API_KEY`, `CLAVE_APROBACION`) los escribe el estudiante en el panel de Cloudflare
(Settings → Variables and Secrets); tú nunca los ves ni los pides.

Las URLs de producción del equipo están en el README de su fork (sección "Mis direcciones"). Úsalas para
verificar cada cambio después de que se despliegue.

## Mapa del proyecto (cada archivo encarna un concepto del curso)

```
backend/
  wrangler.jsonc                configuración del Worker: nombre, memoria, IA, variables (NOMBRE_EQUIPO, MOTOR), vistas previas, cron
  src/index.ts                  las rutas HTTP, el servidor MCP en /mcp y el disparador programado
  src/agente/objetivo.md        EL OBJETIVO: qué debe lograr el agente y sus reglas (lo escribe el equipo)
  src/agente/skills/respuesta-ene.md   EL PROCEDIMIENTO (skill): cómo redactar la nota paso a paso
  src/agente/skills/regiones.md        procedimiento del curso para preguntas por región o comuna (clase 8; no se edita)
  src/agente/bucle.ts           EL BUCLE: modelo decide → herramienta → resultado al contexto → repetir → entregar
  src/agente/motor-adk.ts       el mismo bucle con Google ADK (se activa con MOTOR = "adk")
  src/agente/modelo.ts          la llamada a la API de Gemini (y el modelo simulado)
  src/agente/limites.ts         LOS LÍMITES (guardrails): reglas que revisa el programa, no el modelo
  src/herramientas/index.ts     EL REGISTRO de herramientas: la lista de lo que el agente puede hacer
  src/herramientas/extra.ts     herramientas que agrega el curso (tasa_por_region); el equipo no lo edita
  src/herramientas/regiones.ts  tasa_por_region: la cifra de una región, desde la tabla regional
  src/herramientas/ine.ts       obtener_ultimo_boletin / obtener_boletin (descarga el PDF y lo convierte a texto)
  src/herramientas/corpus.ts    buscar_en_boletines (RAG: por significado en Neon si hay DATABASE_URL; si no, por palabras)
  src/herramientas/memoria.ts   la memoria: último boletín visto, borradores, nota publicada, candado
  src/memoria-durable.ts        dónde vive la memoria: un Durable Object con SQLite
  src/herramientas/_plantilla.ts   plantilla para crear una herramienta nueva
  src/corpus/boletines.json     corpus local: boletines 335, 334, 331, el regional de la RM y el glosario del curso
  src/corpus/regiones.json      cifras de las 16 regiones (boletines regionales del INE), cada fila con su URL
  src/corpus/banco_preguntas.json   las preguntas de prueba del curso (para /evaluar)
  src/datos/neon.ts             LA BASE DE DATOS (clase 8): Postgres + pgvector en Neon; tablas trozos y tasas_regionales
  src/datos/embeddings.ts       los vectores: gemini-embedding-001, 768 números por texto
  src/datos/indexar.ts          /indexar: trocea, vectoriza y guarda; carga las regiones
  src/rutas-datos.ts            las rutas de la clase 8: /indexar, /regiones, /evaluar, /exportar.csv
  src/mcp.ts                    el servidor MCP: ultima_tasa, buscar_en_boletines, estado_del_agente
frontend/
  lib/marca.ts                  nombre, lema, equipo y declaración corta (lo edita el equipo)
  lib/api.ts                    cómo el frontend habla con el backend (NEXT_PUBLIC_API_URL)
  app/globals.css               la identidad visual: colores y tipografías en :root
  app/page.tsx                  la portada: nota publicada + botón para correr el agente
  app/borradores/page.tsx       la mesa de edición: aprobar o rechazar con nombre y clave
  app/preguntar/page.tsx        preguntas de lectores (RAG) con fuentes y traza
  app/transparencia/page.tsx    declaración de uso de IA + estado del agente en vivo
  app/mapa/page.tsx             mapa regional (esqueleto para la clase 9; textos [ … ] del equipo)
docs/                           guías del curso (paso a paso, flujo Git, Jules, clase 8)
.github/                        CI "Verificar" y plantillas de issue y pull request
```

## Cómo hablar con este equipo

- Español neutro, sin jerga innecesaria. Si usas una palabra técnica (commit, rama, variable de entorno),
  defínela en media frase la primera vez.
- Antes de cambiar algo, di en una frase **qué vas a cambiar y por qué**.
- Después de cada cambio, di **qué archivo cambió** y **cómo verlo en producción** (URL concreta y paso de la
  traza).
- Nunca pidas, muestres ni escribas claves. Si hace falta una, el estudiante la escribe en el panel de
  Cloudflare.
- Si algo falla, explica primero la causa en lenguaje llano y después propone el arreglo. No arregles en
  silencio.
- No tomes decisiones editoriales por ellos: el objetivo, las reglas, la marca y los textos son del equipo.
  Propón, no impongas.
- No te adelantes al calendario (ver abajo): no actives el cron ni indexes en Neon salvo que lo pidan.

## Para Jules (y cualquier agente que trabaje en una máquina virtual)

- Entorno: Node 22. Instalar con `npm ci` en `backend/` y en `frontend/` (el `.npmrc` de `backend` trae
  `legacy-peer-deps=true`; no lo borres ni uses `npm install --force`).
- Antes de abrir el pull request: `npm run check` en `backend/` y `npm run build` en `frontend/` (con
  `NEXT_PUBLIC_API_URL=https://ejemplo.invalid`). Es lo mismo que corre la CI "Verificar".
- Un pull request por tarea, pequeño, con la plantilla completa: qué cambió, cómo verificarlo en producción
  (ruta y paso de la traza) y qué podría romperse.
- No toques `package-lock.json` salvo que la tarea agregue una dependencia; no cambies `name` ni `migrations`
  en `wrangler.jsonc`; no agregues claves ni archivos `.dev.vars` / `.env`.

## Tareas típicas, paso a paso

**Cambiar el objetivo o las reglas del agente** → editar el bloque "Lo que el equipo editorial quiere cambiar"
de `backend/src/agente/objetivo.md` (o la skill), commit en `main`, esperar el despliegue de Cloudflare
(1–2 minutos), abrir `<backend>/correr?forzar=1` y comparar el borrador nuevo con el anterior en
`<frontend>/borradores`. Una regla, un efecto medible.

**Agregar una herramienta** → copiar `_plantilla.ts` a `src/herramientas/<nombre>.ts`, completar nombre,
descripción (es lo que lee el modelo para decidir usarla), parámetros y `ejecutar`; registrarla en la lista de
`index.ts`; `npm run check`; pull request; al fusionar, forzar una corrida y mostrar en la traza el paso donde
el modelo la pidió. Si el modelo no la usa, el problema suele ser la descripción, no el código.

**Cambiar la marca o el aspecto** → `frontend/lib/marca.ts` y las variables de `app/globals.css`; commit en
`main`; Vercel redespliega solo.

**Cambiar el nombre del equipo en el backend** → `backend/wrangler.jsonc`, `vars.NOMBRE_EQUIPO`; commit.

**Leer qué hizo el agente** → la traza está en cada borrador (`<backend>/borradores/<id>` o en el frontend).
Cada paso dice si habló el modelo, si pidió una herramienta, qué devolvió y qué dijeron los límites.

**El RAG propio (clase 8)** → el estudiante crea un proyecto en Neon y guarda la cadena de conexión como el
secreto `DATABASE_URL` en Cloudflare (tú nunca la ves). Luego abre `<backend>/indexar?clave=<CLAVE_APROBACION>`:
crea las tablas, trocea y vectoriza el corpus y carga las regiones. `GET /` dice `rag: "vector"` cuando funciona.
Regla: **las cifras regionales salen de `tasas_regionales` (herramienta `tasa_por_region`); el texto, de
`trozos` (`buscar_en_boletines`)**. Para comparar búsquedas: `/evaluar?via=local` y `/evaluar?via=vector`.
Sin `DATABASE_URL` todo sigue funcionando por palabras.

**Conectar el servidor MCP de este agente a Claude Code** → agregar en `.mcp.json` una entrada
`{"type": "http", "url": "<URL del backend>/mcp"}` y reiniciar la sesión.

## Probar en local (opcional, solo si alguien tiene Node instalado)

`backend/`: copiar `.dev.vars.example` a `.dev.vars`, `npm ci`, `npx wrangler dev --port 8787`.
`frontend/`: `npm ci`, `npm run dev` (abre http://localhost:3000). Sin clave de Gemini, corre con el modelo
simulado. La memoria local queda en `backend/.wrangler/state` y sobrevive a reinicios.

## Calendario del curso (para no adelantarse)

- Clase 7 (23 oct): fork, despliegue conectado a Git, leer la traza; editar el objetivo; primera tarea a Jules.
- Clase 8 (30 oct): Sync fork; base de datos propia en Neon (`DATABASE_URL`) y `/indexar`; búsqueda por
  significado vs. por palabras (`/evaluar`); cifras regionales; activar el cron. Ver `docs/CLASE_8.md` y
  `docs/PASO_A_PASO_CLASE_8.md`. El mapa (`/mapa`) es de la clase 9: no lo anuncies antes.
- Clase 9 (6 nov): ampliar `limites.ts`; flujo borrador → aprobación → publicación; red teaming.
- Clase 10 (13 nov): página de transparencia completa; README del equipo; defensa.

## Convenciones

TypeScript estricto, nombres y comentarios en español, `npm run check` antes de cada commit en `backend/`,
mensajes de error pensados para que los lea una persona sin formación técnica. Mensajes de commit en español,
en una línea que diga qué cambió.
