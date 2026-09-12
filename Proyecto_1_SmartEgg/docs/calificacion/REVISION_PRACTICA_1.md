# Revisión de la hoja de calificación de la Práctica 1

La hoja revisada corresponde a la **Práctica 1 — SmartEgg: Incubadora Inteligente
IoT — Maqueta Física**. No sustituye la rúbrica del Proyecto 1, pero sus criterios
siguen siendo importantes porque el Proyecto 1 reutiliza el nodo físico y la
plataforma construida anteriormente.

## Estado verificado

| Componente | Resultado |
|---|---|
| Backend | 19 pruebas aprobadas |
| Frontend | ESLint aprobado y compilación de producción aprobada |
| Firmware | Compilación de PlatformIO para `esp32dev` aprobada |
| Docker Compose | Configuración válida |
| Repositorio | Rama `develop` sincronizada antes de esta revisión |

Los estados de esta revisión significan:

- **Listo:** existe, compila o cuenta con pruebas automatizadas.
- **Demostrar:** está implementado, pero necesita evidencia con el montaje real.
- **Pendiente:** no existe todavía o la evidencia requerida no está en el repositorio.

## Capa física — 30 puntos

| Criterio | Pts. | Estado | Evidencia actual | Acción para asegurar el punteo |
|---|---:|---|---|---|
| Lectura correcta de temperatura y humedad | 6 | Demostrar | Lectura DHT11 en `Hardware.cpp`; firmware compilado | Comparar durante varios minutos contra otro termómetro/higrómetro y grabar la lectura física |
| Presentación clara en LCD y Serial Plotter | 2 | Demostrar | LCD 16x2 y trama serial implementados | Mostrar ambos al mismo tiempo; confirmar que el formato abre curvas legibles en Serial Plotter |
| Medidas precisas y estables | 2 | Demostrar | Muestreo periódico, checksum y manejo de fallos consecutivos | Registrar una prueba continua y documentar tolerancia, estabilidad y recuperación ante desconexión del DHT11 |
| Posicionamiento e integración de DHT y actuadores | 5 | Demostrar | DHT11, dos relés, buzzer y servomotor definidos en firmware y Wokwi | Cablear el montaje final, sujetar cada componente y mostrar su activación real |
| Control automático por umbrales y rotación periódica | 5 | Demostrar | Histéresis, calefacción, ventilación, alarma y rotación implementadas | Forzar valores bajo, normal, alto y crítico; mostrar la rotación sin comandos manuales |
| Uso de multitarea | 3 | Listo | Tareas FreeRTOS `SensorControl` y `Communication` en núcleos separados | Explicar responsabilidades, prioridades y periodos durante la defensa |
| Mínimo de dos interrupciones o FreeRTOS | 3 | Listo | FreeRTOS y dos ISR GPIO: puerta e interruptor general | Incluir un diagrama de automatización y señalar las ISR en el código |
| Encapsulado estético y profesional | 9 | Pendiente | No hay fotografías ni diseño de carcasa en el repositorio | Construir una maqueta limpia, rotulada, con cableado oculto y acceso seguro a huevos y electrónica |
| Encapsulado impreso en 3D, visible y funcional | 5 | Pendiente | No hay archivos STL ni fotografías | Diseñar/imprimir la carcasa o recuperar la usada en Práctica 1; subir STL, renders y fotografías |

## Capa de plataforma IoT — 15 puntos

| Criterio | Pts. | Estado | Evidencia actual | Acción para asegurar el punteo |
|---|---:|---|---|---|
| API REST funcional en red local | 8 | Listo | FastAPI, OpenAPI, autenticación y más de seis endpoints; pruebas aprobadas | Levantar Docker, abrir `/docs` desde otro dispositivo de la red y guardar captura o video |
| Persistencia de lotes y huevos | 7 | Listo | PostgreSQL, migraciones, relaciones de lotes/huevos y pruebas de esquema/API | Registrar un lote y un huevo desde el frontend, reiniciar los servicios y demostrar que permanecen |

## Capa de aplicación — 30 puntos

| Criterio | Pts. | Estado | Evidencia actual | Acción para asegurar el punteo |
|---|---:|---|---|---|
| Datos y sensores activos en tiempo real | 5 | Listo | REST, WebSocket y MQTT alimentan el dashboard | Grabar sensor, frontend y alarma cambiando en menos de tres segundos |
| Ficha de identificación del huevo rotulado | 5 | Listo | Formulario ligado a lote, posición física, código y fecha | Mostrar el registro completo y su persistencia en el historial |
| Validación y control de errores | 5 | Listo | Validaciones de campos, fechas, lotes, posiciones y errores del API | Demostrar al menos tres entradas inválidas y un registro válido |
| Generación y descarga de reporte PDF | 7 | Demostrar | Reporte A4 con técnico, lotes, mínimos, promedios, máximos y alarmas | Configurar un archivo real en `SMARTEGG_REPORT_LOGO_PATH`, generar el PDF y subir una muestra |
| Calidad, integridad y creatividad del frontend | 5 | Listo | Dashboard completo, temas, observatorio p5.js, Chart.js y flujo RFID | Preparar datos reales para que ninguna vista aparezca vacía durante la demostración |
| Funcionamiento desde dispositivo móvil | 3 | Demostrar | Interfaz responsiva y revisión de breakpoints documentada | Probar desde un teléfono real en la misma red y guardar captura o video |

