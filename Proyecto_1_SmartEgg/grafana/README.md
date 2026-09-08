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
Los dashboards aparecen en la carpeta **SmartEgg**.

Para ver el historial primero aplicamos las migraciones desde `server` con:

```bash
uv run alembic upgrade head
```

El usuario `grafana_reader` solamente tiene permisos de lectura en PostgreSQL. El script
que crea este usuario se ejecuta cuando se crea por primera vez el volumen de la base de
datos.

## SmartEgg · Tiempo real

Se alimenta del broker MQTT y se refresca cada 5 segundos. El nodo se elige con la
variable `node_code`, que por defecto vale `NODE-01`.

| Fila | Panel | Topic | Qué muestra |
|---|---|---|---|
| Estado del nodo | Estado del nodo | `status` | `online` / `offline` publicado por el LWT |
| Estado del nodo | Temperatura actual | `sensores/temperatura` | Gauge con el rango óptimo 37 – 38 °C y el crítico en 39 °C |
| Estado del nodo | Humedad actual | `sensores/humedad` | Gauge con el rango óptimo 50 – 65 % |
| Estado del nodo | Puerta | `telemetria` | ABIERTA o CERRADA según el sensor |
| Telemetría y actuadores | Actuadores | `actuadores/estado` | Calefactor, ventilador, buzzer y ángulo de la bandeja |
| Telemetría y actuadores | Telemetría en vivo | `telemetria` | Temperatura y humedad con ejes independientes |
| Telemetría y actuadores | Ocupación de la cámara | `telemetria` | Posiciones ocupadas y disponibles |
| Alarmas y accesos | Alarma crítica | `alarmas/critica` | Severidad con color; queda vacío al resolverse |
| Alarmas y accesos | Eventos de acceso | `acceso/eventos` | Autorizaciones RFID, aperturas y cierres |

## SmartEgg · Histórico

Se alimenta de PostgreSQL con los rangos de tiempo del selector (última hora, 24 horas,
última semana). Tiene cuatro variables: **Incubadora**, **Lote**, **Huevo** y
**Operador**.

| Fila | Panel | Qué muestra |
|---|---|---|
| Resumen del rango | Temperatura y Humedad · mín / máx / promedio | Los tres agregados del nodo en el rango |
| Resumen del rango | Muestras registradas · Alarmas activas | Volumen de lecturas y alarmas sin resolver |
| Resumen del rango | Aperturas y Cierres de puerta | Conteo de aperturas y de cierres confirmados |
| Tendencias | Historial de temperatura y humedad | Series con líneas punteadas en los umbrales |
| Tendencias | Ocupación de posiciones | Posiciones ocupadas y disponibles |
| Tendencias | Rotaciones de bandeja | Rotaciones agrupadas por intervalo |
| Por lote y huevo | Lote · Temperatura y Humedad | Mín, máx y promedio mientras el lote estuvo dentro |
| Por lote y huevo | Huevo · Temperatura y Humedad | Lo mismo para el huevo seleccionado |
| Por lote y huevo | Resumen por lote | Tabla con los agregados de todos los lotes |
| Puerta y accesos | Aperturas por operador | Cuántas veces abrió cada operador |
| Puerta y accesos | Aperturas por método de acceso | Tarjeta RFID, huella, llave o contraseña |
| Puerta y accesos | Huevos ingresados y retirados | Suma de huevos que entraron y salieron |
| Puerta y accesos | Operaciones de puerta | Auditoría filtrable por operador |
| Alarmas | Alarmas por tipo | Conteo por tipo de condición |
| Alarmas | Historial de alarmas | Severidad, estado y duración de cada alarma |

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
├── dashboards/
│   ├── smartegg-historical.json
│   └── smartegg-realtime.json
└── provisioning/
    ├── dashboards/smartegg.yml
    └── datasources/smartegg.yml
```
