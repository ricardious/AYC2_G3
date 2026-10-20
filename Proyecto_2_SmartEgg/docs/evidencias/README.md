# Índice de evidencias · SmartEgg

Este índice separa capturas de interfaz, datos de demostración y pruebas de
funcionamiento físico. Ninguna imagen de esta carpeta se presenta como una
medición real de la ESP32 si no se ha verificado su origen.

| Archivo | Qué acredita | Límite |
|---|---|---|
| [login-rfid.png](login-rfid.png) | Diseño de la pantalla de ingreso y estado del lector | No prueba lectura de una tarjeta física. |
| [dashboard-rfid.png](dashboard-rfid.png) | Diseño de la consola tras acceder | Los medidores vacíos no prueban telemetría. |
| [operacion-puerta.png](operacion-puerta.png) | Formulario de operaciones de puerta | No prueba giro del servo ni cierre físico. |
| [grafana-historico.png](grafana-historico.png) | Presentación del dashboard histórico | Contiene etiquetas `DEMO-*`; no demuestra datos del prototipo. |
| [frontend-login-sin-esp32.png](frontend-login-sin-esp32.png) | Pantalla de acceso de Next.js local | Muestra **LECTOR SIN CONEXIÓN**; no acredita RFID. |
| [frontend-control-demo.png](frontend-control-demo.png) | Centro de control en modo desarrollo | Lleva la marca **MODO DEMO · DATOS DE EJEMPLO**; no son mediciones físicas. |
| [frontend-historial-demo.png](frontend-historial-demo.png) | Vista Historial del cliente | Son 120 lecturas generadas por el modo demo, no por PostgreSQL ni la ESP32. |
| [frontend-reportes-demo.png](frontend-reportes-demo.png) | Vista previa de Reportes | No acredita un PDF descargado ni un informe de datos reales. |
| [grafana-tiempo-real-sin-nodo.png](grafana-tiempo-real-sin-nodo.png) | Dashboard MQTT provisionado | Paneles vacíos porque no había publicación del nodo; no cumple la evidencia de lectura en vivo. |
| [grafana-historico-actual-sin-nodo.png](grafana-historico-actual-sin-nodo.png) | Dashboard SQL abierto | El rango elegido indica **SIN CONEXIÓN** y **No data**; no acredita telemetría real. |
| [docker-compose-servicios-health-sin-esp32.png](docker-compose-servicios-health-sin-esp32.png) | `docker compose up -d --build`, cuatro servicios activos en `docker compose ps` y `GET /health` con `{"status":"ok"}` | Acredita el despliegue local del stack, no la conexión de la ESP32 ni lecturas físicas. |
| [mqtt-explorer-conexion-sin-esp32.png](mqtt-explorer-conexion-sin-esp32.png) | MQTT Explorer conectado al Mosquitto local; se observan los árboles `smartegg` y `$SYS` | Acredita conexión y recepción de topics, no lecturas nuevas de la ESP32. |
| [mqtt-explorer-prueba-manual-sin-esp32.png](mqtt-explorer-prueba-manual-sin-esp32.png) | MQTT Explorer publica y recibe `{"test":"publish-subscribe"}` en `smartegg/diagnostico/manual` | Prueba gráfica con QoS 0 y mensaje sintético sin retención; no acredita telemetría física. |

## Plataforma

Las capturas originales de esta sesión están agrupadas en
[`plataforma/`](plataforma/). Los nombres indican la
pantalla y el estado visible; no se modificaron las imágenes. La presencia de
valores y la etiqueta **TELEMETRÍA ACTIVA** en la interfaz no permiten verificar
por sí solas que las lecturas procedan de la ESP32. Para eso hace falta una toma
continua del equipo y la pantalla, o el registro serial/MQTT del mismo momento.

| Captura | Estado visible |
|---|---|
| [Acceso RFID listo](plataforma/frontend-acceso-rfid-listo.png) | Lector marcado como listo y acceso manual; no muestra una tarjeta leída. |
| [Sincronización](plataforma/frontend-sincronizacion.png) | Pantalla de carga de la incubadora. |
| [Control con alerta](plataforma/frontend-control-alerta-sin-huevo.png) | Temperatura, humedad, actuadores y aviso; las cuatro posiciones aparecen vacías. |
| [Observatorio: temperatura](plataforma/frontend-observatorio-temperatura-sin-huevo.png) | Modelo 3D con capa de temperatura y posiciones vacías. |
| [Observatorio: humedad y LCD](plataforma/frontend-observatorio-humedad-lcd.png) | Capa de humedad y acercamiento a la LCD del modelo 3D; no es una fotografía de la LCD física. |
| [Historial](plataforma/frontend-historial-lecturas.png) | Gráficas y contador de 240 lecturas presentadas por la web. |
| [Reportes](plataforma/frontend-reportes-vista-previa.png) | Vista previa y botón para generar PDF; no acredita la descarga del archivo. |
| [Perfil inicial](plataforma/frontend-perfil-operador-inicial.png) | Resumen del operador antes del registro mostrado en las capturas siguientes. |
| [Incubación](plataforma/frontend-incubacion-huevo-registrado.png) | Una ficha de huevo en la primera posición. |
| [Observatorio con huevo](plataforma/frontend-observatorio-huevo-registrado.png) | Primera posición ocupada en el modelo 3D. |
| [Control con huevo](plataforma/frontend-control-huevo-registrado.png) | Primera posición ocupada en la consola. |
| [Tema claro](plataforma/frontend-control-tema-claro.png) | Variante clara de la consola. |
| [Perfil actualizado](plataforma/frontend-perfil-operador-actualizado.png) | Contadores posteriores al registro del huevo. |
| [Grafana en vivo](plataforma/grafana-tiempo-real-con-datos.png) | Panel MQTT con temperatura, humedad, puerta, ocupación y actuadores. |
| [Grafana histórico](plataforma/grafana-historico-con-datos.png) | Panel SQL con lecturas, alarmas y operaciones de acceso. |

