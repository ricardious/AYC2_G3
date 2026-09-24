-- Consultas del dashboard "SmartEgg - Histórico" (datasource PostgreSQL).
-- Cada bloque corresponde a un panel, en el mismo orden en que aparecen.
-- Las variables ${incubator_id}, ${lot_id}, ${egg_id} y ${operator_id} se definen
-- en el dashboard. Envolvemos ${lot_id} y ${egg_id} en NULLIF para que un panel sin
-- selección devuelva "sin datos" en lugar de un error de sintaxis.
-- Los límites de temperatura y humedad salen de incubator_configs.

-- Estado del nodo
SELECT CASE WHEN is_online AND last_seen_at > NOW() - INTERVAL '2 minutes'
THEN 'online' ELSE 'offline' END AS "Estado"
FROM incubators WHERE id = ${incubator_id};

-- Temperatura promedio
SELECT $__timeGroupAlias(recorded_at, $__interval), AVG(temperature_c) AS "Temperatura"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Humedad promedio
SELECT $__timeGroupAlias(recorded_at, $__interval), AVG(humidity_pct) AS "Humedad"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Tiempo en rango óptimo
SELECT 100.0 * AVG(CASE
  WHEN t.temperature_c BETWEEN c.temperature_min_c AND c.temperature_max_c
   AND t.humidity_pct BETWEEN c.humidity_min_pct AND c.humidity_max_pct
  THEN 1 ELSE 0 END) AS "En rango"
FROM telemetry_readings AS t
JOIN incubator_configs AS c ON c.incubator_id = t.incubator_id
WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at);

-- Muestras registradas
SELECT $__timeGroupAlias(recorded_at, $__interval), COUNT(*) AS "Muestras"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Alarmas activas
SELECT COUNT(*) AS "Alarmas activas" FROM alarms
WHERE incubator_id = ${incubator_id} AND resolved_at IS NULL;

-- Temperatura · promedio y rango por intervalo
SELECT $__timeGroupAlias(recorded_at, $__interval, NULL),
  AVG(temperature_c) AS "Temperatura",
  MIN(temperature_c) AS "Mínima",
  MAX(temperature_c) AS "Máxima"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Tiempo por zona térmica
SELECT
  100.0 * AVG((t.temperature_c < c.temperature_min_c)::int) AS "Baja",
  100.0 * AVG((t.temperature_c BETWEEN c.temperature_min_c AND c.temperature_max_c)::int) AS "Óptima",
  100.0 * AVG((t.temperature_c > c.temperature_max_c AND t.temperature_c < c.critical_temperature_c)::int) AS "Alta",
  100.0 * AVG((t.temperature_c >= c.critical_temperature_c)::int) AS "Crítica"
FROM telemetry_readings AS t
JOIN incubator_configs AS c ON c.incubator_id = t.incubator_id
WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at);

-- Humedad · promedio y rango por intervalo
SELECT $__timeGroupAlias(recorded_at, $__interval, NULL),
  AVG(humidity_pct) AS "Humedad",
  MIN(humidity_pct) AS "Mínima",
  MAX(humidity_pct) AS "Máxima"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Tiempo por zona de humedad
SELECT
  100.0 * AVG((t.humidity_pct < c.humidity_min_pct)::int) AS "Baja",
  100.0 * AVG((t.humidity_pct BETWEEN c.humidity_min_pct AND c.humidity_max_pct)::int) AS "Óptima",
  100.0 * AVG((t.humidity_pct > c.humidity_max_pct)::int) AS "Alta"
FROM telemetry_readings AS t
JOIN incubator_configs AS c ON c.incubator_id = t.incubator_id
WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at);

-- Línea de tiempo de la cámara
SELECT $__timeGroupAlias(t.recorded_at, $__interval, NULL),
  CASE
    WHEN AVG(t.temperature_c) >= MIN(c.critical_temperature_c) THEN 'Crítica'
    WHEN AVG(t.temperature_c) > MIN(c.temperature_max_c) THEN 'Alta'
    WHEN AVG(t.temperature_c) < MIN(c.temperature_min_c) THEN 'Baja'
    ELSE 'Óptima' END AS "Temperatura",
  CASE
    WHEN AVG(t.humidity_pct) > MIN(c.humidity_max_pct) THEN 'Alta'
    WHEN AVG(t.humidity_pct) < MIN(c.humidity_min_pct) THEN 'Baja'
    ELSE 'Óptima' END AS "Humedad",
  CASE WHEN BOOL_OR(COALESCE(t.door_open, FALSE)) THEN 'Abierta' ELSE 'Cerrada' END AS "Puerta",
  CASE WHEN BOOL_AND(COALESCE(t.sensor_ok, TRUE)) THEN 'OK' ELSE 'Falla' END AS "Sensor DHT11",
  CASE WHEN BOOL_AND(COALESCE(t.system_enabled, TRUE)) THEN 'Activo' ELSE 'Pausado' END AS "Sistema"
FROM telemetry_readings AS t
JOIN incubator_configs AS c ON c.incubator_id = t.incubator_id
WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at)
GROUP BY 1 ORDER BY 1;

