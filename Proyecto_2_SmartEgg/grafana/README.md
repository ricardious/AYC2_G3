# Grafana

Usamos Grafana local para visualizar los datos de SmartEgg. Dejamos dos datasources
configurados automáticamente:

- PostgreSQL para consultar el historial guardado.
- MQTT para observar los mensajes que llegan en tiempo real.

## Iniciar

Desde la carpeta `Proyecto_1_SmartEgg` ejecutamos:

```bash
cp .env.example .env
docker compose up -d grafana
```

Entramos en `http://localhost:3001` con el usuario y la contraseña definidos en `.env`.
La portada es **SmartEgg · Centro de control** y los demás dashboards aparecen en la
carpeta **SmartEgg**.

Para ver el historial primero aplicamos las migraciones desde `server` con:

```bash
uv run alembic upgrade head
```

El usuario `grafana_reader` solamente tiene permisos de lectura en PostgreSQL. El script
que crea este usuario se ejecuta cuando se crea por primera vez el volumen de la base de
datos.

## Identidad visual

Grafana se construye con [`Dockerfile`](Dockerfile) a partir de `grafana/grafana:13.2.0`
para que tenga la misma identidad que la consola web:

- **Logo y favicon** del huevo con estratos (`branding/`), y el título de la pestaña
  `SmartEgg · Observatorio`.
- **Hoja de estilos** [`branding/smartegg.css`](branding/smartegg.css): fondo negro azulado
  con retícula cian, paneles de vidrio, Space Grotesk en títulos e IBM Plex Mono en
  datos. Usa solo selectores estables (`data-testid` y etiquetas de clase de Grafana);
  si una versión nueva los cambia, la página vuelve al tema normal sin romperse.
- **Paleta** de la consola en todos los paneles: cian `#5fe3e8` (humedad, datos),
  ámbar `#f0a44a` (calor), verde `#6fe2a0` (óptimo), rojo `#ff5a4d` (alarma).
- **Plugins** instalados en la imagen con versión fija, en `/opt/smartegg/plugins`:

| Plugin | Versión | Uso |
|---|---|---|
| `grafana-mqtt-datasource` | 1.3.6 | Datos en vivo del broker |
| `marcusolsson-dynamictext-panel` (Business Text) | 6.3.0 | Encabezado, tarjetas de estado, visión y bloqueo con HTML propio |
| `volkovlabs-echarts-panel` (Business Charts) | 7.2.5 | Gauges con forma de huevo y puntaje de anomalías |
| `grafana-polystat-panel` | 2.1.16 | Disponible para estados en hexágonos |
| `grafana-clock-panel` | 3.2.4 | Reloj de la portada (hora de Guatemala) |

Business Text necesita conservar `class` y `style` en su HTML, por eso Compose define
`GF_PANELS_DISABLE_SANITIZE_HTML=true`. Es seguro aquí porque solo el administrador
puede editar paneles y los dashboards vienen de archivos versionados.

Cada dashboard empieza con el mismo encabezado y una navegación entre los cuatro.

## SmartEgg · Centro de control

Portada (`smartegg-centro`), en vivo por MQTT. Cubre la salida de los modelos y el estado
normal o bloqueado que pide la Fase 3.

| Fila | Panel | Fuente | Qué muestra |
|---|---|---|---|
| — | Estado del sistema | `status`, `sistema/estado`, `telemetria`, `actuadores/estado`, `vision/estado`, `ml/estado` | Ocho tarjetas: nodo, sistema normal o bloqueado, puerta, calefactor, ventilador, buzzer y los servicios de visión y anomalías |
| Condiciones | Temperatura · Humedad | `sensores/*` | Gauges con silueta de huevo y bandas óptimas |
| Condiciones | Temperatura en vivo | `sensores/temperatura` | Serie con la banda 37 – 38 °C |
| Inteligencia | Visión | `vision/resultado` | Clase de la última foto, confianza, probabilidades, ventana de 5 fotos y aviso de objeto confirmado |
| Inteligencia | Detector de anomalías | `ml/anomalia` | Puntaje LOF (escala log) con el umbral; los puntos sobre el umbral salen en rojo |
| Inteligencia | Estado normal / bloqueado | `sistema/estado` | Escudo verde o candado rojo, motivo y cómo desbloquear |
| Historial | Bloqueos del sistema | `telemetry_readings.system_locked` | Línea de tiempo normal / bloqueado |
| Historial | Puntaje de anomalías guardado | `anomaly_scores` | Puntajes guardados con el umbral |