La conexión y publicación MQTT están documentadas en las capturas de MQTT
Explorer anteriores. Los dos paneles de Grafana también están capturados con
datos; las imágenes antiguas sin nodo se conservan solo como referencia del
estado inicial.

## Base de datos en Neon

Las capturas de [`base-datos/`](base-datos/) muestran la rama `production` del
proyecto SmartEgg y consultas de solo lectura sobre la base `neondb`. Permiten
localizar las tablas y examinar registros existentes; la columna `source=serial`
identifica el origen declarado de las lecturas, pero una captura aislada no
demuestra por sí sola la transmisión física de la ESP32.

| Captura | Qué muestra |
|---|---|
| [Tablas de la rama](base-datos/tablas-rama-production.png) | Proyecto, rama, base y lista de tablas del esquema `public`. |
| [Estructura de operadores](base-datos/technicians-estructura.png) | Columnas y restricciones de `technicians`, sin exponer hashes ni UID. |
| [Operadores y roles](base-datos/technicians-operadores-y-roles.png) | Dos cuentas `operator` y una `admin`, con edad y género registrados. |
| [Lecturas](base-datos/telemetry-readings-lecturas.png) | Lecturas históricas con temperatura, humedad, ocupación, puerta, origen y marca temporal. |
| [Tipos de alarma](base-datos/alarms-tipos-y-severidades.png) | Tipos y severidades visibles, con fecha de inicio y duración cuando están resueltas. |
| [Alarmas recientes](base-datos/alarms-recientes-con-duracion.png) | Historial reciente de alarmas con inicio, resolución y duración. |
| [Lotes y huevos](base-datos/lots-eggs-relacion.png) | Relación entre lote, huevo, incubadora, posición y fecha de registro. |
| [Aperturas de puerta](base-datos/door-events-aperturas-operadores.png) | Operador, método de acceso, apertura, cierre y conteo de huevos por evento. |

Las capturas de alarmas muestran condiciones `warning`; no acreditan por sí
solas la recepción de una alarma `critical` por MQTT en el frontend. La prueba
en vivo de ese recorrido sigue siendo necesaria.

## Video demostrativo

El [video del Observatorio 3D](smartegg-observatorio-3d.mp4) (3 min 51 s) muestra
el prototipo, la interfaz interactiva y la explicación del recorrido de los
datos. Es el video entregado para el proyecto; no se requiere otro video para
cada componente. La [prueba física](../PRUEBA_FISICA.md) es una guía para la
demostración presencial de RFID, puerta y posiciones.

## Montaje físico

El [diagrama de conexiones de Wokwi](diagrama-conexiones-wokwi.png) muestra el
circuito completo de la ESP32, sensores, actuadores, LCD y RC522. Su archivo
editable es [`firmware/wokwi/diagram.json`](../../firmware/wokwi/diagram.json).

| Fotografía | Qué muestra |
|---|---|
| [Servo de cerradura](fisico/servo-cerradura-montaje.jpeg) | Servo instalado junto al mecanismo de la puerta. |
| [Relés y protoboard](fisico/cableado-reles-protoboard.jpeg) | Cableado interior, módulo de relés y protoboard del montaje. |
| [Lector RFID](fisico/lector-rfid-cableado.jpeg) | Módulo RC522 y sus conexiones. |
| [ESP32](fisico/esp32-conexiones.jpeg) | Placa ESP32 y conexiones del prototipo. |
| [Sensor DHT11](fisico/sensor-dht11-interior.jpeg) | Sensor de temperatura y humedad instalado dentro de la incubadora. |
| [Mecanismo de la bandeja](fisico/servo-bandeja-mecanismo.jpeg) | Servo y transmisión mecánica de la bandeja. |
| [Ventilador](fisico/ventilador-interior.jpeg) | Ventilador instalado sobre los soportes de huevos. |
| [Foco de calefacción](fisico/foco-calefaccion-interior.jpeg) | Bombilla instalada en el interior. |
| [Marco de la puerta](fisico/detalle-marco-puerta.jpeg) | Detalle de la pieza instalada junto al marco. |

Estas fotografías documentan el montaje; el movimiento de la cerradura y las
lecturas se observan durante la demostración del equipo.

## Commits del equipo en GitHub

Las capturas de [`commits/`](commits/) muestran el historial de la rama
`develop` filtrado por `Proyecto_1_SmartEgg` y por integrante. Cada una deja
visibles al menos tres commits del proyecto, con su título y hash abreviado.

| Integrante | Captura |
|---|---|
| Alex Ricardo Castañeda Rodríguez | [Historial de Ricardo](commits/commits-alex-ricardo-castaneda.png) |
| Carlos Javier Pérez Pocón | [Historial de Carlos](commits/commits-carlos-perez.png) |
| José Adrián Orozco Ramírez | [Historial de José](commits/commits-jose-orozco.png) |
| Alex Oswaldo López Alquejay | [Historial de Alex](commits/commits-alex-lopez.png) |
| Kevin Rodrigo Sandoval Hernández | [Historial de Kevin](commits/commits-kevin-sandoval.png) |

Para completar una evidencia se guarda la captura original en esta carpeta y
se añade aquí su origen y resultado observado. Se ocultan únicamente
secretos y datos personales que no sean necesarios para la evaluación; no se
alteran lecturas, nombres de nodos ni estados del sistema.