-- Ocupación de la cámara
SELECT 100.0 * occupied_slots / NULLIF(occupied_slots + available_slots, 0) AS "Ocupación"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
ORDER BY recorded_at DESC LIMIT 1;

-- Posiciones ocupadas y disponibles
SELECT $__timeGroupAlias(recorded_at, $__interval, NULL),
  MAX(occupied_slots) AS "Ocupadas",
  MIN(available_slots) AS "Disponibles"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id} AND $__timeFilter(recorded_at)
GROUP BY 1 ORDER BY 1;

-- Rotaciones de bandeja
SELECT $__timeGroupAlias(performed_at, $__interval, 0), COUNT(*) AS "Rotaciones"
FROM rotation_events
WHERE incubator_id = ${incubator_id} AND $__timeFilter(performed_at)
GROUP BY 1 ORDER BY 1;

-- Última lectura
SELECT EXTRACT(EPOCH FROM MAX(recorded_at)) * 1000 AS "Última lectura"
FROM telemetry_readings WHERE incubator_id = ${incubator_id};

-- Huevos en incubación
SELECT COUNT(*) AS "Huevos" FROM eggs
WHERE incubator_id = ${incubator_id} AND status = 'incubating';

-- Lote ${lot_id:text} · Temperatura
SELECT MIN(t.temperature_c) AS "Mínima", AVG(t.temperature_c) AS "Promedio", MAX(t.temperature_c) AS "Máxima" FROM telemetry_readings AS t WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at) AND EXISTS (
SELECT 1 FROM eggs AS e
WHERE e.lot_id = NULLIF('${lot_id}', '')::int
  AND e.incubator_id = t.incubator_id
  AND t.recorded_at >= e.registered_at
  AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at));

-- Lote ${lot_id:text} · Humedad
SELECT MIN(t.humidity_pct) AS "Mínima", AVG(t.humidity_pct) AS "Promedio", MAX(t.humidity_pct) AS "Máxima" FROM telemetry_readings AS t WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at) AND EXISTS (
SELECT 1 FROM eggs AS e
WHERE e.lot_id = NULLIF('${lot_id}', '')::int
  AND e.incubator_id = t.incubator_id
  AND t.recorded_at >= e.registered_at
  AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at));

-- Huevo ${egg_id:text} · Temperatura
SELECT MIN(t.temperature_c) AS "Mínima", AVG(t.temperature_c) AS "Promedio", MAX(t.temperature_c) AS "Máxima" FROM telemetry_readings AS t JOIN eggs AS e
 ON e.id = NULLIF('${egg_id}', '')::int
AND e.incubator_id = t.incubator_id
AND t.recorded_at >= e.registered_at
AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at) WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at);

-- Huevo ${egg_id:text} · Humedad
SELECT MIN(t.humidity_pct) AS "Mínima", AVG(t.humidity_pct) AS "Promedio", MAX(t.humidity_pct) AS "Máxima" FROM telemetry_readings AS t JOIN eggs AS e
 ON e.id = NULLIF('${egg_id}', '')::int
AND e.incubator_id = t.incubator_id
AND t.recorded_at >= e.registered_at
AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at) WHERE t.incubator_id = ${incubator_id} AND $__timeFilter(t.recorded_at);

-- Resumen por lote
SELECT
  l.code AS "Lote",
  l.species AS "Especie",
  l.status AS "Estado",
  (SELECT COUNT(*) FROM eggs AS e2 WHERE e2.lot_id = l.id AND e2.incubator_id = ${incubator_id}) AS "Huevos",
  LEAST(100, GREATEST(0, 100.0 * (CURRENT_DATE - l.started_on)
    / NULLIF(l.expected_hatch_on - l.started_on, 0))) AS "Avance",
  MIN(t.temperature_c) AS "T. mín",
  AVG(t.temperature_c) AS "T. prom",
  MAX(t.temperature_c) AS "T. máx",
  MIN(t.humidity_pct) AS "H. mín",
  AVG(t.humidity_pct) AS "H. prom",
  MAX(t.humidity_pct) AS "H. máx"
FROM lots AS l
JOIN telemetry_readings AS t
  ON t.incubator_id = ${incubator_id}
 AND EXISTS (
   SELECT 1 FROM eggs AS e
   WHERE e.lot_id = l.id
     AND e.incubator_id = t.incubator_id
     AND t.recorded_at >= e.registered_at
     AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at))
WHERE $__timeFilter(t.recorded_at)
GROUP BY l.id, l.code, l.species, l.status, l.started_on, l.expected_hatch_on
ORDER BY l.code;

-- Aperturas
SELECT $__timeGroupAlias(opened_at, $__interval, 0), COUNT(*) AS "Aperturas"
FROM door_events WHERE incubator_id = ${incubator_id} AND $__timeFilter(opened_at) GROUP BY 1 ORDER BY 1;

-- Cierres
SELECT COUNT(*) AS "Cierres" FROM door_events
WHERE incubator_id = ${incubator_id} AND closed_at IS NOT NULL AND $__timeFilter(closed_at);

