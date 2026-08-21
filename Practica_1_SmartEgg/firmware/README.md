# SmartEgg Firmware — Arduino Uno R3 + FreeRTOS

Este es el firmware del nodo físico que nos pedía la Práctica 1. Lo armamos para que
controle el ambiente y la rotación por su cuenta aunque la computadora se desconecte,
muestre el estado en el LCD y publique telemetría por UART/USB hacia el backend y hacia
el Arduino Serial Plotter.

## Hardware que elegimos

De las alternativas que daba el PDF, nos quedamos con esta combinación:

- Arduino Uno R3 (ATmega328P, 5 V, 2 KB SRAM).
- Sensor DHT11 para temperatura y humedad.
- LCD 16×2 con backpack I2C PCF8574.
- Bombilla de calefacción de 110 V manejada con el CH1 del módulo de cuatro relés.
  Toda su sección de red la dejamos aislada y encerrada, y la instaló personal calificado.
- Ventilador de 5 V manejado con el CH2 del mismo módulo.
- Servomotor RC para la bandeja, centrado en 90° y rotado ±45°.
- Buzzer **activo** de 5 V, así que no usamos `tone()`.
- Un final de carrera para la puerta y cuatro más, uno por espacio.
- Switch de palanca SPDT de tres terminales para habilitar y deshabilitar el sistema.

Confirmamos con el hardware en la mano el DHT11, la dirección LCD `0x27`, el buzzer
activo de 5 V y que los relés son activos en bajo. Toda esa configuración la
centralizamos en `Config.h` para no repartir constantes por el código.

## Conexiones del Uno R3

| Pin | Componente | Conexión/lógica |
|---|---|---|
| D0 / D1 | USB UART | Reservados; no les conectamos sensores |
| D2 / INT0 | Palanca ON/OFF | COM a D2, lateral ON a GND y otro lateral libre |
| D3 / INT1 | Final de puerta | NO a D3, COM a GND, NC libre; puerta abierta=`HIGH` |
| D4 | DHT11 DATA | Pull-up de 10 kΩ a 5 V si el módulo no lo trae |
| D5 | Relé calefacción | Entrada IN1 del módulo, activa en bajo |
| D6 | Relé del ventilador | Entrada IN2 del módulo, activa en bajo |
| D7 | Buzzer activo | Vía transistor, porque supera la corriente admitida por pin |
| D8 | Señal del servo | Servo alimentado externamente, tierra común |
| D9–D12 | Espacios 1–4 | Un final de carrera a GND por espacio, `INPUT_PULLUP` |
| D13 | LED de estado | LED integrado; encendido cuando el nodo y el DHT están sanos |
| A4 / SDA | LCD I2C | SDA |
| A5 / SCL | LCD I2C | SCL |

> Nunca alimentamos la bombilla, el ventilador ni el servo desde un pin del Arduino.
> Cada uno va con su fuente, con relés y transistores dimensionados, protección contra
> cargas inductivas y GND común del lado de baja tensión. La parte de tensión de red la
> montó una persona calificada, con aislamiento y caja cerrada.

## Arquitectura FreeRTOS

```mermaid
flowchart TD
    INT0[ISR INT0: palanca] --> SC[SensorControl · prioridad 3]
    INT1[ISR INT1: puerta] --> SC
    DHT[DHT11 + 4 espacios] --> SC
    SC --> OUT[Relés + buzzer + servo]
    SC --> LCD[LCD I2C cada 150 ms]
    SC --> STATE[Estado compartido protegido]
    STATE --> COM[Communication · prioridad 2]
    COM <-->|UART/USB| PC[Backend / Serial Plotter]
```

Nos quedamos con dos tareas preemptivas para no pasarnos de los 2 KB de SRAM. Probamos
separar una tercera tarea sólo para el LCD, pero con eso ya no nos alcanzaba para
reservar stacks seguros junto con las tareas internas de FreeRTOS:

| Tarea | Periodicidad | Responsabilidad |
|---|---:|---|
| `SensorControl` | 50 ms | DHT cada 2 s, espacios cada 100 ms, interrupciones, umbrales, relés, alarma, rotación y LCD cada 150 ms |
| `Communication` | 20 ms / telemetría 2 s | Recibir JSON sin bloqueo y emitir tramas Serial |

