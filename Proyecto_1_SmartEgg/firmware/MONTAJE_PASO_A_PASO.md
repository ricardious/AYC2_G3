# Montaje físico paso a paso

Esta guía describe el cableado del nodo físico del Proyecto 1 con una ESP32
DevKit V1. Haga todo el montaje con la ESP32, la fuente de 5 V y las cargas
desconectadas. Revise cada etapa antes de energizar la siguiente.

## 1. Reglas de alimentación

- El RC522 se alimenta **únicamente con 3.3 V**.
- Los servos se alimentan desde una **fuente externa regulada de 5 V**. No los
  alimente desde el pin 5 V de la ESP32.
- Una todos los GND: ESP32, fuente externa, servos, relés y sensores deben
  compartir tierra.
- Los GPIO de la ESP32 trabajan a 3.3 V y no toleran señales de 5 V.
- No conecte una carga de red eléctrica en protoboard. Para 110/120 V use una
  caja aislante, fusible, borneras y personal calificado. Primero pruebe los
  relés con cargas de bajo voltaje.

Esquema de alimentación recomendado:

```text
USB ───────────────> ESP32
                       ├── 3V3 ──> RC522 y resistencias pull-up
                       └── GND ───┐
                                  ├── tierra común
Fuente externa 5 V ──> servos     │
                    └─> relés ────┘
```

## 2. Mapa completo de señales

| Función | Terminal del componente | ESP32 |
|---|---|---:|
| RC522 selección | SDA/SS | GPIO 5 |
| RC522 reinicio | RST | GPIO 4 |
| RC522 reloj SPI | SCK | GPIO 18 |
| RC522 datos hacia ESP32 | MISO | GPIO 19 |
| RC522 datos desde ESP32 | MOSI | GPIO 23 |
| LCD I2C datos | SDA | GPIO 21 |
| LCD I2C reloj | SCL | GPIO 22 |
| DHT11 datos | DATA/S | GPIO 13 |
| Relé calefacción | IN | GPIO 26 |
| Relé ventilador | IN | GPIO 27 |
| Buzzer activo | señal/+ | GPIO 14 |
| Servo de bandeja | señal/PWM | GPIO 25 |
| Servo de cerradura | señal/PWM | GPIO 33 |
| Final de carrera de puerta | NO | GPIO 16 |
| Switch general | NO | GPIO 17 |
| Posición 1 | NO | GPIO 32 |
| Posición 2 | NO | GPIO 34 |
| Posición 3 | NO | GPIO 35 |
| Posición 4 | NO | GPIO 36/VP |
| LED de estado opcional | ánodo mediante 220 Ω | GPIO 2 |

## 3. RC522

Conecte el lector exactamente así:

| RC522 | ESP32 |
|---|---|
| 3.3V | 3V3 |
| GND | GND |
| SDA/SS | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 4 |
| IRQ | Sin conectar |

> No conecte `3.3V` del RC522 a 5 V: puede dañar el lector.

## 4. LCD 1602 con adaptador I2C

| LCD I2C | Conexión |
|---|---|
| GND | GND común |
| VCC | 5 V |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

El firmware espera la dirección I2C `0x27`. Muchos adaptadores del LCD incluyen
resistencias que elevan SDA y SCL a 5 V. Como la ESP32 no tolera 5 V, para el
montaje definitivo coloque un conversor bidireccional de nivel lógico entre el
LCD y GPIO 21/22, o verifique que su adaptador pueda trabajar completamente a
3.3 V.

## 5. DHT11

### Sensor DHT11 suelto, visto de frente

Con la rejilla azul hacia usted, los pines normalmente son:

| Pin | Conexión |
|---:|---|
| 1 | 3V3 |
| 2 | GPIO 13 |
| 3 | Sin conectar |
| 4 | GND |

Coloque una resistencia de 10 kΩ entre el pin 1 (`3V3`) y el pin 2 (`DATA`).
Si utiliza un módulo DHT11 de tres pines, conecte `VCC` a 3V3, `DATA/S` a GPIO
13 y `GND` a GND; normalmente el módulo ya trae la resistencia.

## 6. Final de carrera de la puerta

Use los terminales impresos como `COM`, `NO` y `NC`:

| Final de carrera | Conexión |
|---|---|
| COM | GND |
| NO | GPIO 16 |
| NC | Sin conectar |

Instálelo de forma que la puerta cerrada presione la palanca:

| Puerta | Contacto COM–NO | GPIO 16 | Telemetría |
|---|---|---|---|
| Abierta | Abierto | HIGH | `DOOR:1` |
| Cerrada | Cerrado | LOW | `DOOR:0` |

GPIO 16 utiliza el pull-up interno, por lo que no necesita resistencia externa.

## 7. Switch general

| Switch | Conexión |
|---|---|
| COM | GND |
| NO | GPIO 17 |
| NC | Sin conectar |

Al cerrar COM–NO, GPIO 17 queda en `LOW` y el firmware enciende el sistema. Si
el switch tiene solo dos terminales, conecte uno a GPIO 17 y el otro a GND.

## 8. Microinterruptores de las cuatro posiciones

Cada posición necesita una resistencia de 10 kΩ porque el firmware desactiva
los pull-ups internos y GPIO 34, 35 y 36 no disponen de ellos.

Repita este circuito para cada posición:

```text
3V3 ── resistencia 10 kΩ ──┬── GPIO de la posición
                            └── NO del microinterruptor
GND ─────────────────────────── COM del microinterruptor
NC  ─────────────────────────── sin conectar
```

| Posición | GPIO |
|---:|---:|
| 1 | 32 |
| 2 | 34 |
| 3 | 35 |
| 4 | 36/VP |

