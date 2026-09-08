-- Consultas de referencia para el datasource PostgreSQL de Grafana.
-- Cada bloque corresponde a un panel del dashboard "SmartEgg - Histórico".
-- Las variables ${incubator_id}, ${lot_id}, ${egg_id} y ${operator_id} se definen
-- en el dashboard. Envolvemos ${lot_id} y ${egg_id} en NULLIF para que un panel sin
-- selección devuelva "sin datos" en lugar de un error de sintaxis.

-- Resumen del rango: mínimo, máximo y promedio del nodo.
SELECT
  MIN(temperature_c) AS "Mínima",
  MAX(temperature_c) AS "Máxima",
  AVG(temperature_c) AS "Promedio"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at);

-- El mismo cálculo sobre la humedad.
SELECT
  MIN(humidity_pct) AS "Mínima",
  MAX(humidity_pct) AS "Máxima",
  AVG(humidity_pct) AS "Promedio"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at);

-- Muestras persistidas y alarmas abiertas.
SELECT COUNT(*) AS "Muestras"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at);

SELECT COUNT(*) AS "Alarmas activas"
FROM alarms
WHERE incubator_id = ${incubator_id}
  AND resolved_at IS NULL;

-- Serie temporal de temperatura y humedad.
SELECT recorded_at AS "time", temperature_c AS "Temperatura"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at)
ORDER BY recorded_at;

SELECT recorded_at AS "time", humidity_pct AS "Humedad"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at)
ORDER BY recorded_at;

-- Ocupación de posiciones reportada por el nodo.
SELECT
  recorded_at AS "time",
  occupied_slots AS "Ocupadas",
  available_slots AS "Disponibles"
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at)
ORDER BY recorded_at;

-- Rotaciones de la bandeja agrupadas por intervalo del panel.
SELECT
  $__timeGroupAlias(performed_at, $__interval),
  COUNT(*) AS "Rotaciones"
FROM rotation_events
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(performed_at)
GROUP BY 1
ORDER BY 1;

-- Estadísticas durante la permanencia de al menos un huevo del lote en el nodo.
SELECT
  MIN(t.temperature_c) AS "Mínima",
  MAX(t.temperature_c) AS "Máxima",
  AVG(t.temperature_c) AS "Promedio"
FROM telemetry_readings AS t
WHERE t.incubator_id = ${incubator_id}
  AND $__timeFilter(t.recorded_at)
  AND EXISTS (
    SELECT 1
    FROM eggs AS e
    WHERE e.lot_id = NULLIF('${lot_id}', '')::int
      AND e.incubator_id = t.incubator_id
      AND t.recorded_at >= e.registered_at
      AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at)
  );

-- Estadísticas durante la permanencia de un huevo específico en la incubadora.
SELECT
  MIN(t.temperature_c) AS "Mínima",
  MAX(t.temperature_c) AS "Máxima",
  AVG(t.temperature_c) AS "Promedio"
FROM telemetry_readings AS t
JOIN eggs AS e
  ON e.id = NULLIF('${egg_id}', '')::int
 AND e.incubator_id = t.incubator_id
 AND t.recorded_at >= e.registered_at
 AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at)
WHERE t.incubator_id = ${incubator_id}
  AND $__timeFilter(t.recorded_at);

-- Mínimo, máximo y promedio de cada lote presente durante el rango.
SELECT
  l.code AS "Lote",
  l.species AS "Especie",
  (
    SELECT COUNT(*)
    FROM eggs AS e2
    WHERE e2.lot_id = l.id
      AND e2.incubator_id = ${incubator_id}
  ) AS "Huevos",
  MIN(t.temperature_c) AS "T. mín",
  MAX(t.temperature_c) AS "T. máx",
  AVG(t.temperature_c) AS "T. prom",
  MIN(t.humidity_pct) AS "H. mín",
  MAX(t.humidity_pct) AS "H. máx",
  AVG(t.humidity_pct) AS "H. prom"