INT0 e INT1 sólo levantan banderas `volatile`; desde una ISR no llamamos LCD, Serial ni
lógica pesada. Las tareas usan `vTaskDelayUntil()` y `vTaskDelay()`, sin esperas
bloqueantes. La biblioteca FreeRTOS de AVR usa el watchdog para su tick y Servo usa su
propio timer, así que el buzzer activo nos vino bien para no tener que reservar otro
temporizador.

## Comportamiento que implementamos

- Calefacción: se activa debajo de 37 °C y se apaga con 0.2 °C de histéresis.
- Ventilación: se activa sobre 38 °C y se apaga con 0.2 °C de histéresis.
- Alarma: temperatura fuera de 37–38 °C, humedad fuera de 50–65 % o tres fallos del DHT.
- Rotación: alterna +45° y −45° cada 120 segundos, como pide el objetivo del PDF.
- Espacios: los cuatro interruptores dan el conteo ocupado/libre en tiempo real.
- Palanca: la posición conectada a GND enciende el sistema; la posición abierta lo
  deshabilita, apaga los actuadores y centra la bandeja. En el arranque respetamos la
  posición en que quedó la palanca.
- Seguridad: dejamos que los comandos manuales nunca fuercen calor durante
  sobretemperatura ni apaguen la ventilación o la alarma cuando hay una condición crítica.

## Pantalla LCD

Al principio redibujábamos las dos filas completas cada 500 ms. Eso parpadeaba, y
midiendo el bus nos dimos cuenta de algo peor: son unas 60 escrituras de carácter, y a
100 kHz cada carácter cuesta cerca de 1.3 ms, así que la actualización bloqueaba la tarea
unos 80 ms, más que su propio período de 50 ms. Lo reescribimos en `Display.*` con un
buffer de una fila y una huella compacta por fila: componemos cada fila en memoria y sólo
la enviamos cuando su contenido cambia. Un cuadro estático no genera tráfico I2C y el
diseño cabe junto a FreeRTOS en los 2 KB de SRAM del Uno.

Con ese margen pudimos subir el refresco a 150 ms y animar la pantalla:

- Ocho glifos propios en la CGRAM del HD44780: termómetro, gota, llama, ventilador,
  campana, espacio ocupado, espacio libre y puerta abierta. El grado y el bloque salen
  de la ROM del controlador, así no gastamos slots en ellos.
- La llama, el ventilador y la campana se animan **reescribiendo el bitmap en CGRAM**, no
  las celdas: el controlador redibuja solo cada instancia del glifo, así que un paso de
  animación cuesta ocho bytes sin importar cuántas veces aparezca el icono en pantalla.
- El ventilador gira en cuatro cuadros, la llama oscila en tres y la campana se mece en
  cuatro. Sólo se carga el bitmap del icono que de verdad está visible en ese cuadro.
- Durante una alarma la campana parpadea y el backlight late en contrafase, para que el
  fallo se vea desde lejos y no dependa sólo del buzzer.
- Si el DHT deja de responder, la fila superior corre una marquesina con la pista
  completa de diagnóstico, que no cabría en 16 columnas.
- Con el sistema apagado mostramos un indicador que respira, para dejar claro que el nodo
  sigue vivo y sólo está deshabilitado por la palanca.
- El arranque no usa una barra de progreso genérica: el título se escribe letra por
  letra y la fila inferior se va llenando de huevos, que es la carga de la incubadora.
  Cuando la bandeja se llena, los dieciocho huevos de la pantalla se rompen a la vez y
  sale el pollito. El truco es el mismo de los iconos: la secuencia de eclosión recorre
  un único slot de CGRAM, así que romper toda la nidada cuesta ocho bytes por cuadro en
  lugar de dieciocho escrituras de celda. Ese *splash* corre desde `setup()`, antes de
  que exista el scheduler, así que sus `delay()` sólo retrasan el primer tick de las
  tareas, y si ningún panel contesta en el bus se lo salta completo.

Como son sólo 16 columnas, repartimos cada fila en grupos separados por huecos parejos en
lugar de amontonar todo a la izquierda:

```text
      0123456789012345
 fila |T 37.5°C h 58% D|   temperatura a la izquierda, humedad a la derecha,
    0 |                |   y la bandera de puerta abierta al extremo
 fila |OOOo  +45°  * %!|   bandeja, ángulo de la bandeja, y calor/ventilador/alarma
    1 |                |
```

Los huevos de la bandeja quedan siempre en las columnas 0–3, tanto en marcha como con el
sistema apagado, así no se mueven de lugar según el estado. Los campos numéricos van
alineados a la derecha en un ancho fijo, para que los dígitos no se corran de columna
entre cuadros: la temperatura usa tres columnas de parte entera (para que una lectura
bajo cero conserve el signo) y la humedad tres, para que quepa el 100 %.

El símbolo de grado sale del carácter `0xDF` de la ROM del controlador, que es el estándar
en el juego A00 que traen casi todos los módulos 1602. Si el módulo que se consiga usara
el juego A02, ese carácter se vería distinto; se corrige cambiando `kCharDegree` en
`Display.cpp`.

## Estructura

```text
firmware/
├── CIRCUITO.md             # Conexiones, materiales y montaje seguro
├── MONTAJE_PASO_A_PASO.md  # El orden en que cableamos el nodo
├── SmartEggFirmware/
│   ├── SmartEggFirmware.ino  # setup/loop y arranque seguro
│   ├── Config.h              # pines, polaridades, umbrales, tiempos y stacks
│   ├── SystemModel.h         # contratos de estado/comandos
│   ├── ControlLogic.*        # control ON/OFF, histéresis y seguridad
│   ├── Hardware.*            # Drivers DHT/I2C, relés, servo, buzzer e ISR
│   ├── Display.*             # Glifos CGRAM, animaciones y render por diferencias
│   ├── SerialProtocol.*      # telemetría y parser JSON sin String
│   └── Tasks.*               # tareas FreeRTOS y estado compartido
├── PROTOCOL.md              # Contrato UART/USB con el backend
├── RUBRIC_CHECKLIST.md      # Nuestro repaso contra la rúbrica
└── tests/
    ├── control_logic_test.cpp
    └── run_host_tests.sh
```

Los diagramas (`CIRCUITO.dot`, `CIRCUITO.png`, `CIRCUITO.svg`, `CIRCUITO_REALISTA.*` y
los circuitos del buzzer y del ventilador) los guardamos fuera del repositorio, junto con
los scripts de Schemdraw que los generan.

## Dependencias

Las instalamos desde **Arduino IDE → Library Manager**:

- `FreeRTOS` de Phillip Stevens, 11.1.0-3 o compatible (`Arduino_FreeRTOS.h`).
- `Servo` oficial de Arduino, 1.3.0 o compatible.

