-- Consultas de referencia para el datasource PostgreSQL de Grafana.
-- Las variables ${incubator_id}, ${lot_id} y ${egg_id} se definen en el dashboard.

-- Serie temporal de temperatura, humedad y ocupación.
SELECT
  recorded_at AS "time",
  temperature_c,
  humidity_pct,
  occupied_slots,
  available_slots
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at)
ORDER BY recorded_at;

-- Mínimo, máximo y promedio del nodo en el rango seleccionado.
SELECT
  MIN(temperature_c) AS temperature_min_c,
  MAX(temperature_c) AS temperature_max_c,
  AVG(temperature_c) AS temperature_avg_c,
  MIN(humidity_pct) AS humidity_min_pct,
  MAX(humidity_pct) AS humidity_max_pct,
  AVG(humidity_pct) AS humidity_avg_pct
FROM telemetry_readings
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(recorded_at);

-- Estadísticas durante la permanencia de al menos un huevo del lote en el nodo.
SELECT
  MIN(t.temperature_c) AS temperature_min_c,
  MAX(t.temperature_c) AS temperature_max_c,
  AVG(t.temperature_c) AS temperature_avg_c,
  MIN(t.humidity_pct) AS humidity_min_pct,
  MAX(t.humidity_pct) AS humidity_max_pct,
  AVG(t.humidity_pct) AS humidity_avg_pct
FROM telemetry_readings AS t
WHERE $__timeFilter(t.recorded_at)
  AND EXISTS (
    SELECT 1
    FROM eggs AS e
    WHERE e.lot_id = ${lot_id}
      AND e.incubator_id = t.incubator_id
      AND t.recorded_at >= e.registered_at
      AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at)
  );

-- Estadísticas durante la permanencia de un huevo específico en la incubadora.
SELECT
  MIN(t.temperature_c) AS temperature_min_c,
  MAX(t.temperature_c) AS temperature_max_c,
  AVG(t.temperature_c) AS temperature_avg_c,
  MIN(t.humidity_pct) AS humidity_min_pct,
  MAX(t.humidity_pct) AS humidity_max_pct,
  AVG(t.humidity_pct) AS humidity_avg_pct
FROM telemetry_readings AS t
JOIN eggs AS e
  ON e.id = ${egg_id}
 AND e.incubator_id = t.incubator_id
 AND t.recorded_at >= e.registered_at
 AND (e.ended_at IS NULL OR t.recorded_at <= e.ended_at)
WHERE $__timeFilter(t.recorded_at);

-- Historial de alarmas y duración en segundos.
SELECT
  occurred_at AS "time",
  kind,
  severity,
  message,
  EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - occurred_at)) AS duration_seconds
FROM alarms
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(occurred_at)
ORDER BY occurred_at DESC;

-- Operaciones de puerta auditadas por operador.
SELECT
  d.opened_at AS "time",
  t.full_name AS operator,
  d.event_type,
  d.eggs_added,
  d.eggs_removed,
  EXTRACT(EPOCH FROM (COALESCE(d.closed_at, NOW()) - d.opened_at)) AS duration_seconds
FROM door_events AS d
JOIN technicians AS t ON t.id = d.operator_id
WHERE d.incubator_id = ${incubator_id}
  AND $__timeFilter(d.opened_at)
ORDER BY d.opened_at DESC;

-- Total de aperturas en el rango seleccionado.
SELECT COUNT(*) AS openings
FROM door_events
WHERE incubator_id = ${incubator_id}
  AND $__timeFilter(opened_at);

-- Total de cierres confirmados por el sensor en el rango seleccionado.
SELECT COUNT(*) AS closings
FROM door_events
WHERE incubator_id = ${incubator_id}
  AND closed_at IS NOT NULL
  AND $__timeFilter(closed_at);
