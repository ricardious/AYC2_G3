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
| [frontend-login-sin-esp32.png](frontend-login-sin-esp32.png) | Pantalla de acceso capturada el 24-09-2026 desde Next.js local | Muestra **LECTOR SIN CONEXIÓN**; no acredita RFID. |
| [frontend-control-demo.png](frontend-control-demo.png) | Centro de control capturado el 24-09-2026 en modo desarrollo | Lleva la marca **MODO DEMO · DATOS DE EJEMPLO**; no son mediciones físicas. |
| [frontend-historial-demo.png](frontend-historial-demo.png) | Vista Historial del cliente capturada el 24-09-2026 | Son 120 lecturas generadas por el modo demo, no por PostgreSQL ni la ESP32. |
| [frontend-reportes-demo.png](frontend-reportes-demo.png) | Vista previa de Reportes capturada el 24-09-2026 | No acredita un PDF descargado ni un informe de datos reales. |
| [grafana-tiempo-real-sin-nodo.png](grafana-tiempo-real-sin-nodo.png) | Dashboard MQTT provisionado, capturado el 24-09-2026 | Paneles vacíos porque no había publicación del nodo; no cumple la evidencia de lectura en vivo. |
| [grafana-historico-actual-sin-nodo.png](grafana-historico-actual-sin-nodo.png) | Dashboard SQL abierto, capturado el 24-09-2026 | El rango elegido indica **SIN CONEXIÓN** y **No data**; no acredita telemetría real. |

## Capturas y demostraciones que faltan

- Grafana **Tiempo real** con lecturas `NODE-01` observadas mientras la ESP32
  transmite, más **Histórico** con esas mismas lecturas ya guardadas. Es
  importante mostrar timestamp, nodo y rango temporal, y no usar `DEMO-*`.
- Broker MQTT: suscripción a los topics reales de temperatura, humedad y
  estado, y publicación visible tras cambiar una condición física. No mostrar
  contraseñas de `.env` en la captura.
- Docker Compose con **broker, database, backend y grafana** activos y el
  endpoint `/health` respondiendo. Una captura con solo parte del stack no
  acredita el despliegue completo.
- Commits verificables del proyecto en GitHub. El historial local o capturas
  de otra carpeta no sustituyen la evidencia de contribuciones del Proyecto 1.
- Secuencia física: tarjeta autorizada y denegada, LCD, servo de cerradura,
  final de carrera, lectura de posiciones, alarma y ventilador. La secuencia
  está definida en [Prueba física](../PRUEBA_FISICA.md).
- Video final de 2–4 minutos según el [guion](../GUION_VIDEO.md): Observatorio
  p5.js interactivo respondiendo a lecturas reales, con enlace accesible desde
  el README o este índice al publicarlo.

Para completar una evidencia se guarda la captura original en esta carpeta y
se añade aquí su fecha, origen y resultado observado. Se ocultan únicamente
secretos y datos personales que no sean necesarios para la evaluación; no se
alteran lecturas, nombres de nodos ni estados del sistema.
