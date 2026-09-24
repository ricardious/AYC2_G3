# Documento técnico · SmartEgg

Proyecto 1 — Arquitectura de Computadoras y Ensambladores 2, Grupo 3.

## Alcance y solución

SmartEgg integra una incubadora física con una consola de operación y una plataforma de observabilidad. La ESP32 lee temperatura, humedad, cuatro posiciones de huevos, RFID y el estado de la puerta; ejecuta el control local de calefacción, ventilación, giro, alarma y cerradura. FastAPI recibe las tramas por UART/USB, valida el acceso, guarda lecturas y eventos en PostgreSQL, y publica cambios en Mosquitto. Next.js presenta el estado y permite las operaciones autorizadas; Grafana separa el estado MQTT en vivo del historial SQL.

La [arquitectura detallada y el diagrama de conexiones](../README.md#arquitectura-general) identifican cada productor, consumidor y medio de transporte. El [montaje físico](../firmware/MONTAJE_PASO_A_PASO.md) y la [referencia del firmware](../firmware/README.md) documentan los pines, componentes y tareas. El cliente web no reemplaza los controles locales de seguridad de la ESP32.

## Componentes y datos

| Componente | Responsabilidad | Interfaz principal |
|---|---|---|
| ESP32 y periféricos | Muestreo, control local, RFID, LCD y actuadores | UART/USB a FastAPI |
| FastAPI | Reglas de dominio, autorización, sesiones y exportación PDF | REST, WebSocket y Serial |
| PostgreSQL | Persistencia de cuentas, incubadoras, lecturas, lotes, huevos, alarmas y eventos | SQLAlchemy/Alembic; consultas de Grafana |
| Mosquitto | Distribución desacoplada del estado | MQTT TCP y WebSocket, cuentas con ACL |
| Next.js | Acceso, operación y consulta por rol | REST/WebSocket con FastAPI; MQTT/WebSocket |
| Grafana | Paneles en vivo e históricos | Datasources MQTT y PostgreSQL de lectura |

El modelo relacional está en [`db/schema.dbml`](../db/schema.dbml), con [diagrama entidad-relación y explicación de las tablas](../README.md#modelo-de-datos). Las migraciones versionadas viven en [`server/migrations`](../server/migrations); `postgres_data` conserva la base local. Si `DATABASE_URL` apunta a Neon, FastAPI usa esa base remota, mientras que Grafana requiere configurar explícitamente la misma rama y un usuario de lectura. No se debe confundir el contenedor PostgreSQL local con una réplica de Neon.

## Contratos de comunicación

La [tabla completa de topics](../mqtt/TOPICS.md) indica estructura, publicador, suscriptores, QoS, retained y ejemplos JSON. Los grupos principales son `smartegg/{id}/sensores/*`, `telemetria`, `actuadores/estado`, `alarmas/critica`, `status` y `acceso/eventos`. La cuenta del backend publica; las del navegador y Grafana tienen acceso acotado de lectura por ACL. El estado del nodo utiliza Last Will and Testament. Las alarmas y accesos son eventos, mientras que los valores actuales se conservan cuando corresponde como mensajes retained.

El [contrato REST y WebSocket](../server/README.md#contrato-de-api) usa `/api/v1`; OpenAPI se sirve en `/docs` y `/openapi.json` cuando el backend está activo. Los endpoints de operación web exigen JWT; las llamadas físicas de acceso requieren `X-Device-Key`, y el inicio RFID de la consola usa la clave de quiosco. La [comparación HTTP/MQTT](../README.md#http-vs-mqtt-en-smartegg) explica por qué REST se usa para consultas y operaciones puntuales, y MQTT para distribuir cambios y disponibilidad. El [formato de tramas seriales](../firmware/README.md) delimita la comunicación ESP32–backend.

## Usuarios, permisos y trazabilidad

Existen dos roles funcionales: `admin` administra cuentas, asignaciones, incubadoras y configuración; `operator` opera sobre sus incubadoras asignadas y es el único que puede abrir la puerta con RFID. Operador 1 y Operador 2 son dos cuentas independientes con el mismo rol `operator`, no roles adicionales. Ambos consultan las vistas permitidas y generan informes dentro de su alcance. La tabla `technicians` contiene el UID normalizado; `access_sessions`, `door_events` y `report_exports` preservan quién accedió, qué ocurrió y quién generó un informe. El [manual de usuario](MANUAL_USUARIO.md) describe la secuencia visible para cada rol. Las contraseñas, claves de dispositivo, UID reales y URL privadas no forman parte de las capturas ni de este documento.

## Despliegue y verificación

[`docker-compose.yml`](../docker-compose.yml) define PostgreSQL, Mosquitto, FastAPI y Grafana, más el trabajo de inicialización de contraseñas del broker. El cliente se ejecuta fuera de Compose. El backend depende de los healthchecks de base y broker, migra el esquema al arrancar y expone `/health`. [`docker-compose.serial.yml`](../docker-compose.serial.yml) incorpora el dispositivo USB cuando se prueba el prototipo. Los [comandos reproducibles](../README.md#reproducción-del-despliegue) están en el README principal conforme al enunciado. Los valores requeridos se preparan desde `.env.example`; `.env` y `client/.env.local` no se versionan.

La verificación completa distingue cuatro resultados: contenedores saludables, API y web accesibles, datos reales del nodo publicados/guardados, y respuesta física observada. Que Grafana abra o que el broker esté sano no demuestra por sí solo que el RC522, el servo o los sensores estén funcionando. La [prueba física](PRUEBA_FISICA.md) enumera el recorrido RFID autorizado y denegado, puerta y ocupación. El [índice de evidencias](evidencias/README.md) declara qué capturas existen y qué falta acreditar. El [guion del video](GUION_VIDEO.md) se concentra en la visualización p5.js y su respuesta a lecturas reales; el video final aún debe enlazarse cuando se publique.

## Pruebas y límites de la evidencia

Las pruebas automatizadas están en [`server/tests`](../server/tests) y en los directorios de pruebas del firmware descritos en su README. El modo demo del cliente sirve para inspeccionar la interfaz y no constituye evidencia de telemetría, RFID ni funcionamiento físico. Del mismo modo, un panel histórico con filas `DEMO-*` acredita el diseño de la consulta y la visualización, no mediciones provenientes del prototipo. La defensa debe acompañar este documento con capturas en vivo, salida real de Compose y el video del Observatorio alimentado por el nodo, sin presentar datos de ejemplo como datos del equipo.
