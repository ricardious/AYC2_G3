# Consumo eléctrico

La incubadora no tiene un sensor de corriente. El backend **estima** la potencia
en cada lectura con lo que está encendido en ese momento (la ESP32 reporta
`HEATER`, `FAN` y `BUZZER` en cada trama) y la potencia nominal de cada
componente. La energía es la potencia de la lectura anterior por el tiempo hasta
la lectura actual (unos 2.6 s).

## Potencia de cada componente

| Componente | Fuente del dato | Cálculo | Potencia usada |
|---|---|---|---:|
| Foco incandescente | etiqueta: 120 V 40 W | dato directo (≈ 0.33 A) | **40 W** |
| Ventilador | etiqueta: DC 12 V 0.15 A; conectado a **5 V** | 1.8 W × (5/12)² | **0.31 W** |
| LCD 16×2 I²C | ficha: 5 V, 90–120 mA | 5 V × 105 mA (punto medio) | 0.53 W |
| ESP32 DevKit sin WiFi | valor típico (~80 mA a 5 V) | 5 V × 0.08 A | 0.40 W |
| RC522 | valor típico (~20 mA a 3.3 V) | 3.3 V × 0.02 A | 0.07 W |
| 2 servos SG90 en reposo | valor típico (~6 mA c/u a 5 V) | 2 × 5 V × 0.006 A | 0.06 W |
| Bobina de relé (por canal activo) | valor típico de módulo (~70 mA a 5 V) | 5 V × 0.07 A | 0.35 W |
| Buzzer activo | valor típico (~30 mA a 5 V) | 5 V × 0.03 A | 0.15 W |

- **Electrónica siempre conectada** (`base_w`): ESP32 + LCD + RC522 + servos en
  reposo = 0.40 + 0.53 + 0.07 + 0.06 = **1.06 W**.
- **Ventilador a 5 V:** 1.8 W es su potencia a 12 V. Un ventilador DC se
  aproxima a una carga de resistencia fija: la corriente baja en proporción al
  voltaje y la potencia con el cuadrado.
- **Servos moviéndose:** ~250 mA (≈ 1.25 W) durante menos de 1 s por
  movimiento. Con ~29 movimientos por hora suman ≈ 0.005 Wh por hora, así que
  no se cuentan.
- **LED de bloqueo** (~6 mA a 3.3 V, 0.02 W) y **DHT11** (~1 mA): despreciables.

Todas las potencias se pueden cambiar con `comandos/energia` (ver
[`mqtt/TOPICS.md`](../mqtt/TOPICS.md#consumo-eléctrico)) si se mide un valor más
exacto.

## Consumo con los ciclos reales

En el histórico de la Fase 2 (5.9 h con el sistema encendido) el foco estuvo
encendido el **74.9 %** del tiempo, el buzzer el 83.7 % (suena mientras la
temperatura está fuera de rango, es decir durante casi todo el calentamiento) y
el ventilador nunca.

| Componente | Encendido | Potencia promedio |
|---|---:|---:|
| Foco | 74.9 % | 29.96 W |
| Electrónica | 100 % | 1.06 W |
| Relé del foco | 74.9 % | 0.26 W |
| Buzzer | 83.7 % | 0.13 W |
| Ventilador | 0 % | 0 W |
| **Total** | | **≈ 31.4 W** |

El foco es el **95 %** del consumo.

## Costo

Tarifa EEGSA vigente de agosto a octubre de 2026 (CNEE, actualización
trimestral). Se usa la **no social** por ser la mayor: el costo calculado nunca
queda por debajo del real.

| Periodo | Energía | Tarifa social (Q1.42/kWh) | Tarifa no social (Q1.51/kWh) |
|---|---:|---:|---:|
| 1 hora | 0.031 kWh | Q0.04 | Q0.05 |
| 1 día | 0.75 kWh | Q1.07 | Q1.14 |
| 21 días (incubación de gallina) | 15.8 kWh | Q22.48 | Q23.90 |
| 30 días | 22.6 kWh | Q32.10 | Q34.14 |

Como referencia, en Occidente (DEOCSA, Q2.12/kWh no social) el mismo día
costaría Q1.60.

## Gestión

| Función | Cómo funciona | Por defecto |
|---|---|---|
| Monitoreo en tiempo real | potencia por componente, energía y costo del día en `smartegg/{id}/energia` y en la tabla `energy_samples` | — |
| Límite de consumo | al pasar el límite diario se abre la alarma `energy_limit`; con `limit_action: heater_off` también apaga el foco hasta medianoche | 800 Wh, solo alerta |
| Horarios | franjas diarias en las que el foco o el ventilador quedan forzados a encendido o apagado | ninguno |
| Temporizador | enciende o apaga el foco o el ventilador por N minutos y luego vuelve a automático | ninguno |
| Consumo anómalo | alarma `energy_anomaly` | ver abajo |

El **límite de 800 Wh** queda un poco arriba del consumo normal de un día
(≈ 754 Wh): se pasa solo si el foco trabaja más de lo habitual.

**Reglas de consumo anómalo:**

1. **Foco encendido con la temperatura en el máximo**, en 2 lecturas seguidas.
   El firmware lo apaga en ese caso, así que indica un relé pegado o una falla.
2. **Consumo con el sistema apagado** (foco o ventilador encendidos con
   `POWER:0`), en 2 lecturas seguidas.
3. **Promedio de la última hora mayor a 37 W** (con al menos 30 min de datos).
   Lo normal es ≈ 31 W; 37 W equivale a tener el foco encendido casi el 90 %
   del tiempo, señal de que la incubadora pierde calor (puerta abierta, foco
   débil o ambiente muy frío).

Las reglas que fuerzan dispositivos se aplican en este orden: **temporizador,
límite, horarios**. Usan los mismos comandos manuales que la página, así que la
seguridad del firmware sigue mandando: con la temperatura en el máximo el foco
se apaga aunque una regla lo pida encendido. Mientras el nodo está bloqueado
por la cámara no se envían.

## Limitaciones

- Es una estimación con potencias nominales; no hay medición de corriente.
- Las potencias de ESP32, RC522, relés y buzzer son valores típicos de hoja de
  datos, no medidos.
- El tiempo en que la placa no envía lecturas (más de 30 s sin datos) no se
  cobra.
