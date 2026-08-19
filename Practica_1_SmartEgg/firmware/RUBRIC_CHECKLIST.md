# Comprobación contra la rúbrica

| Criterio físico/firmware | Implementación | Validación física pendiente |
|---|---|---|
| C++ en Arduino Uno R3 | Sketch `SmartEggFirmware` compatible con Arduino IDE | Compilar y cargar en el Uno real |
| DHT y medición estable | DHT11 cada 2 s, tres fallos antes de declarar desconexión | Comparar con instrumento de referencia |
| LCD + Serial Plotter | LCD 16×2 cada 500 ms y trama etiquetada cada 2 s | Capturas requeridas por el PDF |
| Relé, servo, buzzer, final de carrera | Pines y drivers centralizados; relés activos en alto y buzzer activo de 5 V confirmados | Validar el montaje completo |
| Conteo de espacios | Cuatro finales de carrera independientes | Probar cada posición con un huevo |
| Control por umbrales | Calor bajo 37 °C; ventilación sobre 38 °C; histéresis | Prueba controlada de frío/calor |
| Alarmas | Temperatura/humedad fuera de rango o DHT desconectado; buzzer activo de 5 V confirmado | Comprobar alarma con el montaje final |
| Rotación periódica | Servo 90°±45° cada 120 s, alternando sentidos | Verificar geometría sin forzar bandeja |
| Multitarea | Dos tareas FreeRTOS preemptivas con responsabilidades independientes | Evidenciar ejecución concurrente |
| Mínimo de interrupciones | INT0 para botón e INT1 para puerta | Accionar ambos durante telemetría |
| UART/USB | Protocolo numérico y comandos JSON a 115200 | Integrar con `server/` |
| Manejo de errores | Salida segura, DHT, configuración, comandos y overflow | Desconectar componentes individualmente |

El código cubre lo evaluable por software. Fotografías, diagrama eléctrico, captura de
Serial Plotter, encapsulado y demostración física deben producirse con el hardware real;
no pueden validarse desde el repositorio.
