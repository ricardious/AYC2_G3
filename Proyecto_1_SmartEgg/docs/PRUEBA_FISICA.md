# Prueba física

## Preparación

- ESP32 DevKit conectado por USB.
- RC522 conectado según `firmware/README.md`.
- Servo de acceso con alimentación externa y tierra común con el ESP32.
- Final de carrera instalado de modo que la puerta cerrada presione su palanca; `COM` a
  GND, `NO` a GPIO 16 y `NC` sin conectar.
- Cuatro microinterruptores con palanca instalados bajo los soportes de los huevos.
- UID real de cada tarjeta registrado en `INITIAL_TECHNICIANS`.
- `secrets.h` creado a partir de `secrets.example.h`.
- Backend, PostgreSQL, Mosquitto y Grafana activos.

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
