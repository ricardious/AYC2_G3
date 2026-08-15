# Frontend — SmartEgg

Aplicación web de monitoreo y control. React + Vite + Tailwind CSS v4.

## Puesta en marcha

Con el backend ya corriendo en el puerto 4000:

```bash
npm install
```
```bash
npm run dev
```

Abre <http://localhost:5173>. Vite también imprime la dirección de red (`http://192.168.x.x:5173`),
que es la que se usa **desde el celular o la tablet**.

Credenciales de prueba (creadas por `npm run seed` del backend):

| Usuario | PIN |
|---|---|
| `carlos.perez` | `2022` |
| `agronomo` | `1234` |

## Estructura

```
src/
├── main.jsx / App.jsx        arranque y rutas
├── index.css                 sistema de diseño (tema y componentes)
├── context/AuthContext.jsx   sesión del técnico
├── hooks/useTelemetria.js    estado en vivo (HTTP inicial + WebSocket)
├── services/
│   ├── api.js                cliente REST con manejo de errores
│   └── socket.js             conexión Socket.IO
├── components/
│   ├── Layout.jsx            barra lateral, cajón móvil, encabezado
│   ├── ui.jsx                Panel · Campo · Modal · Cargando · …
│   └── dashboard/            TarjetaMetrica · BandejaHuevos ·
│                             GraficaAmbiente · PanelControl · BannerAlarma
├── pages/                    Login · Dashboard · Lotes · Huevos ·
│                             Sensores · Alarmas · Reportes · Configuracion
└── utils/
    ├── reportePdf.js         generación del informe PDF
    └── fechas.js             fechas en hora local (no UTC)
```

## Pantallas

| Ruta | Qué muestra |
|---|---|
| `/login` | Acceso del técnico |
| `/` | Panel en tiempo real: métricas, gráfica, bandeja y control de actuadores |
| `/lotes` | CRUD de lotes de incubación |
| `/huevos` | Fichas de identificación del huevo rotulado |
| `/sensores` | Qué sensores están activos y diagnóstico del puerto serie |
| `/alarmas` | Historial de alarmas y bitácora |
| `/reportes` | Vista previa y descarga automática del PDF |
| `/configuracion` | Umbrales que se envían al firmware |

## Tiempo real

`useTelemetria` carga el estado inicial por HTTP y después escucha el evento `telemetria`
del WebSocket (≈1 vez por segundo). Mantiene una ventana deslizante de 120 puntos para la
gráfica, que es el equivalente web del Serial Plotter.

## Diseño responsivo

- **≥1024 px:** barra lateral fija.
- **<1024 px:** cajón deslizante con encabezado propio que muestra la temperatura actual.
- Las tablas van dentro de contenedores con desplazamiento horizontal propio, así la página
  nunca se desplaza de lado.
- Los modales se anclan abajo en móvil (patrón *bottom sheet*).

Verificado a 375×812 sin desbordes horizontales.

## Informe PDF

`utils/reportePdf.js` arma el documento con jsPDF + autoTable. Incluye logo vectorial,
datos del técnico autenticado, resumen ambiental, historial hora por hora, lotes, ocupación
de la bandeja, registro de alarmas y bitácora. Se descarga automáticamente al presionar el
botón. Salida típica: 4 páginas.

## Notas técnicas

- **Tailwind v4**: `@apply` sólo acepta utilidades reales, no clases propias. Por eso en
  `index.css` la base de botones e insignias se declara con selectores agrupados.
- **Fechas**: nunca usar `toISOString().slice(0,10)` — devuelve UTC y en Guatemala adelanta
  un día después de las 18:00. Usar `hoyLocal()` de `utils/fechas.js`.
- **jsPDF**: se importa con `{ jsPDF }` y el plugin se engancha con `applyPlugin(jsPDF)`,
  para no depender del comportamiento del empaquetador.

## Compilar para producción

```bash
npm run build
```

Genera `dist/`. Para servirlo desde otra máquina, defina `VITE_API_URL` con la dirección
del backend antes de compilar.
