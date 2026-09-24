# Guion del video demostrativo de visualización

La hoja de calificación reserva el video de **2–4 minutos** para explicar la
visualización interactiva de **p5.js** y cómo responde a los **datos reales** de
SmartEgg. La prueba RFID y de puerta complementa la defensa física, pero no
sustituye esta demostración. El enlace al video se incorporará al README
principal cuando el archivo esté publicado; aún no existe una grabación final.

| Tiempo aproximado | Toma y explicación |
|---|---|
| 0:00–0:25 | Presentar brevemente la ESP32 conectada, el nodo seleccionado y el Observatorio abierto **sin la marca MODO DEMO**. Mostrar una lectura reciente con fecha/hora. |
| 0:25–1:05 | En el Observatorio de p5.js explicar la vista isométrica: el color cambia con la temperatura, las partículas con la humedad, su circulación con el ventilador y la inclinación de la bandeja con el ángulo del servo. |
| 1:05–1:50 | Mostrar al menos un cambio **medido por el nodo físico** y cómo cambia la escena sin recargar la página. Enseñar en la misma secuencia el valor numérico y el elemento visual correspondiente; no insertar datos simulados. |
| 1:50–2:30 | Interactuar con la visualización: separar capas, seleccionar una posición, alternar temperatura/humedad y pausar/reanudar la animación. Explicar qué representa cada interacción. |
| 2:30–3:15 | Relacionar la lectura con el flujo ESP32 → backend → frontend y, si está disponible, corroborarla en Grafana MQTT o en la gráfica de Chart.js con el mismo nodo y hora. |
| 3:15–3:45 | Resumir qué viene de REST/WebSocket y qué llega por MQTT; cerrar con la escena y la lectura real aún visibles. |

No es necesario agotar los cuatro minutos. Si se incluye RFID, una alarma o el
servo físico, se dejan como toma breve adicional sin desplazar la demostración
de p5.js. El video no debe depender de la incubadora `DEMO-01`, de valores
inyectados manualmente ni de una captura histórica con lotes `DEMO-*`.
