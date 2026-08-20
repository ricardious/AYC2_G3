# Protocolo Serial SmartEgg

Transporte: UART/USB del Arduino Uno R3, `115200 8N1`, una trama por línea (`\n`).
No se usa `String` ni JSON para telemetría, reduciendo el consumo de SRAM.

## Tramas Arduino → computadora

Formato general:

```text
CLAVE:valor,CLAVE:valor,...
```

Todos los valores son numéricos. Esto permite que la misma salida sea consumida por:

- Arduino Serial Plotter;
- `SerialBridge` del backend, que usa `NODE-01` como nodo predeterminado;
- cualquier lector CSV sencillo.

Ejemplo:

```text
MSG:1,TEMP:37.52,HUM:58.1,DOOR:0,SLOTS:3,HEATER:0,FAN:0,SERVO:-45,BUZZER:0,POWER:1,SENSOR:1
```

### Tipos de mensaje (`MSG`)

| Código | Tipo | Cuándo se envía |
|---:|---|---|
| 1 | Telemetría | Cada 2 segundos |
| 2 | Estado | Cambio de actuadores |
| 3 | Evento | Botón, puerta, rotación, configuración o recuperación |
| 4 | Error | DHT, comando/configuración o buffer Serial inválido |

Los mensajes 3 agregan `EVENT:<código>` y los 4 agregan `ERROR:<código>`.

Eventos: `1` arranque, `2` encendido, `3` apagado, `4` puerta abierta,
`5` puerta cerrada, `6` rotación, `7` configuración actualizada,
`8` comando de actuador y `9` DHT recuperado.

Errores: `1` lectura DHT, `2` configuración inválida, `3` comando desconocido,
`4` línea Serial demasiado larga, `5` comando rechazado porque el sistema está apagado
y `6` memoria insuficiente para crear las tareas. Si el DHT nunca produjo una lectura válida, la trama
de error sólo contiene `MSG`, `ERROR` y `SENSOR`; no se fabrican valores ambientales.

### Campos

| Campo | Significado |
|---|---|
| `TEMP` | Temperatura en °C |
| `HUM` | Humedad relativa en % |
| `DOOR` | Final de carrera de puerta (`1` abierta) |
| `SLOTS` | Espacios ocupados, de 0 a 4 |
| `HEATER` | Estado efectivo del relé de calefacción |
| `FAN` | Estado efectivo del relé CH2 del ventilador de 5 V |
| `SERVO` | Ángulo firmado respecto del centro: −45, 0 o +45 |
| `BUZZER` | Estado efectivo de alarma |
| `POWER` | Sistema lógico habilitado por la posición de la palanca |
| `SENSOR` | Última lectura DHT saludable |

## Comandos computadora → Arduino

El firmware acepta los JSON compactos que ya emite `server/`. Cada comando termina en
`\n`; el buffer máximo es de 255 caracteres.

Rotación manual:

```json
{"type":"rotate","angle_degrees":-45}
```

Actuador manual o regreso a automático:

```json
{"type":"actuator","kind":"fan","enabled":true,"mode":"manual","value":null}
{"type":"actuator","kind":"fan","enabled":false,"mode":"automatic","value":null}
```

`kind` admite `heater`, `fan` y `buzzer`. El servo se controla con `rotate`. Las reglas
de seguridad prevalecen: no se permite calefacción a temperatura alta, ni apagar el
ventilador/alarma cuando una condición crítica exige activarlos.

Configuración:

```json
{"type":"config","temperature_min_c":37.0,"temperature_max_c":38.0,"humidity_min_pct":50.0,"humidity_max_pct":65.0,"critical_temperature_c":39.0,"rotation_interval_seconds":120,"rotation_angle_degrees":45}
```

El campo `critical_temperature_c` se tolera para compatibilidad, pero el firmware activa
alarma desde que sale del rango seguro explícito de 37–38 °C.