Un mensaje retenido de estado llega una sola vez y el plugin MQTT puede perderlo si el
panel se suscribe un instante tarde. Por eso un servicio cuenta como en línea si su
estado lo dice **o** si su flujo de datos (`telemetria`, `vision/resultado`,
`ml/anomalia`) trajo mensajes en los últimos 15 s.

## SmartEgg · Tiempo real

Se alimenta del broker MQTT. Los paneles se actualizan solos con cada mensaje, por eso el
dashboard no tiene refresco automático: refrescar cada pocos segundos vuelve a lanzar las
suscripciones y deja los paneles vacíos. El nodo se elige con la variable `node_code`, que
por defecto vale `NODE-01`.

| Fila | Panel | Topic | Qué muestra |
|---|---|---|---|
| Estado del nodo | Nodo | `status` | `EN LÍNEA` / `DESCONECTADO` publicado por el LWT |
| Estado del nodo | Temperatura · Humedad | `sensores/*` | Valor actual con la tendencia de fondo |
| Estado del nodo | Puerta | `telemetria` | ABIERTA o CERRADA según el final de carrera |
| Estado del nodo | Ocupación de la bandeja | `telemetria` | Posiciones ocupadas y libres |
| Condiciones en vivo | Temperatura actual · en vivo | `sensores/temperatura` | Gauge y serie con la banda óptima 37 – 38 °C y la zona crítica desde 39 °C |
| Condiciones en vivo | Humedad actual · en vivo | `sensores/humedad` | Gauge y serie con la banda óptima 50 – 65 % |
| Actuadores y sistema | Calefactor · Ventilador · Buzzer · Bandeja | `actuadores/estado` | Estado actual de cada actuador |
| Actuadores y sistema | Línea de tiempo del sistema | `actuadores/estado`, `telemetria` | Actuadores, puerta, sensor y sistema a lo largo del tiempo |
| Actuadores y sistema | Posición de la bandeja | `actuadores/estado` | Ángulo del servomotor |
| Alarmas y accesos | Alarma crítica | `alarmas/critica` | Severidad con color; queda vacío al resolverse |
| Alarmas y accesos | Eventos de acceso | `acceso/eventos` | Autorizaciones RFID, aperturas y cierres |

## SmartEgg · Histórico

Se alimenta de PostgreSQL con los rangos de tiempo del selector (última hora, 24 horas,
última semana). Tiene cuatro variables: **Incubadora**, **Lote**, **Huevo** y
**Operador**. Los límites óptimos y críticos se leen de `incubator_configs`.

