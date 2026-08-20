# Guía de Montaje Paso a Paso — SmartEgg

Guía práctica para cablear el nodo físico en orden seguro, **de menor a mayor
corriente**. Cada fase termina con una comprobación antes de pasar a la siguiente.

> Regla de oro: primero la lógica pura, después las entradas, luego los actuadores
> de baja corriente y **al final** la potencia. Si algo falla, solo perdés lógica, no
> componentes.

---

## Tabla resumen de pines (Config.h)

| Arduino | Componente | Detalle |
|---|---|---|
| D0 / D1 | USB UART | Reservados, no conectar sensores |
| D2 | Palanca SPDT ON/OFF | COM a D2, lateral ON a GND, otro libre |
| D3 | Final de puerta | COM a D3, **NC** a GND (abierta = LOW) |
| D4 | DHT11 | DATA, pull-up 10 kΩ a 5 V si es sensor suelto |
| D5 | Relé CH1 — calefacción | IN1, activo en alto |
| D6 | Relé CH2 — ventilador 5 V | IN2, activo en alto |
| D7 | Buzzer | Base del 2N2222 vía 1 kΩ |
| D8 | Servo | Señal (naranja) |
| D9–D12 | Espacios 1–4 | COM del final; **NO** a GND |
| A4 | LCD I2C | SDA |
| A5 | LCD I2C | SCL |

---

## FASE 1 — Arduino + DHT11 (lógica pura)

1. Conectá el **cable USB A–B** entre la PC y el Uno. Verificá que aparezca como
   puerto COM. (Aún no cargás nada; es solo punto de prueba.)
2. Conectá el **DHT11**:
   ```
   DHT VCC  →  pin 5V del Arduino
   DHT GND  →  pin GND del Arduino
   DHT DATA →  pin D4
   ```
3. Si el DHT11 es **sensor suelto** (no módulo): resistencia **10 kΩ** entre DATA y 5V.
   Si es módulo, ya trae el pull-up.
4. **Comprobar:** cargá el firmware (Verify → Upload), abrí Serial Monitor a 115200
   baud. Deben verse lecturas de `TEMP` y `HUM`. Si aparece `MSG:4,ERROR:1` → error
   de lectura (revisá DATA, pull-up y GND común).

---

## FASE 2 — LCD I2C (16x2 con backpack)

1. Conectá los 4 cables:
   ```
   LCD VCC  →  pin 5V del Arduino
   LCD GND  →  pin GND del Arduino
   LCD SDA  →  pin A4
   LCD SCL  →  pin A5
   ```
2. **Comprobar:** cargá el firmware. Si no muestra nada:
   - Girá el **potenciómetro azul** del backpack (contraste).
   - Si sigue: probá cambiar `kLcdAddress` a `0x3F` en `Config.h` (default `0x27`).

---

## FASE 3 — Entradas digitales

### 3.1 Switch de palanca SPDT ON/OFF (D2)
```
Terminal central COM  →  pin D2
Terminal lateral ON   →  pin GND
Otro terminal lateral →  sin conectar
```
Usa `INPUT_PULLUP` interno → no hace falta resistencia externa.

La posición que conecta COM con GND significa ON (`LOW`); la otra significa OFF
(`HIGH`). El firmware lee la posición absoluta al arrancar y en cada cambio.

### 3.2 Final de puerta (D3)
```
Final puerta COM  →  pin D3
Final puerta NC   →  pin GND
```
Usa el contacto **NC a propósito** (CIRCUITO.md): puerta cerrada = presionado = se
abre; puerta abierta = LOW (estado esperado).

### 3.3 Espacios (D9–D12) — un final por hueco
```
Final hueco N COM  →  pin del Arduino
Final hueco N NO   →  pin GND
```
| Hueco | Arduino |
|---|---|
| 1 | D9 |
| 2 | D10 |
| 3 | D11 |
| 4 | D12 |

**Comprobar (Serial Monitor, 115200):**
- Palanca ON/OFF → `POWER:1`/`POWER:0`, `EVENT:2`/`EVENT:3`.
- Puerta abierta → `DOOR:1` `EVENT:4`; cerrada → `DOOR:0` `EVENT:5`.
- Huevos → `SLOTS:0..4`.

---

## FASE 4 — Servo (D8)

```
Servo VCC (rojo)      →  fuente externa de 5V (NO del pin 5V del Arduino)
Servo GND (marrón)    →  GND común con el Arduino
Servo Señal (naranja) →  pin D8
```
- **Uní el GND** de la fuente del servo con el GND del Arduino (imprescindible).
- **No** conectes el +5V de la fuente al pin 5V del Uno mientras esté por USB.
- (Opcional) Condensador **470 µF / ≥10V** entre +5V y GND cerca del servo para
  evitar reinicios por picos de corriente. Si la fuente es firme, puede no hacer falta.

