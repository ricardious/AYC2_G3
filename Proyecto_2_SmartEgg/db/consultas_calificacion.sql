-- Consultas de verificación usadas durante la calificación del Proyecto 2.
-- Motor: PostgreSQL 17. Ejecutar con psql conectado a la base de SmartEgg:
--   docker compose exec -T database psql -U smartegg -d smartegg < db/consultas_calificacion.sql
-- o abrir cada bloque por separado en psql / DBeaver / la consola de Neon.
-- Todas son de solo lectura.

-- 1. Localización de la base: motor, base, usuario, host y puerto.
SELECT version()            AS motor,
       current_database()   AS base,
       current_user         AS usuario,
       inet_server_addr()   AS host,
       inet_server_port()   AS puerto;

-- 2. Tablas del esquema y cantidad de filas aproximada.
SELECT relname AS tabla, n_live_tup AS filas
FROM pg_stat_user_tables
ORDER BY relname;

-- 3. Operadores y administrador (id, nombre, edad, género, rol).
SELECT id, username, full_name, age, gender, role, is_active, created_at
FROM technicians
ORDER BY id;

-- 4. Incubadoras asignadas a cada operador.
SELECT t.full_name, t.role, i.code AS incubadora, ti.assigned_at
FROM technician_incubators ti
JOIN technicians t ON t.id = ti.technician_id
JOIN incubators  i ON i.id = ti.incubator_id
ORDER BY t.id, i.code;

-- 5. Umbrales configurados por incubadora.
SELECT i.code, c.temperature_min_c, c.temperature_max_c,
       c.humidity_min_pct, c.humidity_max_pct, c.critical_temperature_c,
       c.rotation_interval_seconds, c.rotation_angle_degrees, c.updated_at
FROM incubator_configs c
JOIN incubators i ON i.id = c.incubator_id;

-- 6. Últimas 20 lecturas, con el estado de bloqueo que informa la ESP32.
SELECT r.recorded_at, i.code, r.temperature_c, r.humidity_pct, r.door_open,
       r.occupied_slots, r.system_enabled, r.sensor_ok, r.system_locked, r.source
FROM telemetry_readings r
JOIN incubators i ON i.id = r.incubator_id
ORDER BY r.recorded_at DESC
LIMIT 20;

-- 7. Lotes y huevos: ficha, fecha de ingreso, posición y nodo asociado.
SELECT l.code AS lote, l.species, l.started_on, e.code AS huevo,
       i.code AS incubadora, e.slot_number, e.registered_at, e.status,
       t.full_name AS registrado_por
FROM eggs e
JOIN lots       l ON l.id = e.lot_id
JOIN incubators i ON i.id = e.incubator_id
LEFT JOIN technicians t ON t.id = e.registered_by_id
ORDER BY e.registered_at DESC;

-- 8. Aperturas de puerta: día, hora, operador, tipo y cantidad de huevos.
SELECT d.opened_at::date            AS dia,
       d.opened_at::time(0)         AS hora_apertura,
       d.closed_at::time(0)         AS hora_cierre,
       d.operator_id, t.full_name   AS operador,
       d.access_method, d.event_type, d.eggs_added, d.eggs_removed
FROM door_events d
JOIN technicians t ON t.id = d.operator_id
ORDER BY d.opened_at DESC
LIMIT 20;

-- 9. Historial de alarmas: tipo, severidad, inicio, resolución y duración.
SELECT a.occurred_at, i.code, a.kind, a.severity, a.message, a.value,
       a.resolved_at, a.resolved_at - a.occurred_at AS duracion,
       a.acknowledged_at
FROM alarms a
JOIN incubators i ON i.id = a.incubator_id
ORDER BY a.occurred_at DESC
LIMIT 30;

-- 10. Alarmas de la Fase 3: visión (object_detected), ML (ml_anomaly)
--     y consumo eléctrico (energy_limit, energy_anomaly).
SELECT kind, severity, count(*) AS total,
       count(*) FILTER (WHERE resolved_at IS NULL) AS abiertas,
       max(occurred_at) AS ultima
FROM alarms
WHERE kind IN ('object_detected', 'ml_anomaly', 'energy_limit', 'energy_anomaly')
GROUP BY kind, severity
ORDER BY kind;

-- 11. Bloqueos del sistema por visión: tramos en que la ESP32 reportó LOCK:1.
SELECT min(recorded_at) AS inicio, max(recorded_at) AS fin, count(*) AS lecturas
FROM (
    SELECT recorded_at, system_locked,
           row_number() OVER (ORDER BY recorded_at)
         - row_number() OVER (PARTITION BY system_locked ORDER BY recorded_at) AS grupo
    FROM telemetry_readings
    WHERE system_locked IS NOT NULL
) s
WHERE system_locked
GROUP BY grupo
ORDER BY inicio DESC;

-- 12. Salida del modelo de anomalías: últimos puntajes y lecturas en alerta.
SELECT recorded_at, score, threshold, anomalous, alert, cause
FROM anomaly_scores
ORDER BY recorded_at DESC
LIMIT 20;

SELECT date_trunc('hour', recorded_at) AS hora,
       count(*)                          AS calificadas,
       count(*) FILTER (WHERE anomalous) AS anomalas,
       count(*) FILTER (WHERE alert)     AS en_alerta
FROM anomaly_scores
GROUP BY 1
ORDER BY 1 DESC
LIMIT 24;

-- 13. Consumo eléctrico: última muestra, energía y costo por día.
SELECT recorded_at, power_w, heater_w, fan_w, other_w,
       energy_today_wh, cost_today_q, anomaly_rule
FROM energy_samples
ORDER BY recorded_at DESC
LIMIT 10;

SELECT (recorded_at AT TIME ZONE 'America/Guatemala')::date AS dia,
       round(max(energy_today_wh)::numeric, 1) AS energia_wh,
       round(max(cost_today_q)::numeric, 2)    AS costo_q,
       round(avg(power_w)::numeric, 2)         AS potencia_media_w
FROM energy_samples
GROUP BY 1
ORDER BY 1 DESC;

-- 14. Configuración de consumo: potencias, tarifa, límite, horarios y temporizador.
SELECT i.code, e.heater_w, e.fan_w, e.relay_w, e.buzzer_w, e.base_w,
       e.tariff_q_per_kwh, e.daily_limit_wh, e.limit_action, e.anomaly_avg_w,
       e.schedules, e.timer_device, e.timer_state, e.timer_until
FROM energy_configs e
JOIN incubators i ON i.id = e.incubator_id;

-- 15. Sesiones RFID y su causa de cierre.
SELECT s.started_at, t.full_name, i.code, s.method,
       s.door_opened_at, s.door_closed_at, s.ended_at, s.ended_reason
FROM access_sessions s
JOIN technicians t ON t.id = s.technician_id
JOIN incubators  i ON i.id = s.incubator_id
ORDER BY s.started_at DESC
LIMIT 20;

-- 16. Rotaciones de la bandeja.
SELECT performed_at, angle_degrees, direction, source
FROM rotation_events
ORDER BY performed_at DESC
LIMIT 20;

-- 17. Informes PDF generados y por quién.
SELECT r.generated_at, g.full_name AS generado_por, r.scope,
       o.full_name AS operador, r.report_day
FROM report_exports r
JOIN technicians g ON g.id = r.generated_by_id
LEFT JOIN technicians o ON o.id = r.subject_operator_id
ORDER BY r.generated_at DESC;