FROM lots AS l
JOIN telemetry_readings AS t
  ON t.incubator_id = ${incubator_id}
 AND EXISTS (
   SELECT 1
   FROM eggs AS e
   WHERE e.lot_id = l.id
     AND e.incubator_id = t.incubator_id
     AND t.recorded_at >= e.registered_at
     AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at)
 )
WHERE $__timeFilter(t.recorded_at)
GROUP BY l.id, l.code, l.species
ORDER BY l.code;

-- Historial de alarmas con su estado y la duración en segundos.
SELECT
  occurred_at AS "Fecha",
  kind AS "Tipo",
  severity AS "Severidad",
  CASE
    WHEN resolved_at IS NOT NULL THEN 'Resuelta'
    WHEN acknowledged_at IS NOT NULL THEN 'Reconocida'
    ELSE 'Activa'
  END AS "Estado",
  message AS "Mensaje",
  value AS "Valor",
  EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - occurred_at)) AS "Duración"
FROM alarms
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(occurred_at)
ORDER BY occurred_at DESC
LIMIT 100;

-- Cantidad de alarmas por tipo.
SELECT kind AS "Tipo", COUNT(*) AS "Eventos"
FROM alarms
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(occurred_at)
GROUP BY kind
ORDER BY 2 DESC;

-- Total de aperturas en el rango seleccionado.
SELECT COUNT(*) AS "Aperturas"
FROM door_events
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(opened_at);

-- Total de cierres confirmados por el sensor en el rango seleccionado.
SELECT COUNT(*) AS "Cierres"
FROM door_events
WHERE incubator_id = ${incubator_id}
  AND closed_at IS NOT NULL
  AND $__timeFilter(closed_at);

-- Aperturas atribuidas a cada operador.
SELECT t.full_name AS "Operador", COUNT(*) AS "Aperturas"
FROM door_events AS d
JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id}
  AND $__timeFilter(d.opened_at)
GROUP BY t.full_name
ORDER BY 2 DESC;

-- Credencial usada para abrir la puerta.
SELECT d.access_method AS "Método", COUNT(*) AS "Aperturas"
FROM door_events AS d
WHERE d.incubator_id = ${incubator_id}
  AND $__timeFilter(d.opened_at)
GROUP BY d.access_method
ORDER BY 2 DESC;

-- Huevos que entraron y salieron durante las aperturas del rango.
SELECT
  COALESCE(SUM(eggs_added), 0) AS "Ingresados",
  COALESCE(SUM(eggs_removed), 0) AS "Retirados"
FROM door_events
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(opened_at);

-- Auditoría de aperturas. Con ${operator_id} en "Todos" (allValue 0) no filtra.
SELECT
  d.opened_at AS "Fecha",
  t.full_name AS "Operador",
  t.role AS "Rol",
  d.event_type AS "Operación",
  d.access_method AS "Método",
  d.eggs_added AS "Ingresados",
  d.eggs_removed AS "Retirados",
  EXTRACT(EPOCH FROM (COALESCE(d.closed_at, NOW()) - d.opened_at)) AS "Duración"
FROM door_events AS d
JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id}
  AND (
    NULLIF('${operator_id}', '0') IS NULL
    OR d.operator_id = NULLIF('${operator_id}', '')::int
  )
  AND $__timeFilter(d.opened_at)
ORDER BY d.opened_at DESC
LIMIT 200;

-- Anotaciones. Grafana espera las columnas time, timeend, text y tags.
SELECT
  occurred_at AS time,
  COALESCE(resolved_at, NOW()) AS timeend,
  message AS text,
  kind AS tags
FROM alarms
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(occurred_at);

SELECT
  d.opened_at AS time,
  COALESCE(d.closed_at, NOW()) AS timeend,
  CONCAT(t.full_name, ' · ', d.access_method) AS text,
  d.event_type AS tags
FROM door_events AS d
JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id}
  AND $__timeFilter(d.opened_at);
