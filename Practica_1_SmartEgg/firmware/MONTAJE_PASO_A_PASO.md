# Montaje paso a paso — SmartEgg

Aquí dejamos el orden en que cableamos el nodo físico, que fue **de menor a mayor
corriente**. Cerramos cada fase con una comprobación antes de pasar a la siguiente.

> Nuestra regla de oro fue: primero la lógica pura, después las entradas, luego los
> actuadores de baja corriente y **al final** la potencia. Así, si algo fallaba, sólo
> perdíamos lógica y no componentes.

---

## Tabla resumen de pines (Config.h)

| Arduino | Componente | Detalle |
|---|---|---|
| D0 / D1 | USB UART | Reservados, sin sensores conectados |
| D2 | Palanca SPDT ON/OFF | COM a D2, lateral ON a GND, otro libre |
| D3 | Final de puerta | NO a D3, COM a GND (abierta = HIGH) |
| D4 | DHT11 | DATA, pull-up 10 kΩ a 5 V por ser sensor suelto |
| D5 | Relé CH1 — calefacción | IN1, activo en bajo |
| D6 | Relé CH2 — ventilador 5 V | IN2, activo en bajo |
| D7 | Buzzer | Base del 2N2222 vía 1 kΩ |
| D8 | Servo | Señal (naranja) |
| D9–D12 | Espacios 1–4 | COM del final; **NO** a GND |
| A4 | LCD I2C | SDA |
| A5 | LCD I2C | SCL |

---

## FASE 1 — Arduino + DHT11 (lógica pura)

Empezamos con el **cable USB A–B** entre la PC y el Uno, sólo para confirmar que
apareciera el puerto COM. Todavía no cargamos nada; era nada más un punto de prueba.

Después conectamos el **DHT11**:

```
DHT VCC  →  pin 5V del Arduino
DHT GND  →  pin GND del Arduino
DHT DATA →  pin D4
```

Como nuestro DHT11 es **sensor suelto** y no módulo, le pusimos la resistencia de
**10 kΩ** entre DATA y 5V. Los módulos ya traen ese pull-up integrado.

**Comprobación:** cargamos el firmware (Verify → Upload) y abrimos el Serial Monitor a
115200 baud. Ahí ya se ven las lecturas de `TEMP` y `HUM`. Cuando nos apareció
`MSG:4,ERROR:1` era error de lectura, y lo resolvimos revisando DATA, el pull-up y el
GND común.

---

## FASE 2 — LCD I2C (16x2 con backpack)

Conectamos los 4 cables:

```
LCD VCC  →  pin 5V del Arduino
LCD GND  →  pin GND del Arduino
LCD SDA  →  pin A4
LCD SCL  →  pin A5
```

**Comprobación:** volvimos a cargar el firmware. La primera vez no mostraba nada y era
sólo el contraste, así que lo ajustamos con el **potenciómetro azul** del backpack. Si
aun así no aparece nada, la otra opción es cambiar `kLcdAddress` a `0x3F` en `Config.h`
(nosotros nos quedamos en el `0x27` por defecto).

---

## FASE 3 — Entradas digitales

### 3.1 Switch de palanca SPDT ON/OFF (D2)

```
Terminal central COM  →  pin D2
Terminal lateral ON   →  pin GND
Otro terminal lateral →  sin conectar
```

Lo leemos con el `INPUT_PULLUP` interno, así que no necesitamos resistencia externa.

La posición que conecta COM con GND es ON (`LOW`) y la otra es OFF (`HIGH`). Hicimos que
el firmware leyera la posición absoluta al arrancar y en cada cambio, no sólo el flanco.

### 3.2 Final de puerta (D3)

```
Final puerta NO   →  pin D3
Final puerta COM  →  pin GND
Final puerta NC   →  sin conectar
```

Con este montaje, la puerta cerrada presiona el final y cierra `COM–NO`, así que D3 queda
en `LOW`. Al abrir la puerta se libera el final y el `INPUT_PULLUP` lleva D3 a `HIGH`, que
es lo que el firmware interpreta como puerta abierta.

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

**Comprobación (Serial Monitor, 115200):**

- Palanca ON/OFF → `POWER:1`/`POWER:0`, `EVENT:2`/`EVENT:3`.
- Puerta abierta → `DOOR:1` `EVENT:4`; cerrada → `DOOR:0` `EVENT:5`.
- Huevos → `SLOTS:0..4`.

---

## FASE 4 — Servo (D8)

```
Servo VCC (rojo)      →  fuente externa de 5V (NO al pin 5V del Arduino)
Servo GND (marrón)    →  GND común con el Arduino
Servo Señal (naranja) →  pin D8
```