Palanca libre produce `HIGH` y significa posición vacía. Palanca presionada
produce `LOW` y significa posición ocupada. El soporte debe accionar la palanca;
el microinterruptor no debe presionar directamente el huevo.

## 9. Servos

Los colores más comunes son marrón/negro para GND, rojo para 5 V y
naranja/amarillo/blanco para señal. Confirme los colores en la ficha de sus
servos.

| Servo | Cable de señal | Alimentación |
|---|---:|---|
| Bandeja | GPIO 25 | Fuente externa 5 V + GND común |
| Cerradura | GPIO 33 | Fuente externa 5 V + GND común |

Conecte el negativo de la fuente externa al GND de la ESP32. Una fuente de al
menos 5 V/2 A es una referencia razonable para dos microservos; aumente la
capacidad si sus servos requieren más corriente. No mueva el mecanismo a mano
mientras el servo esté energizado.

## 10. Módulo de dos relés con JD-VCC

Retire el jumper que une `VCC` con `JD-VCC`. Esto permite alimentar la lógica de
entrada con 3.3 V y las bobinas de los relés con la fuente externa de 5 V.

| Módulo | Conexión |
|---|---|
| VCC | 3V3 de la ESP32 |
| JD-VCC | positivo de la fuente externa de 5 V |
| GND | GND de la ESP32 y negativo de la fuente externa |
| IN1 calefacción | GPIO 26 |
| IN2 ventilador | GPIO 27 |

```text
ESP32 3V3 ───────────────> VCC
Fuente externa +5 V ─────> JD-VCC
ESP32 GND ───────┬────────> GND del módulo
Fuente 5 V (-) ──┘
ESP32 GPIO 26 ────────────> IN1
ESP32 GPIO 27 ────────────> IN2
```

> No deje instalado el jumper mientras conecta 3.3 V a `VCC` y 5 V a
> `JD-VCC`: uniría ambas alimentaciones y podría dañar la ESP32.

El firmware supone relés activos en `LOW`. Antes de conectar cargas, compruebe
con los LED del módulo que cada canal cambia de estado. Este esquema usa tierra
común y prioriza la compatibilidad con las señales de 3.3 V de la ESP32; no
proporciona aislamiento galvánico completo.

Para una carga de bajo voltaje, use `COM` y `NO` del canal correspondiente para
que permanezca apagada durante el arranque. `NC` se deja libre. El cableado de
110/120 V debe realizarlo personal calificado y debe quedar fuera de la
protoboard, protegido por fusible y dentro de una caja aislante.

### Conexión del ventilador al canal 2

Use una fuente que coincida con el voltaje nominal escrito en el ventilador
(por ejemplo, una fuente de 12 V para un ventilador de 12 V). La fuente del
ventilador no se conecta a `JD-VCC`, salvo que tanto el ventilador como las
bobinas del módulo sean de 5 V y la fuente tenga capacidad suficiente.

```text
Fuente del ventilador (+) ──> COM2 del relé
NO2 del relé ───────────────> positivo/rojo del ventilador
negativo/negro ventilador ──> Fuente del ventilador (-)
NC2 ────────────────────────> sin conectar
```

Cuando GPIO 27 activa `IN2`, el relé une `COM2` con `NO2` y el ventilador
recibe alimentación. Si el ventilador tiene tres o cuatro cables, conecte al
relé solamente alimentación positiva y negativa; deje libres los cables de
velocidad/tacómetro y PWM.

### Conexión de la calefacción al canal 1

Para una carga de calefacción de bajo voltaje, repita el mismo esquema:

```text
Fuente de la calefacción (+) ──> COM1 del relé
NO1 del relé ──────────────────> positivo de la calefacción
negativo de la calefacción ────> Fuente de la calefacción (-)
NC1 ───────────────────────────> sin conectar
```

## 11. Buzzer y LED de estado

### Buzzer activo

| Buzzer | Conexión |
|---|---|
| negativo/`-` | GND |
| positivo/`+` | GPIO 14 |

La conexión directa solo es apropiada para un buzzer activo de muy bajo consumo.
Si supera la corriente admisible del GPIO, contrólelo mediante un transistor y
una resistencia de base/compuerta.

### LED opcional

```text
GPIO 2 ── resistencia 220 Ω ── ánodo LED
GND    ─────────────────────── cátodo LED
```

## 12. Orden recomendado de montaje y prueba

1. Arme únicamente las líneas de 3.3 V, 5 V y GND; compruebe los voltajes con
   multímetro.
2. Conecte el switch general y el final de carrera.
3. Cargue el firmware y abra el monitor serial a 115200 baudios.
4. Verifique `DOOR:1` con la puerta abierta y `DOOR:0` al presionar el final de
   carrera.
5. Agregue uno por uno DHT11, LCD y RC522.
6. Agregue las cuatro posiciones con sus resistencias de 10 kΩ.
7. Conecte los servos a la fuente externa con GND común.
8. Conecte el lado de control de los relés y pruebe sus indicadores sin cargas.
9. Conecte buzzer y LED.
10. Solo después de comprobar todo, instale las cargas finales de forma segura.

Para abrir el monitor serial desde la raíz del repositorio:

```bash
uvx platformio run -d Proyecto_1_SmartEgg/firmware -t monitor
```

## 13. Lista de comprobación rápida

- [ ] RC522 conectado a 3.3 V, nunca a 5 V.
- [ ] Todos los GND están unidos.
- [ ] Los servos usan fuente externa.
- [ ] GPIO 34, 35 y 36 tienen pull-up externo de 10 kΩ.
- [ ] El final de carrera usa COM y NO, no NC.
- [ ] Puerta cerrada produce `DOOR:0`.
- [ ] Se retiró el jumper VCC–JD-VCC antes de conectar 3.3 V y 5 V separados.
- [ ] No hay red eléctrica sobre la protoboard.
