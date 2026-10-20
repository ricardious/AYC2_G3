# Guion del video demostrativo de visualización

El video dura entre **2 y 4 minutos**. El enunciado pide demostrar el Observatorio
interactivo de **Three.js** reaccionando a **datos reales** y explicar qué representa
cada elemento visual. Para demostrar el origen de esos datos, mostramos también la
incubadora física, la ESP32 y el LCD. La prueba completa de RFID, puerta y servos
se documenta por separado en [Prueba física](PRUEBA_FISICA.md); puede aparecer
brevemente aquí si ayuda a relacionar un estado visible con el prototipo.

## Secuencia sugerida · 3 minutos 40 segundos

| Tiempo | Imagen y acción real | Explicación en voz |
|---|---|---|
| 0:00–0:25 | Plano legible de la incubadora: ESP32, LCD, DHT11 y soportes con sus microinterruptores. Después, mostrar el Observatorio abierto sin **MODO DEMO**. | «Esta es nuestra incubadora SmartEgg. La ESP32 lee los sensores y la ocupación de los soportes; la plataforma muestra esas lecturas en el navegador». |
| 0:25–0:55 | Primer plano del LCD con temperatura, humedad y posiciones. Mostrar al lado los valores del mismo nodo en la web y la hora de la última lectura. | «La lectura que aparece aquí sale del equipo físico. El backend recibe la trama por USB y la publica por MQTT para actualizar la web». |
| 0:55–1:35 | Colocar un huevo o accionar una palanca de posición. Mantener visibles, en la misma secuencia o en pantalla dividida, el soporte, el cambio en el LCD y el huevo que aparece en la web. Retirarlo y mostrar el cambio inverso si el tiempo alcanza. | «Este microinterruptor detecta la posición ocupada. La ESP32 confirma el cambio, lo envía al backend y el Observatorio actualiza la ocupación sin recargar la página». |
| 1:35–2:20 | En el Observatorio, girar y acercar el modelo 3D, seleccionar la posición ocupada, cambiar entre temperatura y humedad y abrir el gabinete visualmente. | «El número muestra la temperatura o humedad medida; las partículas ilustran la humedad. El color distingue la capa seleccionada o una alarma crítica. Abrir este gabinete solo cambia la vista, no acciona la puerta física». |
| 2:20–2:55 | Regresar al prototipo con el Observatorio visible. Repetir un cambio físico de otra posición o, si ocurre durante la grabación, mostrar un actuador funcionando y su estado correspondiente en el modelo. | «Así se ve la relación entre el elemento físico y su representación. El ventilador y la inclinación de la bandeja reflejan el estado reportado por el nodo; no son una simulación del clima». |
| 2:55–3:20 | Mostrar brevemente `smartegg/{codigo}/telemetria` en MQTT Explorer o la gráfica en vivo, junto con el nodo y la hora de la lectura. | «La ESP32 no se conecta directamente al broker: transmite por serial al backend, que publica MQTT. REST consulta el estado inicial y el historial guardado en PostgreSQL». |
| 3:20–3:40 | Cerrar con el prototipo y el Observatorio en pantalla, ambos mostrando una lectura reciente. | «El recorrido queda completo: sensor y posición física, LCD, serial, MQTT y visualización interactiva con datos reales». |

## Criterios para la grabación

- La acción física y su resultado en LCD y web deben poder compararse. Un plano
  conjunto o pantalla dividida sirve mejor que tres clips sin continuidad. No
  aceleramos ni ocultamos el tiempo de propagación real.
- El cambio de ocupación es la prueba principal porque se puede provocar de
  forma controlada. No hace falta calentar el DHT11 ni alterar los umbrales para
  forzar una variación de temperatura.
- Los valores de la web deben proceder de la ESP32 conectada, no de `DEMO-01`,
  una publicación manual o una captura histórica. Si falta la conexión física,
  dejamos esta toma pendiente en lugar de presentarla como evidencia real.
- Mostramos solo actuadores o estados que funcionen durante la grabación. RFID,
  servo de cerradura y alarma pueden quedar para la evidencia física completa;
  no desplazan la demostración del Observatorio requerida para este video.

El [video final del Observatorio 3D](evidencias/smartegg-observatorio-3d.mp4)
está disponible en el repositorio y enlazado desde el README principal.