| Fila | Panel | Qué muestra |
|---|---|---|
| Resumen del rango | Estado del nodo | En línea o sin conexión según el último reporte |
| Resumen del rango | Temperatura · Humedad promedio | Promedio del rango con la tendencia de fondo |
| Resumen del rango | Tiempo en rango óptimo | Porcentaje de lecturas con temperatura y humedad dentro de los límites |
| Resumen del rango | Muestras registradas · Alarmas activas | Volumen de lecturas y alarmas sin resolver |
| Condiciones ambientales | Temperatura · Humedad | Promedio por intervalo con sombra mín / máx y bandas óptima y crítica |
| Condiciones ambientales | Tiempo por zona | Porcentaje del rango en zona baja, óptima, alta o crítica |
| Condiciones ambientales | Línea de tiempo de la cámara | Zona térmica, humedad, puerta, sensor y sistema por intervalo |
| Operación de la incubadora | Ocupación · Posiciones | Ocupación actual y su evolución apilada |
| Operación de la incubadora | Rotaciones de bandeja | Rotaciones por intervalo con el total del rango |
| Operación de la incubadora | Última lectura · Huevos en incubación | Frescura de los datos y huevos activos |
| Por lote y huevo | Lote · Huevo | Mín, promedio y máx mientras el lote o el huevo estuvo dentro |
| Por lote y huevo | Resumen por lote | Agregados de cada lote con el avance hasta la eclosión |
| Puerta y accesos | Aperturas · Cierres · Tiempo medio abierta | Actividad de la puerta en el rango |
| Puerta y accesos | Huevos ingresados · retirados · Operadores activos | Movimiento de huevos y operadores distintos |
| Puerta y accesos | Aperturas por operador · Método · Tipo de operación | Distribución de las aperturas |
| Puerta y accesos | Operaciones de puerta | Auditoría filtrable por operador |
| Alarmas | En el rango · Críticas · Tiempo medio de resolución · Reconocidas | Indicadores de alarmas |
| Alarmas | Alarmas por tipo · Historial de alarmas | Conteo por condición y detalle con severidad, estado y duración |

Las series de temperatura y humedad llevan dos anotaciones sobrepuestas: las **alarmas**
en rojo y las **aperturas de puerta** en naranja, ambas dibujadas como región desde que
empiezan hasta que se resuelven o se cierra la puerta.

Las consultas de todos los paneles están en
[`db/grafana_queries.sql`](../db/grafana_queries.sql).

## MQTT local o en AWS

En local dejamos esta dirección:

```env
GRAFANA_MQTT_URI=tcp://broker:1883
```

Cuando el broker esté en AWS cambiamos `GRAFANA_MQTT_URI` por su dirección externa. Si
activamos TLS también actualizamos la configuración del datasource en
`provisioning/datasources/smartegg.yml`.

El datasource MQTT muestra datos desde que el dashboard está abierto. Para consultar
datos anteriores usamos el dashboard conectado a PostgreSQL.

## Verificar

Con la plataforma arriba comprobamos el estado de los dos datasources:

```bash
curl -s -u admin:$GRAFANA_ADMIN_PASSWORD \
  -X POST http://localhost:3001/api/datasources/uid/smartegg-postgres/health
curl -s -u admin:$GRAFANA_ADMIN_PASSWORD \
  -X POST http://localhost:3001/api/datasources/uid/smartegg-mqtt/health
```

Ambos deben responder `"status": "OK"`. Si el histórico aparece vacío, revisamos que el
puente serial esté recibiendo tramas o generamos datos con
`server/scripts/simulate_telemetry.py`.

## Archivos

```text
grafana/
├── Dockerfile
├── branding/
│   ├── apple-touch-icon.png
│   ├── fav32.png
│   ├── smartegg-mark.svg
│   └── smartegg.css
├── dashboards/
│   ├── smartegg-centro.json
│   ├── smartegg-energia.json
│   ├── smartegg-historical.json
│   └── smartegg-realtime.json
└── provisioning/
    ├── alerting/smartegg-consumo.yml
    ├── dashboards/smartegg.yml
    └── datasources/smartegg.yml
```

## Consumo eléctrico

El tablero **SmartEgg · Consumo eléctrico** (`smartegg-energia`) lee la tabla
`energy_samples` que llena el backend con cada lectura: potencia actual, energía
y costo del día, uso del límite diario, promedio de la última hora, potencia por
componente, energía por día y las alarmas de consumo. El cálculo está explicado
en [`docs/CONSUMO_ELECTRICO.md`](../docs/CONSUMO_ELECTRICO.md).

La regla de alerta **Consumo eléctrico anómalo o límite superado**
(`provisioning/alerting/smartegg-consumo.yml`) se evalúa cada minuto y pasa a
*firing* cuando lleva 1 minuto abierta una alarma `energy_anomaly` o
`energy_limit`. Se ve en *Alerting → Alert rules*, carpeta SmartEgg.