-- Tiempo medio abierta
SELECT AVG(EXTRACT(EPOCH FROM (closed_at - opened_at))) AS "Duración"
FROM door_events WHERE incubator_id = ${incubator_id} AND $__timeFilter(opened_at) AND closed_at IS NOT NULL;

-- Huevos ingresados
SELECT COALESCE(SUM(eggs_added), 0) AS "Ingresados" FROM door_events WHERE incubator_id = ${incubator_id} AND $__timeFilter(opened_at);

-- Huevos retirados
SELECT COALESCE(SUM(eggs_removed), 0) AS "Retirados" FROM door_events WHERE incubator_id = ${incubator_id} AND $__timeFilter(opened_at);

-- Operadores activos
SELECT COUNT(DISTINCT operator_id) AS "Operadores" FROM door_events WHERE incubator_id = ${incubator_id} AND $__timeFilter(opened_at);

-- Aperturas por operador
SELECT t.full_name AS "Operador", COUNT(*) AS "Aperturas"
FROM door_events AS d JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id} AND $__timeFilter(d.opened_at)
GROUP BY t.full_name ORDER BY 2 DESC;

-- Método de acceso
SELECT CASE d.access_method
  WHEN 'rfid' THEN 'Tarjeta RFID' WHEN 'fingerprint' THEN 'Huella'
  WHEN 'key' THEN 'Llave' ELSE 'Contraseña' END AS "Método",
  COUNT(*) AS "Aperturas"
FROM door_events AS d
WHERE d.incubator_id = ${incubator_id} AND $__timeFilter(d.opened_at)
GROUP BY 1 ORDER BY 2 DESC;

-- Tipo de operación
SELECT CASE d.event_type
  WHEN 'egg_entry' THEN 'Ingreso de huevos' WHEN 'egg_removal' THEN 'Retiro de huevos'
  WHEN 'inspection' THEN 'Inspección' ELSE 'Mantenimiento' END AS "Operación",
  COUNT(*) AS "Aperturas"
FROM door_events AS d
WHERE d.incubator_id = ${incubator_id} AND $__timeFilter(d.opened_at)
GROUP BY 1 ORDER BY 2 DESC;

-- Operaciones de puerta
SELECT
  d.opened_at AS "Fecha",
  t.full_name AS "Operador",
  t.role AS "Rol",
  d.event_type AS "Operación",
  d.access_method AS "Método",
  d.eggs_added AS "Ingresados",
  d.eggs_removed AS "Retirados",
  CASE WHEN d.closed_at IS NULL THEN 'Abierta' ELSE 'Cerrada' END AS "Puerta",
  EXTRACT(EPOCH FROM (COALESCE(d.closed_at, NOW()) - d.opened_at)) AS "Duración"
FROM door_events AS d
JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id}
  AND (NULLIF('${operator_id}', '0') IS NULL
       OR d.operator_id = NULLIF('${operator_id}', '')::int)
  AND $__timeFilter(d.opened_at)
ORDER BY d.opened_at DESC
LIMIT 200;

-- Alarmas en el rango
SELECT $__timeGroupAlias(occurred_at, $__interval, 0), COUNT(*) AS "Alarmas"
FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at) GROUP BY 1 ORDER BY 1;

-- Críticas
SELECT COUNT(*) AS "Críticas" FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at) AND severity = 'critical';

-- Tiempo medio de resolución
SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - occurred_at))) AS "MTTR"
FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at) AND resolved_at IS NOT NULL;

-- Reconocidas
SELECT 100.0 * AVG((acknowledged_at IS NOT NULL)::int) AS "Reconocidas" FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at);

-- Alarmas por tipo
SELECT CASE kind
  WHEN 'temperature_low' THEN 'Temperatura baja' WHEN 'temperature_high' THEN 'Temperatura alta'
  WHEN 'humidity_low' THEN 'Humedad baja' WHEN 'humidity_high' THEN 'Humedad alta'
  ELSE kind END AS "Tipo",
  COUNT(*) AS "Eventos"
FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at) GROUP BY 1 ORDER BY 2 DESC;

-- Historial de alarmas
SELECT
  occurred_at AS "Fecha",
  kind AS "Tipo",
  severity AS "Severidad",
  CASE WHEN resolved_at IS NOT NULL THEN 'Resuelta'
       WHEN acknowledged_at IS NOT NULL THEN 'Reconocida'
       ELSE 'Activa' END AS "Estado",
  message AS "Mensaje",
  value AS "Valor",
  EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - occurred_at)) AS "Duración"
FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at)
ORDER BY occurred_at DESC
LIMIT 100;

-- Anotación: Alarmas
SELECT occurred_at AS time, COALESCE(resolved_at, NOW()) AS timeend, message AS text, kind AS tags FROM alarms WHERE incubator_id = ${incubator_id} AND $__timeFilter(occurred_at);

-- Anotación: Puerta abierta
SELECT d.opened_at AS time, COALESCE(d.closed_at, NOW()) AS timeend, CONCAT(t.full_name, ' · ', d.access_method) AS text, d.event_type AS tags FROM door_events AS d JOIN technicians AS t ON t.id = d.operator_id WHERE d.incubator_id = ${incubator_id} AND $__timeFilter(d.opened_at);
