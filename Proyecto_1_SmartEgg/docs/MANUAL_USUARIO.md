# Manual de usuario · SmartEgg

## Acceso

La consola abre en `http://localhost:3000` cuando el cliente está en ejecución. El usuario ingresa sus credenciales en la pantalla de acceso. En la instalación física, la pantalla también indica el estado del lector RC522: listo, enlazando, sin conexión o no configurado. Una tarjeta asociada a un operador puede iniciar la sesión de acceso; una tarjeta desconocida no libera la cerradura. El administrador entra con usuario y contraseña: su rol no tiene permiso de apertura RFID.

Si la pantalla muestra un error de conexión, se comprueba primero que `GET http://localhost:8000/health` responda y que el navegador pueda alcanzar la API. El modo demo disponible en desarrollo mediante tres toques al emblema del huevo muestra datos de ejemplo y no se usa para operar la incubadora ni para acreditar una prueba física.

## Navegación y consulta

La barra lateral ofrece **Centro de control**, **Observatorio**, **Incubación**, **Historial**, **Reportes** y **Perfiles**. **Configuración** aparece al administrador. La selección de incubadora determina el nodo sobre el que se muestran lecturas y, para un operador, solo se ofrecen las incubadoras asignadas.

En **Centro de control** se inspeccionan temperatura, humedad, estado de actuadores, bandeja y alertas. **Observatorio** resume la visualización del nodo. **Historial** presenta las lecturas guardadas y sus tendencias: una pantalla vacía puede significar que aún no llegaron tramas del equipo, no necesariamente que el panel falle. Los dos tableros de Grafana, accesibles por separado en `http://localhost:3001`, muestran respectivamente mensajes MQTT desde que se abre el tablero y datos persistidos en PostgreSQL. El usuario de Grafana se configura en `.env`.

Cuando llega una alarma crítica, la consola puede reproducir `critical-alarm.mp3`. El control **♫ SONIDO ON / ♫ SILENCIADO** cambia la preferencia y **TEST** comprueba la reproducción; si el navegador bloqueó el audio automático, **♫ ACTIVAR** requiere una interacción del usuario. La alarma visual y su registro no dependen del sonido del navegador.

## Operación del operador

Para abrir la puerta se usa una tarjeta RFID registrada en el operador y en el nodo autorizado. La ESP32 consulta la autorización al backend; si recibe permiso, muestra el estado de acceso y acciona la cerradura. En la consola, el operador puede seleccionar **◇ PUERTA** y preparar la operación como **ingreso**, **retiro**, **inspección** o **mantenimiento**. Para ingreso/retiro se indica la cantidad de huevos; también se pueden agregar observaciones. El registro queda vinculado a su nombre. Tras abrir y cerrar la puerta, el final de carrera confirma el cierre, se bloquea la cerradura y termina la sesión de acceso. No se debe forzar la puerta si la autorización o el servo no responden.

En **Incubación**, la ocupación física de cada posición procede de los microinterruptores. Una posición detectada sin ficha aparece **SIN IDENTIFICAR**. **Registrar huevo** permite asociar el código rotulado, lote, fecha de ingreso, posición y observaciones. Primero debe existir detección física; la ficha guardada no sustituye al sensor. Para evitar duplicados, el backend valida lote, posición y capacidad.

## Administrador e informes

En **Perfiles**, el administrador crea operadores, registra su UID RFID y asigna incubadoras. En **Configuración** cambia los parámetros permitidos del nodo. El administrador puede revisar la actividad general, pero no obtiene por ello la facultad de abrir la puerta con RFID. Una cuenta existente no cambia su contraseña automáticamente tras reiniciar el backend.

**Operador 1** y **Operador 2** son cuentas separadas de tipo `operator`: cada una entra con su propia tarjeta o contraseña y consulta únicamente sus diagnósticos, lotes e informes autorizados. El administrador usa una tercera cuenta de tipo `admin` y dispone de la vista general. Para comprobar la separación durante la evaluación se ingresa por turno con las tres cuentas; no se comparten tarjetas ni sesiones.

En **Reportes**, **GENERAR PDF** descarga el informe del ciclo. Un operador obtiene el alcance autorizado de sus propias incubadoras; el administrador puede elegir **Vista general** o un operador concreto. El archivo registra datos persistidos, por lo que requiere que la API y la base estén disponibles. No debe interpretarse la lámina de vista previa como un informe generado: el resultado verificable es el PDF descargado.

## Incidencias frecuentes

| Síntoma | Comprobación |
|---|---|
| Lector sin conexión o “sin respuesta” | API saludable, backend conectado al dispositivo serial correcto, baudrate 115200 y puerto no ocupado por otro monitor. |
| Tarjeta denegada | UID completo y normalizado en el perfil `operator`, asignación al nodo y backend accesible. |
| Cerradura no se mueve | Alimentación externa adecuada del servo, tierra común, cable de señal y ángulos configurados; comprobar primero la respuesta de autorización. |
| Sin lecturas en el panel | Verificar que la ESP32 envía tramas, que el backend las ingiere y que el nodo seleccionado coincide con su código. |
| Grafana histórico vacío | Confirmar datasource PostgreSQL, rama/base correcta si se usa Neon y lecturas persistidas en el rango temporal seleccionado. |
| Sin sonido de alarma | Habilitar audio desde el control lateral y probar con **TEST**; revisar volumen y permisos del navegador. |

Para un diagnóstico físico reproducible se sigue la [prueba física](PRUEBA_FISICA.md); el [documento técnico](DOCUMENTO_TECNICO.md) explica los componentes y sus contratos.
