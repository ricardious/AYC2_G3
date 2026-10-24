"""Electric consumption of the incubator.

The node does not measure current, so the backend estimates the power from
what is switched on in each reading (bulb, fan, relays, buzzer) and the
nominal power of each part, taken from its label or datasheet (see
docs/CONSUMO_ELECTRICO.md). Each stored reading adds the energy used since the
previous one, so the daily total, its cost and the anomaly rules come from
the ``energy_samples`` table.

``EnergyManager`` applies the rules that switch devices on a clock: the
connection timer, the daily limit (when it is set to turn the bulb off) and
the daily schedules. It sends the same manual overrides the page can send;
when no rule applies the device goes back to automatic control.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from ..models import EnergyConfig, EnergySample, Incubator
from ..schemas import ActuatorCommand, EnergyConfigUpdate
from .commands import apply_actuator_command
from .telemetry import _sync_alarm

logger = logging.getLogger(__name__)

DEFAULT_TIMEZONE = "America/Guatemala"
# A longer gap means the node was off or disconnected: that time is not billed.
MAX_GAP_SECONDS = 30.0
AVERAGE_WINDOW = timedelta(hours=1)
# The hourly average is only judged with at least this much data.
AVERAGE_MIN_COVERAGE = timedelta(minutes=30)

ANOMALY_MESSAGES = {
    "foco_con_temperatura_alta": "Foco encendido con la temperatura sobre el máximo",
    "consumo_sistema_apagado": "Consumo con el sistema apagado",
    "promedio_alto": "Consumo promedio de la última hora fuera de lo normal",
}


def _aware(value: datetime) -> datetime:
    # SQLite returns naive datetimes even for timezone-aware columns.
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def local_day(moment: datetime, timezone: str) -> date:
    return _aware(moment).astimezone(ZoneInfo(timezone)).date()


def get_energy_config(db: Session, incubator_id: int) -> EnergyConfig:
    config = db.get(EnergyConfig, incubator_id)
    if config is None:
        config = EnergyConfig(incubator_id=incubator_id, schedules=[])
        db.add(config)
        db.flush()
    return config


def estimate_power(
    config: EnergyConfig, *, heater: bool, fan: bool, buzzer: bool
) -> dict[str, float]:
    """Instant power in watts, split by component."""
    relays = config.relay_w * (int(heater) + int(fan))
    parts = {
        "foco": config.heater_w if heater else 0.0,
        "ventilador": config.fan_w if fan else 0.0,
        "reles": relays,
        "buzzer": config.buzzer_w if buzzer else 0.0,
        "electronica": config.base_w,
    }
    parts["total"] = sum(parts.values())
    return parts


def _latest_sample(db: Session, incubator_id: int) -> EnergySample | None:
    return db.scalar(
        select(EnergySample)
        .where(EnergySample.incubator_id == incubator_id)
        .order_by(EnergySample.recorded_at.desc(), EnergySample.id.desc())
        .limit(1)
    )


def hourly_average_w(
    db: Session, incubator_id: int, now: datetime, extra_wh: float = 0.0
) -> float | None:
    """Average power of the last hour, or None without 30 min of data."""
    since = now - AVERAGE_WINDOW
    total, first = db.execute(
        select(func.sum(EnergySample.energy_wh), func.min(EnergySample.recorded_at))
        .where(
            EnergySample.incubator_id == incubator_id,
            EnergySample.recorded_at > since,
        )
    ).one()
    if first is None:
        return None
    covered = now - _aware(first)
    if covered < AVERAGE_MIN_COVERAGE:
        return None
    return ((total or 0.0) + extra_wh) / (covered.total_seconds() / 3600)


def record_energy(
    db: Session,
    incubator: Incubator,
    *,
    heater: bool,
    fan: bool,
    buzzer: bool,
    temperature_c: float,
    system_enabled: bool | None,
    recorded_at: datetime,
    timezone: str = DEFAULT_TIMEZONE,
) -> EnergySample:
    """Add the energy since the previous reading and sync the energy alarms.

    The previous state is billed for the interval: the bulb that was on
    during the last 2.6 s is what consumed, not the one reported now.
    """
    config = get_energy_config(db, incubator.id)
    recorded_at = _aware(recorded_at)
    power = estimate_power(config, heater=heater, fan=fan, buzzer=buzzer)
    previous = _latest_sample(db, incubator.id)
    interval_wh = 0.0
    today_wh = 0.0
    if previous is not None:
        elapsed = (recorded_at - _aware(previous.recorded_at)).total_seconds()
        if 0 < elapsed <= MAX_GAP_SECONDS:
            interval_wh = previous.power_w * elapsed / 3600
        same_day = local_day(previous.recorded_at, timezone) == local_day(
            recorded_at, timezone
        )
        if same_day:
            today_wh = previous.energy_today_wh
    today_wh += interval_wh

    rule = None
    if heater and temperature_c >= incubator.config.temperature_max_c:
        # The firmware cuts the bulb at the maximum: a stuck relay or a fault.
        rule = "foco_con_temperatura_alta"
    elif (heater or fan) and system_enabled is False:
        rule = "consumo_sistema_apagado"
    sustained = (
        rule is not None and previous is not None and previous.anomaly_rule == rule
    )
    average = hourly_average_w(db, incubator.id, recorded_at, interval_wh)
    high_average = average is not None and average > config.anomaly_avg_w
    if rule is None and high_average:
        rule = "promedio_alto"

    sample = EnergySample(
        incubator_id=incubator.id,
        power_w=power["total"],
        heater_w=power["foco"],
        fan_w=power["ventilador"],
        other_w=power["reles"] + power["buzzer"] + power["electronica"],
        energy_wh=interval_wh,
        energy_today_wh=today_wh,
        cost_today_q=today_wh / 1000 * config.tariff_q_per_kwh,
        anomaly_rule=rule,
        recorded_at=recorded_at,
    )
    db.add(sample)

    anomaly = "promedio_alto" if high_average and not sustained else rule
    _sync_alarm(
        db,
        incubator.id,
        "energy_anomaly",
        sustained or high_average,
        "warning",
        ANOMALY_MESSAGES.get(anomaly or "", "Consumo anómalo"),
        average if anomaly == "promedio_alto" else power["total"],
        recorded_at,
    )
    _sync_alarm(
        db,
        incubator.id,
        "energy_limit",
        today_wh >= config.daily_limit_wh,
        "warning",
        f"Límite diario de consumo superado ({config.daily_limit_wh:.0f} Wh)",
        today_wh,
        recorded_at,
    )
    return sample


def apply_energy_update(
    db: Session, incubator: Incubator, update: EnergyConfigUpdate, now: datetime
) -> EnergyConfig:
    config = get_energy_config(db, incubator.id)
    values = update.model_dump(exclude_unset=True, exclude={"timer"})
    for key, value in values.items():
        setattr(config, key, value)
    if "timer" in update.model_fields_set:
        timer = update.timer
        config.timer_device = timer.device if timer else None
        config.timer_state = (timer.state == "on") if timer else None
        config.timer_until = now + timedelta(minutes=timer.minutes) if timer else None
    config.updated_at = now
    db.commit()
    return config


def _in_window(start: str, end: str, moment: time) -> bool:
    begin, finish = time.fromisoformat(start), time.fromisoformat(end)
    if begin < finish:
        return begin <= moment < finish
    return moment >= begin or moment < finish  # crosses midnight


@dataclass(frozen=True)
class Override:
    enabled: bool
    reason: str


def desired_overrides(
    config: EnergyConfig, today_wh: float, now: datetime, timezone: str
) -> dict[str, Override | None]:
    """Forced state per device; None means automatic control.

    Priority: timer, then the daily limit, then the schedules.
    """
    local_now = now.astimezone(ZoneInfo(timezone))
    result: dict[str, Override | None] = {"heater": None, "fan": None}
    for schedule in config.schedules or []:
        device = schedule.get("device")
        if device in result and result[device] is None and _in_window(
            schedule["start"], schedule["end"], local_now.time()
        ):
            result[device] = Override(
                schedule["state"] == "on",
                f"horario {schedule['start']}-{schedule['end']}",
            )
    if config.limit_action == "heater_off" and today_wh >= config.daily_limit_wh:
        result["heater"] = Override(False, "limite_diario")
    if (
        config.timer_device in result
        and config.timer_until is not None
        and now < _aware(config.timer_until)
    ):
        result[config.timer_device] = Override(bool(config.timer_state), "temporizador")
    return result


def energy_status(
    db: Session,
    incubator_id: int,
    timezone: str = DEFAULT_TIMEZONE,
    rules: dict[str, Override | None] | None = None,
) -> dict[str, object] | None:
    """Payload of ``smartegg/{node}/energia`` from the latest sample."""
    sample = _latest_sample(db, incubator_id)
    if sample is None:
        return None
    config = get_energy_config(db, incubator_id)
    recorded_at = _aware(sample.recorded_at)
    average = hourly_average_w(db, incubator_id, recorded_at)
    timer_active = config.timer_until is not None and datetime.now(UTC) < _aware(
        config.timer_until
    )
    return {
        "potencia_w": round(sample.power_w, 2),
        "desglose_w": {
            "foco": round(sample.heater_w, 2),
            "ventilador": round(sample.fan_w, 2),
            "otros": round(sample.other_w, 2),
        },
        "energia_hoy_wh": round(sample.energy_today_wh, 2),
        "costo_hoy_q": round(sample.cost_today_q, 4),
        "promedio_1h_w": round(average, 2) if average is not None else None,
        "limite_wh": config.daily_limit_wh,
        "uso_limite_pct": round(
            sample.energy_today_wh / config.daily_limit_wh * 100, 1
        ),
        "accion_limite": config.limit_action,
        "tarifa_q_kwh": config.tariff_q_per_kwh,
        "tarifa": config.tariff_label,
        "anomalia": sample.anomaly_rule,
        "horarios": config.schedules or [],
        "temporizador": {
            "device": config.timer_device,
            "state": "on" if config.timer_state else "off",
            "until": _aware(config.timer_until).isoformat(),
        }
        if timer_active
        else None,
        "reglas_activas": {
            device: {"enabled": override.enabled, "reason": override.reason}
            for device, override in (rules or {}).items()
            if override is not None
        },
        "potencias_w": {
            "foco": config.heater_w,
            "ventilador": config.fan_w,
            "rele": config.relay_w,
            "buzzer": config.buzzer_w,
            "electronica": config.base_w,
        },
        "recorded_at": recorded_at.isoformat(),
        "fecha_local": local_day(recorded_at, timezone).isoformat(),
    }


class EnergyManager:
    """Applies timer, limit and schedules by sending actuator overrides."""

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        send_to_node: Callable[[dict[str, object]], None],
        *,
        timezone: str = DEFAULT_TIMEZONE,
        is_locked: Callable[[str], bool] = lambda _node_code: False,
        interval_seconds: float = 15.0,
        resend_seconds: float = 120.0,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.session_factory = session_factory
        self.send_to_node = send_to_node
        self.timezone = timezone
        self.is_locked = is_locked
        self.interval_seconds = interval_seconds
        self.resend_seconds = resend_seconds
        self._clock = clock
        # (node, device) -> (override sent, when). Missing means automatic,
        # so a backend restart does not reset what the page set by hand.
        self._sent: dict[tuple[str, str], tuple[Override | None, datetime]] = {}
        self._rules: dict[str, dict[str, Override | None]] = {}
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None
        self._mutex = threading.Lock()

    def rules(self, node_code: str) -> dict[str, Override | None]:
        with self._mutex:
            return dict(self._rules.get(node_code, {}))

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="smartegg-energy", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=2)

    def wake(self) -> None:
        """Evaluate now, e.g. right after the page starts a timer."""
        self._wake.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(self.interval_seconds)
            self._wake.clear()
            if self._stop.is_set():
                break
            try:
                self.tick()
            except Exception:
                logger.exception("Energy rules failed")

    def tick(self) -> list[dict[str, object]]:
        """Evaluate every node once; return the frames sent."""
        now = self._clock()
        sent: list[dict[str, object]] = []
        with self.session_factory() as db:
            for config in db.scalars(select(EnergyConfig)).all():
                incubator = db.get(Incubator, config.incubator_id)
                if incubator is None:
                    continue
                if config.timer_until is not None and now >= _aware(config.timer_until):
                    config.timer_device = config.timer_state = config.timer_until = None
                    db.commit()
                latest = _latest_sample(db, incubator.id)
                today_wh = (
                    latest.energy_today_wh
                    if latest is not None
                    and local_day(latest.recorded_at, self.timezone)
                    == local_day(now, self.timezone)
                    else 0.0
                )
                wanted = desired_overrides(config, today_wh, now, self.timezone)
                with self._mutex:
                    self._rules[incubator.code] = wanted
                if self.is_locked(incubator.code):
                    continue  # The node ignores commands until a card unlocks it.
                for device, override in wanted.items():
                    frame = self._apply(db, incubator, device, override, now)
                    if frame is not None:
                        sent.append(frame)
        return sent

    def _apply(
        self,
        db: Session,
        incubator: Incubator,
        device: str,
        override: Override | None,
        now: datetime,
    ) -> dict[str, Any] | None:
        key = (incubator.code, device)
        previous = self._sent.get(key)
        last_override = previous[0] if previous else None
        changed = last_override != override
        due = (
            override is not None
            and previous is not None
            and (now - previous[1]).total_seconds() >= self.resend_seconds
        )
        if not changed and not due:
            return None
        command = (
            ActuatorCommand(enabled=False, mode="automatic")
            if override is None
            else ActuatorCommand(enabled=override.enabled, mode="manual")
        )
        frame = apply_actuator_command(db, incubator, device, command)
        try:
            self.send_to_node(frame)
        except RuntimeError as exc:
            logger.warning("Energy rule for %s %s not delivered: %s",
                           incubator.code, device, exc)
            return None
        self._sent[key] = (override, now)
        logger.info(
            "Energy rule %s %s: %s",
            incubator.code,
            device,
            "automatic" if override is None else
            f"{'on' if override.enabled else 'off'} ({override.reason})",
        )
        return frame
