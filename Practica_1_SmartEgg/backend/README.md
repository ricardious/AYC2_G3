# Backend — SmartEgg

API REST + puente serial + base de datos. Es la capa que conecta el Arduino con la
aplicación web.

## Puesta en marcha

```bash
npm install
```
```bash
cp .env.example .env
```
```bash
npm run seed
```
```bash
npm start
```

La consola imprime la URL local y las de la red (esas son las que se usan para abrir
la app desde el celular).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca el servidor conectándose al Arduino real |
| `npm run dev` | Igual, pero reinicia al guardar cambios |
| `npm run sim` | **Modo simulación**: genera datos sin necesitar hardware |
| `npm run seed` | Carga técnicos, un lote, 4 huevos y lecturas de ejemplo |
| `npm run reset-db` | Borra la base y la vuelve a crear con datos de ejemplo |
| `npm run puertos` | Lista los puertos COM del equipo |

> **Sin Arduino todavía?** Usen `npm run sim`. La incubadora virtual reproduce la misma
> física y el mismo protocolo, así el frontend se puede desarrollar y demostrar completo.

## Configuración (`.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `PUERTO` | `4000` | Puerto HTTP |
| `HOST` | `0.0.0.0` | `0.0.0.0` permite entrar desde la red local |
| `SERIAL_PUERTO` | `AUTO` | `COM3`, `/dev/ttyACM0`… o `AUTO` para detectar |
| `SERIAL_BAUDIOS` | `115200` | Debe coincidir con el firmware |
| `SIMULAR` | `0` | `1` activa la incubadora virtual |
| `DB_ARCHIVO` | `./data/smartegg.db` | Archivo SQLite |
| `GUARDAR_CADA_MS` | `5000` | Cada cuánto se persiste una lectura |
| `CORS_ORIGEN` | `*` | Orígenes permitidos |

## Arquitectura

```
src/
├── index.js            arranque de Express + HTTP + Socket.IO
├── config.js           .env, rutas y helpers de fecha local
├── estado.js           estado vivo en memoria, persistencia y alarmas
├── validacion.js       validador de cuerpos de petición
├── db/
│   ├── index.js        conexión SQLite, esquema y semillas mínimas
│   ├── schema.sql      DDL de las 7 tablas
│   └── seed.js         datos de ejemplo
├── serial/
│   ├── puerto.js       apertura, reconexión y envío de comandos
│   ├── protocolo.js    parseo de tramas y catálogo de alarmas
│   ├── simulador.js    incubadora virtual
│   └── listar-puertos.js
├── realtime/socket.js  difusión por WebSocket
├── routes/             auth · estado · lecturas · lotes · huevos ·
│                       alarmas · control · reportes
└── middleware/errores.js
```

## Flujo de datos

```
Arduino ──JSON/serial──> puerto.js ──> protocolo.js ──> estado.js
                                                          │
                                    ┌─────────────────────┼──────────────────┐
                                    ▼                     ▼                  ▼
                              SQLite (lecturas,     Socket.IO           API REST
                              alarmas, eventos)     (tiempo real)      (consultas)
```

## Base de datos

SQLite mediante `better-sqlite3`. Siete tablas: `tecnicos`, `lotes`, `huevos`,
`lecturas`, `alarmas`, `eventos` y `configuracion`.

Se eligió SQLite porque **no requiere instalar ningún servidor**: cada integrante clona el
repositorio, corre `npm install` y ya tiene una base funcionando. El esquema es SQL estándar,
así que migrar a PostgreSQL para el Proyecto 2 es cambiar el driver y poco más.

Detalles que vale la pena notar:

- Índice único **parcial** que impide dos huevos incubando en la misma posición:
  `CREATE UNIQUE INDEX ... ON huevos(posicion) WHERE estado = 'incubando'`.
- `ON DELETE CASCADE` de `lotes` hacia `huevos`.
- Las marcas de tiempo se guardan en **hora local** (`YYYY-MM-DD HH:MM:SS`), para que
  `date(ts) = '2026-08-06'` corresponda al día real en Guatemala.

## Endpoints

Documentación completa en [`../docs/api/API.md`](../docs/api/API.md).

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `El Arduino no está conectado` | Puerto ocupado por el Monitor Serie | Cerrar el Arduino IDE |
| No detecta el puerto | Driver CH340 faltante (clones) | Instalar el driver y correr `npm run puertos` |
| Llegan tramas pero no se parsean | El firmware quedó en `MODE:PLOT` | Enviar `MODE:JSON` desde el Monitor Serie |
| El celular no abre la app | Firewall de Windows | Permitir Node.js en redes privadas |
| `SQLITE_BUSY` | Dos instancias del backend | Dejar sólo una corriendo |
