# Topics que usamos

Para ordenar los mensajes usamos el prefijo `smartegg/{id}`. El valor `{id}` es el
código de la incubadora, por ejemplo `NODE-01`. Todos nuestros mensajes usan JSON.

Definimos los topics de la siguiente forma:

| Topic | Publicador | Suscriptores | QoS | Retained |
|---|---|---|---:|:---:|
| `smartegg/{id}/sensores/temperatura` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/sensores/humedad` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/telemetria` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/actuadores/estado` | Backend | Frontend, Grafana | 1 | Sí |
| `smartegg/{id}/alarmas/critica` | Backend | Frontend | 1 | Sí |
| `smartegg/{id}/status` | Backend/LWT | Frontend, Grafana | 1 | Sí |

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
  "occupied_slots": 8,
  "available_slots": 4,
  "recorded_at": "2026-09-04T18:30:00Z"
}
```

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

Cuando la alarma deja de estar activa publicamos un mensaje vacío retenido. Con esto
evitamos que el frontend siga mostrando una alarma anterior.

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