Unimos el GND de la fuente del servo con el GND del Arduino, que es imprescindible para
que la señal tenga referencia. Lo que no hicimos fue conectar el +5V de esa fuente al pin
5V del Uno mientras estaba por USB.

También le pusimos un condensador de **470 µF / ≥10V** entre +5V y GND, cerca del servo,
para evitar reinicios por los picos de corriente. Con una fuente firme puede que no haga
falta, pero a nosotros nos estabilizó el arranque.

**Comprobación (todavía SIN acoplar la bandeja):**

- Al arrancar se va al centro, 90°.
- Cada 120 s alterna +45°/−45°, y se ve en el campo `SERVO` del serial.
- Manual: `{"type":"rotate","angle_degrees":-45}`

> No acoplamos el brazo hasta confirmar que el centro y el recorrido estaban libres. Si
> se acopla antes, el servo se traba y se calienta.

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

**Comprobación:** el buzzer suena en condiciones críticas, o sea temperatura fuera de
37–38 °C, humedad fuera de 50–65 %, o 3 fallos seguidos del DHT. Para probarlo a mano
usamos:
`{"type":"actuator","kind":"buzzer","enabled":true,"mode":"manual","value":null}`

> ⚠️ El E/B/C del 2N2222 lo identificamos **con la hoja de datos**, porque varía según el
> fabricante y no se deduce mirando la cara plana.

---

## FASE 6 — Relé de 4 canales (potencia)

### 6.1 Lógica (sin cargas)

```
Relé VCC  →  fuente externa de 5V
Relé GND  →  GND común
D5  →  IN1   (CH1 = calefacción)
D6  →  IN2   (CH2 = ventilador 5 V)
+5V →  IN3   (CH3 apagado)
+5V →  IN4   (CH4 apagado)
```

Nuestro módulo tiene relés **activos en bajo** (`kRelaysActiveLow = true`). Lo
confirmamos activando `IN1` al conectarlo brevemente con GND.

### 6.2 Prueba SIN cargas (crítico)

Esta parte no nos la saltamos:

- Todos los relés tienen que quedar **apagados al arrancar**: ni clic ni LED.
- Activamos manualmente CH1 y CH2 por separado, y en cada uno debe oírse el clic y
  encenderse el LED del canal correspondiente.
- El módulo se activa con `IN` a GND, tal como esperábamos.

### 6.3 Ventilador de 5 V en CH2 — sólo después de 6.2

```
Fuente 5V (+) → COM2
NO2 → cable rojo del ventilador
cable negro del ventilador → GND de la fuente de 5V
Diodo 1N4007 en paralelo con el ventilador: raya al rojo, ánodo al negro
```

Al quedar en `NO2`, el ventilador está apagado mientras CH2 esté desactivado. Los
contactos COM/NO/NC de CH3 y CH4 los dejamos libres.

---

## FASE 7 — Bombilla de 110 V en CH1

```
FASE 110V → fusible apropiado → COM1
NO1 → terminal de fase del portalámparas
NEUTRO 110V → otro terminal del portalámparas
```

Este esquema es sólo conceptual. Para 110 V no usamos protoboard ni cables Dupont. El
montaje se hizo desenergizado, en una caja aislante cerrada, con borneras, cableado,
fusible y alivio de tensión aptos para red. Una persona calificada verificó las marcas
del relé, la potencia de la bombilla y todo el montaje antes de energizarlo.

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

> Todo el hardware lo probamos **sin backend**, porque el firmware controla solo. El
> backend (`server/`) entra después, nada más para la capa IoT/web y la REST/API con base
> de datos.

## Seguridad

Estas fueron las reglas que respetamos durante todo el montaje:

- Nunca alimentamos bombilla, ventilador ni servo desde un pin del Arduino.
- Los 110 V van únicamente por COM1/NO1, dentro de una caja cerrada y separada.
- No unimos VCC con GND ni tocamos la potencia energizada.
- GND común entre el Arduino y la fuente lógica de 5 V. El neutro de 110 V **no** se
  conecta al GND del Arduino.
- No energizamos los 110 V sobre una mesa abierta; eso se hizo sólo tras la revisión
  calificada.

## Referencias

- Detalles y decisiones: [`README.md`](README.md)
- Diagrama eléctrico y conexiones: [`CIRCUITO.md`](CIRCUITO.md)
- Contrato serial con el backend: [`PROTOCOL.md`](PROTOCOL.md)
- Pines, polaridades y umbrales en código: `SmartEggFirmware/Config.h`
