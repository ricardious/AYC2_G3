# Topics que usamos

Para ordenar los mensajes usamos el prefijo `smartegg/{id}`. El valor `{id}` es el
código de la incubadora, por ejemplo `NODE-01`. El backend publica objetos JSON,
salvo el payload vacío usado para retirar una alarma crítica retenida.
Las fechas de ejemplo usan `Z` para UTC; Python normalmente serializa la misma
zona horaria como `+00:00` mediante `datetime.isoformat()`.

Definimos los topics de la siguiente forma:

| Topic | Publicador | Suscriptores | QoS | Retained |
|---|---|---|---:|:---:|
| `smartegg/{id}/sensores/temperatura` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/sensores/humedad` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/telemetria` | Backend | Frontend, Grafana | 0 | Sí para la última lectura persistida; no para el adelanto en vivo |
| `smartegg/{id}/actuadores/estado` | Backend | Frontend, Grafana | 1 | Sí |
| `smartegg/{id}/alarmas/critica` | Backend | Frontend, Grafana | 1 | Sí; se borra con payload vacío |
| `smartegg/{id}/acceso/eventos` | Backend | Grafana | 1 | No |
| `smartegg/{id}/status` | Backend/LWT | Frontend, Grafana | 1 | Sí |

El frontend recibe los eventos de acceso por el WebSocket de FastAPI, no por
`acceso/eventos`; su cuenta MQTT puede leer `telemetria`, `alarmas/critica`,
`status` y `actuadores/estado`, tal como establece [`config/acl`](config/acl). El healthcheck
de Compose publica `{"status":"ok"}` en `smartegg/healthcheck` con QoS 1,
sin retención y sin suscriptores de aplicación. No es un estado del nodo.
La prueba manual de [`README.md`](README.md) usa
`smartegg/diagnostico/manual`, también con QoS 1 y sin retención; ninguna
vista de la aplicación se suscribe a ese topic.
El backend publica `status` y registra el LWT sólo para el código definido en
`DEFAULT_INCUBATOR_CODE` (por defecto `NODE-01`); los demás topics de esta tabla
usan el código de la lectura o evento correspondiente.

## Formato de los mensajes

### Temperatura

Publicamos la última temperatura medida:

```json
{"value":37.6,"unit":"celsius","recorded_at":"2026-09-04T18:30:00Z"}
```

### Humedad

Publicamos la última humedad medida:

```json
{"value":58.2,"unit":"percent","recorded_at":"2026-09-04T18:30:00Z"}
```

### Telemetría consolidada

También enviamos una lectura completa para tener todos los valores en un solo mensaje:

```json
{
  "temperature_c": 37.6,
  "humidity_pct": 58.2,
  "door_open": false,
  "system_enabled": true,
  "sensor_ok": true,
  "occupied_slots": 3,
  "available_slots": 1,
  "recorded_at": "2026-09-04T18:30:00Z"
}
```

`door_open`, `system_enabled` y `sensor_ok` pueden ser `null` cuando la trama
de origen no informa ese estado. Para la ESP32 se publica primero una versión
en vivo, no retenida, directamente al leer el serial y antes de escribir en la
base de datos; esta versión omite `available_slots`. Después de persistirla se
publica el snapshot completo y retenido. El frontend ignora mensajes más
antiguos para que una escritura lenta no revierta la lectura actual.

### Estado de actuadores

En este topic enviamos el estado actual de los actuadores:

```json
{
  "heater": false,
  "fan": true,
  "servo_angle": 45,
  "buzzer": false,
  "recorded_at": "2026-09-04T18:30:00Z"
}
```

`servo_angle` puede ser `null` si aún no existe un valor registrado para el
servo. El topic comunica el estado observado, no una orden de accionamiento.

### Alarma crítica

Cuando detectamos una condición crítica publicamos:

```json
{
  "kind": "temperature_high",
  "severity": "critical",
  "message": "Sobrecalentamiento detectado",
  "value": 39.5,
  "occurred_at": "2026-09-04T18:30:00Z"
}
```

Sólo se publica aquí una alarma activa de severidad `critical`; las advertencias
quedan registradas en la base de datos. Cuando no hay alarma crítica, el
backend publica **cero bytes** con QoS 1 y retained: Mosquitto elimina el
último mensaje retenido y los suscriptores actuales despejan el aviso. Ese
payload vacío no es JSON.

### Disponibilidad y LWT

Al iniciar la conexión publicamos el nodo como disponible:

```json
{"status":"online","recorded_at":"2026-09-04T18:30:00Z"}
```

También configuramos este mensaje como LWT con QoS 1. Mosquitto lo publica si el backend
se desconecta de forma inesperada:

```json
{"status":"offline","reason":"unexpected_disconnect"}
```

El LWT no lleva `recorded_at`: lo registra el backend antes de conectarse y
Mosquitto lo emite sólo si la conexión cae abruptamente. Al terminar de forma
ordenada, el backend publica un estado diferente:

```json
{"status":"offline","recorded_at":"2026-09-04T18:30:00Z","reason":"graceful_shutdown"}
```

### Acceso RFID y puerta

Cada autorización, apertura y cierre genera un evento no retenido:

```json
{
  "event": "door_closed",
  "session_id": 12,
  "operator_id": 1,
  "method": "rfid",
  "recorded_at": "2026-09-07T18:10:00Z"
}
```

`authorized`, `door_opened`, `door_closed` y `access_cancelled` usan los
campos `event`, `session_id`, `method` y `recorded_at`; los tres primeros
incluyen también `operator_id`. Para `rejected` se publican `event`, `method`,
`reason` y `recorded_at`. Si llega un evento de puerta con sesión inválida,
el payload lleva `event: "invalid_session"`, `session_id` y `recorded_at`.
Los emisores son tanto el puente serial como la ruta HTTP de acceso; la
autorización HTTP no publica un `rejected` cuando la petición devuelve error.

Ejemplos de las variantes del puente serial:

```json
{"event":"rejected","method":"rfid","reason":"card_not_authorized","recorded_at":"2026-09-07T18:10:00Z"}
```

```json
{"event":"access_cancelled","session_id":12,"method":"rfid","recorded_at":"2026-09-07T18:10:00Z"}
```

```json
{"event":"invalid_session","session_id":12,"recorded_at":"2026-09-07T18:10:00Z"}
```

La ruta HTTP publica `access_cancelled` con `operator_id` adicional, porque
conoce al operador de la sesión.
