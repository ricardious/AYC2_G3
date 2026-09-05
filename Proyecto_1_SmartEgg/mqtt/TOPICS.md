# Topics MQTT de SmartEgg

Todos los payloads usan JSON UTF-8. `{id}` representa el código único de la incubadora,
por ejemplo `NODE-01`.

| Topic | Publicador | Suscriptores | QoS | Retained |
|---|---|---|---:|:---:|
| `smartegg/{id}/sensores/temperatura` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/sensores/humedad` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/telemetria` | Backend | Grafana | 0 | Sí |
| `smartegg/{id}/actuadores/estado` | Backend | Frontend, Grafana | 1 | Sí |
| `smartegg/{id}/alarmas/critica` | Backend | Frontend | 1 | Sí |
| `smartegg/{id}/status` | Backend/LWT | Frontend, Grafana | 1 | Sí |

## Payloads

### Temperatura

```json
{"value":37.6,"unit":"celsius","recorded_at":"2026-09-04T18:30:00Z"}
```

### Humedad

```json
{"value":58.2,"unit":"percent","recorded_at":"2026-09-04T18:30:00Z"}
```

### Telemetría consolidada

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

```json
{
  "kind": "temperature_high",
  "severity": "critical",
  "message": "Sobrecalentamiento detectado",
  "value": 39.5,
  "occurred_at": "2026-09-04T18:30:00Z"
}
```

Cuando no existe una alarma crítica activa, el backend publica un payload vacío retenido
para limpiar el último estado del topic.

### Disponibilidad y LWT

```json
{"status":"online","recorded_at":"2026-09-04T18:30:00Z"}
```

Al conectarse, el backend configura como LWT el mensaje retenido siguiente con QoS 1:

```json
{"status":"offline","reason":"unexpected_disconnect"}
```