**Comprobar (SIN acoplar la bandeja):**
- Al arrancar → centro 90°.
- Cada 120 s → alterna +45°/−45°; campo `SERVO` en serial.
- Manual: `{"type":"rotate","angle_degrees":-45}`

> No acoples el brazo hasta confirmar centro y recorrido libres, o el servo se traba
> y se calienta.

---

## FASE 5 — Buzzer activo 5V (D7) con 2N2222

```
Arduino D7 → 1 kΩ → BASE del 2N2222
                      + 10 kΩ entre BASE y GND
EMISOR  →  GND
COLECTOR →  negativo del buzzer
Buzzer positivo → +5V (fuente externa)
Diodo 1N4007 en paralelo al buzzer, cátodo (raya) hacia +5V
```

**Comprobar:** el buzzer suena en condiciones críticas (temp fuera de 37–38 °C,
humedad fuera de 50–65 %, o 3 fallos de DHT). Manual:
`{"type":"actuator","kind":"buzzer","enabled":true,"mode":"manual","value":null}`

> ⚠️ Identificá E/B/C del 2N2222 **con la hoja de datos** (varía por fabricante), no
> mirando la cara plana.

---

## FASE 6 — Relé de 4 canales (potencia)

### 6.1 Lógica (sin cargas)
```
Relé VCC  →  fuente externa de 5V
Relé GND  →  GND común
D5  →  IN1   (CH1 = calefacción)
D6  →  IN2   (CH2 = ventilador 5 V)
GND →  IN3   (CH3 apagado)
GND →  IN4   (CH4 apagado)
```
Espera relés **activos en alto** (`kRelaysActiveLow = false`).

### 6.2 Prueba SIN cargas (crítico)
- Todos los relés deben quedar **apagados al arrancar** (ni clic ni LED).
- Activá manualmente CH1 y CH2 por separado → clic + LED del canal correspondiente.
- Si el módulo se activa con `IN` a GND, cambiá `kRelaysActiveLow = true`.

### 6.3 Ventilador de 5 V en CH2 — SOLO después de 6.2
```
Fuente 5V (+) → COM2
NO2 → cable rojo del ventilador
cable negro del ventilador → GND de la fuente de 5V
Diodo 1N4007 en paralelo con el ventilador: raya al rojo, ánodo al negro
```
- Al quedar en `NO2`, el ventilador está apagado cuando CH2 está desactivado.
- Dejá libres COM/NO/NC de CH3 y CH4.

---

## FASE 7 — Bombilla de 110 V en CH1

```
FASE 110V → fusible apropiado → COM1
NO1 → terminal de fase del portalámparas
NEUTRO 110V → otro terminal del portalámparas
```

Esta conexión es sólo conceptual. No use protoboard ni cables Dupont para 110 V. Debe
montarse desenergizada en una caja aislante cerrada, con borneras, cableado, fusible y
alivio de tensión aptos para red. Una persona calificada debe verificar las marcas del
relé, la potencia de la bombilla y todo el montaje antes de energizarlo.

---

## Comprobación final del sistema

| Prueba | Resultado esperado |
|---|---|
| Serial Plotter (115200) | TEMP y HUM graficando en tiempo real |
| Temp < 37 °C | Calefacción ON (`HEATER:1`) |
| Temp > 38 °C | Ventilador ON (`FAN:1`) |
| Fuera de 37–38 °C / humedad | Buzzer ON (`BUZZER:1`) |
| Cada 120 s | Servo ±45° (`SERVO`) |
| Huevos | `SLOTS:0..4` |
| Palanca | `POWER` sigue su posición y en OFF apaga actuadores |

> El hardware se prueba **sin backend** (el firmware controla solo). El backend
> (server/) solo entra para la capa IoT/web y la REST/API con base de datos.

## Seguridad

- Nunca alimentar bombilla/ventilador/servo desde un pin del Arduino.
- Los 110 V van únicamente por COM1/NO1, dentro de una caja cerrada y separada.
- No conectar VCC y GND entre sí; no tocar potencia energizado.
- GND común entre Arduino y fuente lógica de 5 V. El neutro de 110 V **no se conecta**
  al GND del Arduino.
- No energice los 110 V sobre una mesa abierta; hágalo sólo tras la revisión calificada.

## Referencias

- Detalles y decisiones: [`README.md`](README.md)
- Diagrama eléctrico completo: [`CIRCUITO.md`](CIRCUITO.md) + `CIRCUITO.png`
- Contrato serial con el backend: [`PROTOCOL.md`](PROTOCOL.md)
- Pines/polaridades/umbrales en código: `SmartEggFirmware/Config.h`
