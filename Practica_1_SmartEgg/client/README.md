# SmartEgg · Cliente

Consola web de la incubadora inteligente **SmartEgg** (Práctica 1 · Arquitectura
de Computadoras y Ensambladores 2). Reconstruye el diseño
`SmartEgg Control Core` como componentes React/Next.js, sin iframes ni HTML
embebido.

```bash
pnpm dev     # http://localhost:3000
pnpm build
pnpm lint
```

## Conexión con el backend

La consola ya no genera telemetría simulada. Al iniciar solicita las credenciales del
técnico, carga el estado y las últimas 240 lecturas por REST y abre un WebSocket para las
nuevas lecturas. Si el WebSocket se interrumpe, consulta `/state` cada 2 segundos y trata
de reconectarlo; mientras está conectado conserva una sincronización REST cada 10
segundos para actuadores, sensores y alarmas.

Copie la configuración opcional:

```bash
cp .env.example .env.local
```

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_API_URL` | Origen de FastAPI, por ejemplo `http://localhost:8000` |
| `NEXT_PUBLIC_INCUBATOR_ID` | Incubadora preferida; si se omite se usa la primera |

Si `NEXT_PUBLIC_API_URL` no está definida, el navegador usa automáticamente su propio
hostname con el puerto `8000`. Así, al visitar `http://192.168.1.20:3000` desde un móvil,
la API se busca en `http://192.168.1.20:8000` y no en el `localhost` del teléfono.

Arranque ambos procesos en terminales separadas:

```bash
cd ../server
uv run fastapi dev --host 0.0.0.0

cd ../client
pnpm dev --hostname 0.0.0.0
```

El origen exacto del frontend debe estar autorizado en `SMARTEGG_CORS_ORIGINS` dentro
de `server/.env`. Antes del primer acceso también deben existir el técnico y al menos una
incubadora; ambos pueden crearse desde `http://localhost:8000/docs`. El código de la
incubadora debe coincidir con el enviado por el firmware (`NODE-01` por defecto).

Flujo utilizado:

```text
Arduino --Serial USB--> FastAPI --REST inicial/respaldo--> Next.js
                              `--WebSocket en vivo-------> Next.js
```

## Arquitectura

### Atomic Design

```
components/
  atoms/       BackdropLayers · DataField · EggShape · GhostButton
               SectionKicker · StatusDot
  molecules/   ActuatorRow · ChamberEgg · ComponentHotspot · DetailRowItem
               EggChip · EggTooltip · EventRow · HeaderStat · NavItem
               ParticleField · SensorRow · SetpointSlider · StationEgg
  organisms/   ActuatorPanel · CriticalAlertBanner · EventFeed · HistoryCharts
               HistoryOverview · HumidityColumn · IncubatorChamber · NodePanel
               ReportSheet · ReportSidebar · ScreenHeader · SelectionPanel
               SensorPanel · SetpointPanel · SideNav · SpecimenStation
               SpecimenStrip · StationSummary · TelemetryChart
               TemperatureGauge · TrayAngleDial
  templates/   ConsoleStage — fondo, disposición, nav, cabecera, inspector
               StageBlock — un instrumento y su sitio
  screens/     ControlCoreScreen · IncubationScreen · HistoryScreen
               ReportsScreen · SettingsScreen · SmartEggDashboard
```

`screens/` corresponde al quinto nivel de Atomic Design («pages»); se nombra así
para no confundirlo con el enrutamiento de Next.js. `app/page.tsx` sólo monta
`<SmartEggDashboard />`.

**Las coordenadas de composición viven en las pantallas**, no en los organismos:
cada organismo se dimensiona a sí mismo pero no sabe dónde va, así que puede
reutilizarse en cualquier pantalla. Se declaran una sola vez, en un
`<StageBlock top={…} x={…} anchor="…">`, y es el bloque quien decide qué hacer
con ellas según la disposición activa.

### Dominio y estado

```
lib/smartegg/   types · theme (refs a los tokens) · config · catalog
                telemetry (series y reloj) · geometry (paths SVG)
                derive (proyecciones puras estado → modelo de vista)
lib/state/      SmartEggProvider · hooks
lib/hooks/      useStageScale · useIsomorphicLayoutEffect
lib/cx.ts       unión de clases condicionales
```

Estado con **Context + `useReducer`**, sin dependencias externas, dividido en dos
contextos:

- `SmartEggContext` — pantalla activa, selección, hover y modo crítico.
- `TelemetryContext` — serie en vivo y reloj, que se refrescan cada 2.2 s. Al
  estar separados, el tick sólo re-renderiza medidores y gráficas.

La telemetría se genera con un LCG sembrado, de modo que el servidor y el
cliente producen el mismo primer render (sin desajustes de hidratación); sólo el
tick posterior introduce aleatoriedad real.

`derive.ts` contiene funciones puras `(estado, config) → modelo de vista`, así
que la lógica del panel es comprobable sin DOM.

### Props públicas

`<SmartEggDashboard />` expone los cuatro ajustes del diseño original:
`criticalMode`, `airflowIntensity`, `showParticles` y `technician`.

### Estilos

Tailwind CSS v4 con los estilos organizados por responsabilidad:

```
styles/
  globals.css      punto de entrada: importa Tailwind y el resto
  theme.css        @theme — color, tipografía y movimiento (única fuente)
  animations.css   @keyframes
  base.css         @layer base — reset y ajustes de la consola
  components.css   @layer components — .kicker, .caption, .btn-ghost*
  utilities.css    @utility — los «materiales» del diseño
