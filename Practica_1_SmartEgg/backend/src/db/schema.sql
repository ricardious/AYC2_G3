-- ===========================================================================
--  SmartEgg — esquema de la base de datos (SQLite)
--  Práctica 1 · Arquitectura de Computadoras y Ensambladores 2 · Grupo 3
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
--  Técnicos (agrónomos que operan la incubadora)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tecnicos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT    NOT NULL,
  usuario     TEXT    NOT NULL UNIQUE,
  pin         TEXT    NOT NULL,
  carne       TEXT,
  rol         TEXT    NOT NULL DEFAULT 'tecnico',
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   TEXT    NOT NULL
);

-- ---------------------------------------------------------------------------
--  Lotes de incubación
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lotes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo               TEXT    NOT NULL UNIQUE,
  especie              TEXT    NOT NULL,
  raza                 TEXT,
  origen               TEXT,
  responsable          TEXT,
  fecha_ingreso        TEXT    NOT NULL,
  dias_incubacion      INTEGER NOT NULL DEFAULT 21,
  temperatura_objetivo REAL    NOT NULL DEFAULT 37.5,
  humedad_objetivo     REAL    NOT NULL DEFAULT 57.5,
  notas                TEXT,
  estado               TEXT    NOT NULL DEFAULT 'activo'
                         CHECK (estado IN ('activo','finalizado','descartado')),
  creado_en            TEXT    NOT NULL,
  actualizado_en       TEXT
);

-- ---------------------------------------------------------------------------
--  Huevos rotulados. La incubadora tiene 4 posiciones físicas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS huevos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id        INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  codigo         TEXT    NOT NULL UNIQUE,
  posicion       INTEGER NOT NULL CHECK (posicion BETWEEN 1 AND 4),
  peso_gramos    REAL,
  fecha_ingreso  TEXT    NOT NULL,
  estado         TEXT    NOT NULL DEFAULT 'incubando'
                   CHECK (estado IN ('incubando','eclosionado','descartado')),
  observaciones  TEXT,
  registrado_por INTEGER REFERENCES tecnicos(id),
  creado_en      TEXT    NOT NULL,
  actualizado_en TEXT
);

-- Una posición no puede tener dos huevos incubando al mismo tiempo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_huevos_posicion_activa
  ON huevos(posicion) WHERE estado = 'incubando';

CREATE INDEX IF NOT EXISTS ix_huevos_lote ON huevos(lote_id);

-- ---------------------------------------------------------------------------
--  Historial de lecturas de los sensores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lecturas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                TEXT NOT NULL,
  temperatura       REAL,
  humedad           REAL,
  sensor_ok         INTEGER NOT NULL DEFAULT 1,
  calefaccion       INTEGER NOT NULL DEFAULT 0,
  ventilador        INTEGER NOT NULL DEFAULT 0,
  buzzer            INTEGER NOT NULL DEFAULT 0,
  angulo_servo      INTEGER,
  espacios_ocupados INTEGER,
  espacios_libres   INTEGER,
  sistema_activo    INTEGER NOT NULL DEFAULT 1,
  puerta_abierta    INTEGER NOT NULL DEFAULT 0,
  alarma            INTEGER NOT NULL DEFAULT 0,
  rotaciones        INTEGER
);

CREATE INDEX IF NOT EXISTS ix_lecturas_ts ON lecturas(ts);

-- ---------------------------------------------------------------------------
--  Alarmas registradas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alarmas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT    NOT NULL,
  codigo      INTEGER NOT NULL,
  tipo        TEXT    NOT NULL,
  severidad   TEXT    NOT NULL DEFAULT 'media'
                CHECK (severidad IN ('critica','alta','media','baja')),
  mensaje     TEXT    NOT NULL,
  temperatura REAL,
  humedad     REAL,
  resuelta    INTEGER NOT NULL DEFAULT 0,
  ts_resuelta TEXT
);

CREATE INDEX IF NOT EXISTS ix_alarmas_ts ON alarmas(ts);

-- ---------------------------------------------------------------------------
--  Eventos del sistema (rotaciones, comandos, conexión/desconexión...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  valor       REAL
);

CREATE INDEX IF NOT EXISTS ix_eventos_ts ON eventos(ts);

-- ---------------------------------------------------------------------------
--  Configuración (umbrales que se sincronizan con el firmware)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL,
  descripcion    TEXT,
  actualizado_en TEXT
);