## Documentación — 10 puntos

| Criterio | Pts. | Estado | Evidencia actual | Acción para asegurar el punteo |
|---|---:|---|---|---|
| Descripción de la solución | 1 | Listo | README general | Mantenerla alineada con el montaje final |
| Diagrama de capas del framework IoT | 1.5 | Listo | Arquitectura general en Mermaid | Nombrar explícitamente las capas física, plataforma y aplicación |
| Mockups del prototipo físico | 0.5 | Pendiente | Wokwi muestra conexiones, no el aspecto de la maqueta | Agregar vistas frontal, lateral e interior del encapsulado antes de construirlo |
| Fotografías del proceso | 0.5 | Pendiente | No existen en `docs/evidencias` | Tomar fotos del armado, cableado, pruebas y montaje de sensores |
| Fotografías del prototipo final | 0.5 | Pendiente | No existen en `docs/evidencias` | Tomar fotografías nítidas desde varios ángulos con la LCD encendida |
| Mockup de la Web App/Móvil | 0.5 | Demostrar | Hay capturas del frontend terminado | Identificar una captura de escritorio y otra móvil como evidencia del diseño |
| Diagrama de conexiones | 1 | Listo | `firmware/wokwi/diagram.json` | Exportar una captura completa y legible del circuito de Wokwi |
| Diagrama de arquitectura de software | 0.5 | Listo | Mermaid del flujo ESP32, backend, PostgreSQL, Mosquitto, frontend y Grafana | Verificar que coincida con el canal serial usado en la demostración |
| Diagrama de automatización | 1 | Pendiente | Las tareas están descritas, pero falta el diagrama | Agregar flujo de tareas, periodos, prioridades, ISR y recursos compartidos |
| Documentación de la API | 0.5 | Listo | OpenAPI/Swagger en `/docs` | Agregar una captura y, de ser posible, exportar `openapi.json` |
| Manual de usuario | 1 | Pendiente | No existe un manual completo | Documentar encendido, acceso RFID, registro, monitoreo, alarmas, reportes y apagado |
| Capturas de commits en GitHub | 1.5 | Pendiente | El historial existe, pero no hay capturas | Capturar commits progresivos de cada integrante; cada persona debe poder identificar los suyos |

## Preguntas — 5 puntos

Las cinco preguntas dependen de la defensa. Cada integrante debe poder explicar sin
leer:

1. Recorrido completo de una lectura desde el DHT11 hasta el frontend y la base de datos.
2. Tareas FreeRTOS, prioridades, núcleos, interrupciones y protección del estado compartido.
3. Umbrales, histéresis, activación de relés, buzzer y rotación automática.
4. Contrato serial, endpoints REST y persistencia de lotes/huevos.
5. Manejo de fallos: DHT desconectado, serial caído, API no disponible y datos inválidos.

## Penalizaciones que deben bloquearse

| Penalización | Riesgo actual | Control previo a la calificación |
|---|---|---|
| Sin microcontrolador: -100 % | Bajo | Llevar ESP32 funcional, cable USB y firmware ya cargado |
| Sin multitarea: -100 % | Bajo | No retirar FreeRTOS; mostrar las dos tareas y las ISR |
| Sin API REST local: -20 % | Medio | Probar desde otro dispositivo y no depender de `localhost` del evaluador |
| Sin base de datos: -20 % | Bajo | Levantar PostgreSQL y demostrar persistencia después de reiniciar |
| Documentación incompleta: -20 % | Alto | Completar mockups, fotografías, automatización, manual y commits |
| Entrega tardía: -50 % | Depende de la fecha | Subir código, documentos y evidencias antes de iniciar la calificación |

## Orden de trabajo para llegar al máximo

1. Completar el encapsulado físico e impresión 3D: concentra 14 puntos.
2. Corregir el flujo RFID/puerta para que el ESP32 use el canal serial exigido.
3. Probar físicamente DHT11, LCD, relés, buzzer, servos e interrupciones.
4. Crear mockups del prototipo, diagrama de automatización y manual de usuario.
5. Generar el PDF real con logo y probar el frontend desde un teléfono.
6. Capturar API, persistencia, MQTT, Grafana, Docker, proceso físico y commits.
7. Ensayar las cinco preguntas y congelar el repositorio antes de calificar.