Esas son las versiones contra las que verificamos el código; versiones posteriores
compatibles también sirven. FreeRTOS tiene que ser la variante AVR de
[`feilipu/Arduino_FreeRTOS_Library`](https://github.com/feilipu/Arduino_FreeRTOS_Library),
que declara soporte para Uno R3.

El protocolo DHT11/DHT22 y el LCD I2C los resolvimos con drivers pequeños que escribimos
dentro del sketch. Así nos evitamos los buffers y objetos globales de las bibliotecas
genéricas y nos queda SRAM para los stacks de FreeRTOS. Por eso no necesitamos
`DHT sensor library`, `Wire` ni `LiquidCrystal_I2C`.

## Compilar y cargar con Arduino IDE

Las rutas parten del directorio `Practica_1_SmartEgg/`. El flujo que seguimos:

1. Instalar las dependencias de arriba.
2. Abrir `firmware/SmartEggFirmware/SmartEggFirmware.ino`.
3. Seleccionar **Tools → Board → Arduino AVR Boards → Arduino Uno**.
4. Seleccionar el puerto USB del Uno.
5. Pulsar **Verify** y luego **Upload**.
6. Abrir Serial Monitor o Serial Plotter a **115200 baud**.

También lo compilamos por terminal:

```bash
arduino-cli compile --fqbn arduino:avr:uno firmware/SmartEggFirmware
```

Verificamos con Arduino CLI 1.5.1, `arduino:avr` 1.8.8, FreeRTOS 11.1.0-3 y Servo 1.3.0:

```text
Flash: 20544 / 32256 bytes (63 %)
SRAM global: 949 / 2048 bytes (46 %); 1099 bytes libres para stacks/heap
```

Los stacks de aplicación los reservamos en 184 y 160 bytes. Si alguna asignación falla,
el firmware deja relés y buzzer apagados, enciende D13 de forma permanente y emite
`MSG:4,ERROR:6,SENSOR:0`; FreeRTOS también conserva su hook de desbordamiento.
Si el LCD no responde en `0x27` o el bus I2C se traba, su driver abandona la operación
para que el control, las alarmas y la comunicación Serial sigan funcionando.

Antes de energizar actuadores revisamos siempre en `Config.h`:

- `kDhtType = 11`: sensor DHT11 confirmado.
- `kLcdAddress = 0x27`: dirección LCD confirmada.
- `kRelaysActiveLow = true`: relés activos en bajo, confirmados con la prueba física.
- `kDoorOpenLevel = HIGH`: puerta con COM a GND, NO a D3 y NC libre.
- `kSlotOccupiedLevel = LOW`: cada espacio ocupado cierra su final hacia GND.

### Cómo comprobamos la polaridad de los relés

Esta prueba la hicimos primero **sin bombilla, ventilador ni tensión de red conectados a
COM/NO/NC**. Alimentamos sólo el módulo relé a su tensión nominal y compartimos GND con
el Arduino. Para la prueba manual desconectamos `IN` del Arduino:

1. Si al unir brevemente `IN` con GND se enciende el indicador o se oye el clic, el
   módulo es activo en bajo y necesita `kRelaysActiveLow = true`.
2. En nuestro módulo, `IN` con GND sí activó el canal; por eso lo configuramos con
   `kRelaysActiveLow = true`.
3. Nunca unimos VCC con GND ni manipulamos el lado de potencia energizado.

Al arrancar el firmware, los dos canales que usamos tienen que quedar apagados. La vez
que uno se activó al encender el Uno, desconectamos la alimentación de los actuadores y
revisamos la polaridad antes de seguir.

### Cómo identificamos el buzzer

Nuestro buzzer es **activo de 5 V**: recibe un nivel fijo y genera el tono por sí solo.
Por eso el firmware lo maneja con encendido y apagado digital, sin `tone()`.

Como su corriente no venía documentada, lo manejamos con un transistor en lugar de
colgarlo directamente de D7.

## Serial Plotter e integración con el backend

La salida normal ya es graficable, sin recompilar nada:

```text
MSG:1,TEMP:37.52,HUM:58.1,DOOR:0,SLOTS:3,HEATER:0,FAN:0,SERVO:-45,BUZZER:0,POWER:1,SENSOR:1
```

Arduino reconoce las series etiquetadas `TEMP` y `HUM`; el backend reconoce `TEMP`,
`HUM`, `DOOR`, `SLOTS`, `HEATER`, `FAN`, `SERVO` y `BUZZER`. Decidimos no imprimir `NODE`
para que el puente use `SMARTEGG_DEFAULT_INCUBATOR_CODE=NODE-01` y para que todos los
campos queden numéricos. El protocolo y los comandos están detallados en
[`PROTOCOL.md`](PROTOCOL.md).

El puerto Serial sólo lo puede abrir un programa a la vez, así que cerramos el Serial
Plotter antes de levantar el backend.

## Pruebas

La lógica que no depende del hardware la verificamos con un compilador C++11:

```bash
./firmware/tests/run_host_tests.sh
```

Estas pruebas cubren frío, sobretemperatura, humedad, desconexión del DHT, apagado,
prioridad de la seguridad sobre los comandos manuales y los límites del servo. La
validación final sí necesita el Uno y los componentes reales; para eso usamos
[`RUBRIC_CHECKLIST.md`](RUBRIC_CHECKLIST.md) como guion de la demostración.

## Decisiones que tomamos a partir del enunciado

- El objetivo medible exige “±45° cada 2 minutos”, así que le dimos prioridad sobre el
  mockup del frontend, que mostraba “2 H”.
- La rúbrica acepta FreeRTOS **o** dos interrupciones. Nosotros implementamos ambos.
- DHT11, LCD `0x27`, buzzer activo de 5 V y relés activos en bajo quedaron confirmados y
  centralizados en la configuración.
