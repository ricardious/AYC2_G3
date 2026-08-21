# Nuestro repaso contra la rúbrica

Usamos esta tabla para revisar, criterio por criterio, qué ya teníamos resuelto en el
firmware y qué nos faltaba comprobar con el hardware armado.

| Criterio físico/firmware | Cómo lo implementamos | Validación física pendiente |
|---|---|---|
| C++ en Arduino Uno R3 | Sketch `SmartEggFirmware` compatible con Arduino IDE | Compilar y cargar en el Uno real |
| DHT y medición estable | DHT11 cada 2 s, con tres fallos antes de declarar desconexión | Comparar con instrumento de referencia |
| LCD + Serial Plotter | LCD 16×2 con render diferencial cada 150 ms y trama etiquetada cada 2 s | Tomar las capturas que pide el PDF |
| Relé, servo, buzzer, final de carrera | Pines y drivers centralizados; confirmamos relés activos en bajo y buzzer activo de 5 V | Validar el montaje completo |
| Conteo de espacios | Cuatro finales de carrera independientes | Probar cada posición con un huevo |
| Control por umbrales | Calor bajo 37 °C, ventilación sobre 38 °C, con histéresis | Prueba controlada de frío/calor |
| Alarmas | Temperatura/humedad fuera de rango o DHT desconectado, con el buzzer activo de 5 V | Comprobar la alarma con el montaje final |
| Rotación periódica | Servo 90°±45° cada 120 s, alternando sentidos | Verificar la geometría sin forzar la bandeja |
| Multitarea | Dos tareas FreeRTOS preemptivas con responsabilidades independientes | Evidenciar la ejecución concurrente |
| Mínimo de interrupciones | INT0 `CHANGE` para la palanca e INT1 para la puerta | Accionar ambas durante la telemetría |
| UART/USB | Protocolo numérico y comandos JSON a 115200 | Integrar con `server/` |
| Manejo de errores | Salida segura, DHT, configuración, comandos y overflow | Desconectar componentes uno por uno |

Con el código cubrimos todo lo que se puede evaluar por software. Las fotografías, el
diagrama eléctrico, la captura del Serial Plotter, el encapsulado y la demostración
física los tenemos que producir con el hardware real, porque no hay forma de validarlos
desde el repositorio.
