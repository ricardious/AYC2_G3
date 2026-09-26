# Prueba física

## Preparación

- ESP32 DevKit conectado por USB.
- RC522 conectado según [`firmware/README.md`](../firmware/README.md).
- Servo de acceso con alimentación externa y tierra común con el ESP32.
- Final de carrera instalado de modo que la puerta cerrada presione su palanca; `COM` a
  GND, `NO` a GPIO 16 y `NC` sin conectar.
- Cuatro microinterruptores con palanca instalados bajo los soportes de los huevos.
- UID real de cada tarjeta registrado en `INITIAL_TECHNICIANS`.
- Puente UART/USB del backend habilitado para el puerto del ESP32.
- Backend, PostgreSQL, Mosquitto y Grafana activos.
- Alimentación y tierra común comprobadas con el equipo apagado según la
  [guía de montaje](../firmware/MONTAJE_PASO_A_PASO.md).

El monitor serial y el backend no pueden abrir el mismo puerto USB al mismo
tiempo. Para revisar tramas en el monitor, detenga primero el puente serial;
ciérrelo antes de iniciar `./scripts/start-hardware.sh` y probar la web.

## Secuencia

1. Cargar `SmartEggESP32` en el ESP32.
2. Abrir `http://localhost:3000` y dejar visible la pantalla de acceso.
3. Acercar una tarjeta autorizada al RC522.
4. Confirmar que el servo desbloquea la puerta y el dashboard inicia la sesión del operador.
5. Abrir la puerta y registrar ingreso, retiro, inspección o mantenimiento.
6. Cerrar la puerta.
7. Confirmar que el servo bloquea el acceso y el dashboard cierra la sesión automáticamente.
8. Revisar el evento y los contadores de puerta en Grafana.
9. Repetir la prueba con una tarjeta no registrada y confirmar que el acceso sea rechazado.
10. Colocar y retirar un huevo de cada posición y comprobar que la ocupación cambie una
    sola vez por movimiento.

## Resultado esperado

| Acción | Resultado |
|---|---|
| Tarjeta autorizada | Inicio de sesión y desbloqueo |
| Puerta abierta | Sesión activa y operación disponible |
| Puerta cerrada | Bloqueo y cierre de sesión |
| Tarjeta desconocida | Acceso denegado |

## Registro de la prueba integral

Anote fecha, versión del firmware, código de incubadora y persona que ejecutó
la prueba. No marque una fila como aprobada por tener una fotografía del
componente: debe observar la respuesta durante la misma ejecución.

| Prueba | Señal física o serial esperada | Comprobación en plataforma | Resultado / evidencia |
|---|---|---|---|
| Inicio del nodo | LCD operativa y trama `MSG:...,TEMP:...,HUM:...` | `smartegg/{id}/telemetria` recibe una lectura nueva; aparece en web y Grafana | Pendiente |
| RFID autorizado | `RFID:<UID>`; LCD saluda y servo de GPIO 33 desbloquea | Sesión del operador y evento `authorized` en `smartegg/{id}/acceso/eventos` | Pendiente |
| Apertura y cierre | `ACCESS:DOOR,SESSION:<id>,STATE:OPEN/CLOSED`; cerradura se bloquea al cerrar | Fila de `door_events` con operador, inicio y cierre; contador de puerta actualizado | Pendiente |
| RFID no registrado | LCD indica acceso denegado y el servo permanece bloqueado | No se crea sesión autorizada; el evento `rejected` indica el motivo | Pendiente |
| Posiciones 1–4 | Al presionar y liberar cada palanca, `SLOTS` cambia una vez | Ocupación y espacios disponibles coinciden en MQTT, web y Grafana | Pendiente |
| Estado del nodo | Al desconectar el backend inesperadamente, comprobar el LWT | `smartegg/{id}/status` pasa a `offline` sin publicación manual | Pendiente |

Sustituya cada `Pendiente` por `Aprobado` o `Falló` **solo después** de ejecutar
la prueba; anote la hora, el valor observado y el enlace a la captura o video.
Ocultar un UID o una credencial en la evidencia no debe alterar el estado ni
los valores observados. Si algo falla, conserve el resultado y describa la
corrección antes de repetir la fila.