```

Los tokens de `theme.css` generan las utilidades semánticas que usa el JSX
(`text-primary`, `border-divider`, `bg-panel`, `animate-scan`). Los degradados
y sombras que describen un objeto físico —el cristal de la cámara, el relleno
del huevo, la lámina del reporte— se nombran una vez en `utilities.css`, así
que los componentes se quedan sólo con la composición.

Los colores que dependen del estado (un actuador que se pone en rojo con la
alarma) no se pueden escribir como clase estática, así que se inyectan como
custom property y se consumen con `text-[var(--accent)]`. `lib/smartegg/theme.ts`
devuelve referencias `var(--color-*)` para que sigan viniendo del mismo token.

Dos detalles deliberados, documentados en los propios archivos:

- Las reglas base de la consola viven en `@layer base`, de modo que cualquier
  utilidad de Tailwind tenga siempre la última palabra sobre ellas.
- La consola reconstruye un documento sin reset, así que su subárbol vuelve a
  `content-box`, `line-height: normal` y SVG en línea: son los tres valores por
  defecto que cambia el preflight y de los que depende la geometría del diseño.

### Comportamiento responsivo

La consola tiene dos disposiciones y **las elige la hoja de estilos**, no
JavaScript: `--breakpoint-console: 1440px` en `styles/theme.css` genera el
prefijo `console:`, que es el **plano**; sin prefijo es la **pila**.

Todo el marcado es común a las dos. Cada elemento lleva su doble descripción al
lado —`border-b console:border-r`, `flex-col console:flex-row`— así que no hay
una rama de JavaScript que mantener sincronizada con la otra, ni estado de
disposición que hidratar, y el cambio de tamaño no espera a un `useEffect`.

El punto de ruptura está en 1440 y no en el ancho del plano (1680) porque lo que
manda es la tipografía: la etiqueta más pequeña del diseño mide 8 px y el plano
se escala para caber en alto, así que en una ventana de 900 px la escala es
0.876 y esa etiqueta cae a 7 px. Por debajo de 1440 la escala la deja en 5, y
ahí la pila —que dibuja a 1:1— se lee mejor.

Sólo queda una medida en TypeScript, en `useStageScale`: el factor de escala del
plano y su ancho elástico. Es la excepción porque CSS no sabe dividir un
viewport entre una longitud para obtener el número sin unidad que necesita
`scale()`. El hook publica los dos valores como custom properties y la hoja de
estilos hace el resto.

#### Plano

La composición vive en un plano que se escala uniformemente hasta caber en la
ventana, igual que el diseño original: el instrumental nunca se reordena, sólo
cambia de tamaño. La consola ocupa exactamente el alto de la ventana y no
produce scroll de página; sólo por debajo de la escala mínima (0.42) el
escenario se vuelve desplazable en lugar de recortarse.

De los dos ejes del plano sólo el alto está fijado (1000 px). El ancho es
elástico: `useStageScale` lo estira hasta cubrir la ventana y `ConsoleStage`
publica el sobrante en `--stage-slack`. Sin eso, una ventana más apaisada que
la composición —casi todas— dejaría bandas vacías a los lados: 170 px por lado
en 1920 × 964.

El estirado tiene tope (`STAGE_MAX_STRETCH`, 1.3 × 1680 = 2184). Sin él, un
monitor de 2560 abría huecos de 630 px entre columnas de 363: más vacío dentro
de la composición que fuera. Pasado el tope el sobrante vuelve a ser banda
exterior, que se lee como margen y no como agujero.

Las pantallas reparten ese sobrante con tres anclajes de columna, definidos en
`styles/utilities.css`:

| Anclaje        | Desplazamiento     | Uso                                  |
| -------------- | ------------------ | ------------------------------------ |
| `stage-left`   | ninguno            | columna izquierda, pegada al riel    |
| `stage-center` | mitad del sobrante | columna central                      |
| `stage-right`  | todo el sobrante   | columna derecha                      |

La coordenada del diseño se pasa en `--stage-x`, así que con `--stage-slack: 0`
los tres anclajes caen exactamente donde la composición original los pone.
Ningún instrumento cambia de tamaño ni se deforma: lo único que crece son los
huecos entre columnas.

Los paneles de la columna derecha del Centro de control llevan además `right-10`
en lugar de un ancho fijo, de modo que terminan en el mismo margen que la
cabecera. El diseño los cortaba 114 px antes, un hueco que sólo se nota desde
que el riel llega al borde izquierdo.

#### Pila

Por debajo del punto de ruptura el plano se abandona y la consola se reordena:

- el riel pasa a barra superior con la marca, el estado del nodo y una tira de
  pestañas desplazable;
- las constantes de la cabecera se reparten en rejilla;
- los instrumentos caen en columna —dos desde `md:`— en el orden en que la
  pantalla los declara, y la página hace scroll normal;
- el inspector deja de ser un panel lateral y sube como hoja fija inferior;
- los controles alcanzan los 44 px de un objetivo táctil: la fila de sensores
  mide 11 px de alto sobre el plano, que con un ratón basta y con un dedo no.

**Los instrumentos se dibujan a 1:1 en las dos disposiciones.** Encogerlos para
que cupieran era la salida evidente y resultó peor: la urna a 0.55 dejaba su
rótulo interno en 4.4 px, justo lo que la pila viene a evitar. Los que no caben
—la urna mide 548, el banco 1120— se desplazan dentro de su propia tarjeta, y
los que sobrepasan media columna ocupan las dos (`wide`).

Los rótulos de la urna, que salen 60 px por cada lado hasta sus guías, se ocultan
en pila; lo que anotan está debajo en los paneles de actuadores y sensores, que
además son seleccionables. Las motas del fondo tampoco se dibujan.

`prefers-reduced-motion` desactiva el movimiento ambiental.
