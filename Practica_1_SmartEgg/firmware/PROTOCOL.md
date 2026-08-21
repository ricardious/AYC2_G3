# Protocolo Serial SmartEgg

Para el transporte usamos el UART/USB del Arduino Uno R3 a `115200 8N1`, con una trama
por línea (`\n`). En la telemetría evitamos `String` y JSON a propósito, para no
gastarnos la SRAM que necesitábamos para los stacks de FreeRTOS.

## Tramas Arduino → computadora

El formato general que definimos es:

```text
CLAVE:valor,CLAVE:valor,...
```

Dejamos todos los valores numéricos. Eso nos permite que la misma salida la consuman:

- el Arduino Serial Plotter;
- el `SerialBridge` del backend, que usa `NODE-01` como nodo predeterminado;
- cualquier lector CSV sencillo.

Un ejemplo real:

```text
MSG:1,TEMP:37.52,HUM:58.1,DOOR:0,SLOTS:3,HEATER:0,FAN:0,SERVO:-45,BUZZER:0,POWER:1,SENSOR:1
```

### Tipos de mensaje (`MSG`)

| Código | Tipo | Cuándo lo enviamos |
|---:|---|---|
| 1 | Telemetría | Cada 2 segundos |
| 2 | Estado | Cambio de actuadores |
| 3 | Evento | Botón, puerta, rotación, configuración o recuperación |
| 4 | Error | DHT, comando/configuración o buffer Serial inválido |

A los mensajes tipo 3 les agregamos `EVENT:<código>` y a los tipo 4, `ERROR:<código>`.

Los eventos que manejamos son: `1` arranque, `2` encendido, `3` apagado, `4` puerta
abierta, `5` puerta cerrada, `6` rotación, `7` configuración actualizada, `8` comando de
actuador y `9` DHT recuperado.

Los errores son: `1` lectura DHT, `2` configuración inválida, `3` comando desconocido,
`4` línea Serial demasiado larga, `5` comando rechazado porque el sistema está apagado y
`6` memoria insuficiente para crear las tareas. Cuando el DHT nunca llegó a producir una
lectura válida, la trama de error sólo lleva `MSG`, `ERROR` y `SENSOR`: preferimos eso
antes que fabricar valores ambientales que no medimos.

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

Hicimos que el firmware acepte los mismos JSON compactos que ya emitía `server/`, para no
tener que tocar el backend. Cada comando termina en `\n`, debe enviarse como JSON
compacto y puede contener como máximo 175 caracteres.

Rotación manual:

```json
{"type":"rotate","angle_degrees":-45}
```

Actuador manual o regreso a automático:

```json
{"type":"actuator","kind":"fan","enabled":true,"mode":"manual","value":null}
{"type":"actuator","kind":"fan","enabled":false,"mode":"automatic","value":null}
```

En `kind` aceptamos `heater`, `fan` y `buzzer`; el servo se controla aparte, con
`rotate`. Las reglas de seguridad siempre ganan: no dejamos que se encienda la
calefacción con temperatura alta, ni que se apaguen el ventilador o la alarma mientras
haya una condición crítica.

Configuración:

```json
{"type":"config","temperature_min_c":37.0,"temperature_max_c":38.0,"humidity_min_pct":50.0,"humidity_max_pct":65.0,"rotation_interval_seconds":120,"rotation_angle_degrees":45}
```

La alarma se activa apenas la lectura sale del rango seguro explícito de 37–38 °C;
por eso no se envía un umbral crítico redundante.
