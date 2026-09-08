# Simulación en Wokwi

`diagram.json` reproduce el nodo del Proyecto 1 con el mismo mapa de pines que
[`Config.h`](../SmartEggESP32/Config.h). Sirve para probar el firmware y para
grabar el video sin depender del hardware.

## Cómo se ejecuta

Requiere la extensión **Wokwi for VS Code** y una licencia gratuita.

```bash
cd Proyecto_1_SmartEgg/firmware
uvx platformio run          # deja firmware.bin y firmware.elf en .pio/build/esp32dev/
```

Después, con `wokwi/diagram.json` abierto en VS Code: `F1` → **Wokwi: Start Simulator**.
La extensión toma el `wokwi.toml` de esta carpeta, cuyas rutas `firmware` y `elf`
apuntan un nivel arriba, al build de PlatformIO.

> Si la extensión no encontrara el firmware, subir `wokwi.toml` y `diagram.json` un
> nivel (a `firmware/`) resuelve el problema: la única condición del formato es que los
> dos archivos vivan juntos.

## Orden del diagrama

El trazado sigue tres reglas para que los cables no se crucen:

1. **Cada componente va del lado donde están sus pines.** En la DevKit C los GPIO 36, 34,
   35, 32, 33, 25, 26, 27, 14 y 13 salen por el borde izquierdo, y 23, 22, 21, 19, 18, 5,
   17, 16 y 2 por el derecho.
2. **El orden vertical de los componentes copia el orden de los pines.** Así los cables
   salen paralelos en lugar de cruzarse. Por eso las posiciones aparecen como 4-2-3-1 de
   arriba abajo: ese es el orden físico de los pines 36, 34, 35 y 32.
3. **Los módulos van girados 180° para que sus pines miren a la placa.** El servo, el
   relé, el buzzer y el DHT traen los pines en un solo borde; sin girarlos, el cable
   salía por el lado contrario y volvía cruzando por encima del cuerpo del módulo.
4. **La alimentación va encadenada, no en estrella.** GND y 5 V bajan de un módulo al
   siguiente, y el riel cierra contra la placa desde el módulo más cercano al pin, no
   desde el último de la cadena. Los cuatro pull-ups comparten un riel de 3.3 V.

Los únicos cables largos son los de 3.3 V del RC522 y 5 V del LCD, porque en esta
placa ambas alimentaciones salen solo por el borde izquierdo; los dos rodean por fuera
en lugar de atravesar el diagrama.

Quedan dos cruces inevitables en el lado derecho: los pines del LCD (21 y 22) y los de
los switches (16 y 17) caen dentro del rango que ocupa el RC522 (23 a 4), así que su
cable de MOSI y el de RST tienen que pasar por encima. Los dos llevan trazado explícito
para rodear en lugar de atravesar.

## Qué contiene el diagrama

| Parte | Pines | Nota |
|---|---|---|
| ESP32 DevKit C v4 | — | Wokwi no trae la DevKit V1; los GPIO son los mismos |
| RC522 | SS 5 · RST 4 · SCK 18 · MISO 19 · MOSI 23 | Clic en el lector para presentar una tarjeta |
| LCD 1602 I2C | SDA 21 · SCL 22 | Dirección `0x27` |
| DHT | DATA 13 | Ver la limitación más abajo |
| Servo bandeja | 25 | |
| Servo cerradura | 33 | |
| Relés calefacción / ventilador | 26 / 27 | Activos en bajo |
| Buzzer activo | 14 | |
| Puerta | 16 | Deslizante: arriba = abierta (HIGH) |
| Switch general | 17 | Deslizante: abajo = encendido (LOW) |
| Posiciones 1-4 | 32 · 34 · 35 · 36 | Deslizantes; abajo = ocupada (LOW) |
| LED de estado | 2 | Refleja el switch general |

Las cuatro posiciones llevan su resistencia de 10 kΩ a 3V3 porque `Hardware.cpp` las
configura con `GPIO_PULLUP_DISABLE`. La puerta y el switch general usan el pull-up
interno, así que no llevan resistencia.

El UID de la tarjeta azul está en el atributo `uid` del RC522 (`A1:B2:C3:D4`). Debe
coincidir con el `rfid_uid` de un Operador registrado en `SMARTEGG_INITIAL_TECHNICIANS`,
sin los dos puntos: `A1B2C3D4`.

## Lo que funciona y lo que no

**Funciona tal cual**: control por umbrales, histéresis, LCD, rotación de la bandeja,
relés, buzzer, lectura de posiciones, puerta con interrupción, switch general y la
presentación de tarjetas RFID con el panel del lector.

**Tres limitaciones que conviene conocer antes de grabar el video:**

### 1. El DHT simulado habla DHT22, no DHT11

Wokwi solo ofrece `wokwi-dht22`. Un DHT22 envía humedad y temperatura como enteros de
16 bits divididos entre 10; el decodificador de `Hardware.cpp` espera el formato DHT11
(byte entero + byte decimal), así que en simulación devolvería valores equivocados sin
avisar.

`config::kDhtType` ya existe pero hoy no lo usa nadie. Basta con hacerlo efectivo:

```cpp
if (config::kDhtType == 22) {
  humidityPct = ((data[0] << 8) | data[1]) * 0.1F;
  temperatureC = (((data[2] & 0x7F) << 8) | data[3]) * 0.1F;
} else {
  humidityPct = static_cast<float>(data[0]) + data[1] * 0.1F;
  temperatureC = static_cast<float>(data[2]) + (data[3] & 0x0F) * 0.1F;
}
if ((data[2] & 0x80) != 0 || (data[3] & 0x80) != 0) temperatureC = -temperatureC;
```

Con eso, `kDhtType = 22` sirve para la simulación y `11` para la placa real.

### 2. Llegar al backend desde el simulador requiere el gateway privado

El ESP32 simulado se conecta a la red `Wokwi-GUEST` con contraseña vacía, así que en
`secrets.h` hay que poner:

```c
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
```

Para que el `POST /api/v1/access/rfid/authorize` llegue a un backend en la misma
computadora, la URL debe apuntar a `http://host.wokwi.internal:8000`, y eso solo
funciona con el **gateway privado de Wokwi, que es de pago**. Sin él, el flujo RFID se
puede ver en el LCD y en el servo de la cerradura, pero no llega al backend.

### 3. El puente serial del backend no acepta URLs

`wokwi.toml` publica el puerto serial simulado en `rfc2217://localhost:4000`, pero
`server/app/services/serial_bridge.py` abre el puerto con `serial.Serial(self.port, …)`,
que solo acepta rutas de dispositivo. Cambiar esa llamada por `serial.serial_for_url`
—que acepta tanto `/dev/ttyUSB0` como `rfc2217://localhost:4000`— permite alimentar
toda la plataforma con el nodo simulado:

```bash
SMARTEGG_SERIAL_DEVICE=rfc2217://localhost:4000 uv run fastapi dev
```

Es la forma más simple de demostrar telemetría, Grafana y la consola sin la placa
física.
