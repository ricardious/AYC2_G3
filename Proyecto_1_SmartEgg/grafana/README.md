# Grafana

Usamos Grafana local para visualizar los datos de SmartEgg. Dejamos dos datasources
configurados automáticamente:

- PostgreSQL para consultar el historial guardado.
- MQTT para observar los mensajes que llegan en tiempo real.

## Iniciar

Desde la carpeta `Proyecto_1_SmartEgg` ejecutamos:

```bash
cp .env.example .env
docker compose up -d grafana
```

Entramos en `http://localhost:3001` con el usuario y la contraseña definidos en `.env`.
Los dashboards aparecen en la carpeta **SmartEgg**.

Para ver el historial primero aplicamos las migraciones desde `server` con:

```bash
uv run alembic upgrade head
```

El usuario `grafana_reader` solamente tiene permisos de lectura en PostgreSQL. El script
que crea este usuario se ejecuta cuando se crea por primera vez el volumen de la base de
datos.

## MQTT local o en AWS

En local dejamos esta dirección:

```env
GRAFANA_MQTT_URI=tcp://broker:1883
```

Cuando el broker esté en AWS cambiamos `GRAFANA_MQTT_URI` por su dirección externa. Si
activamos TLS también actualizamos la configuración del datasource en
`provisioning/datasources/smartegg.yml`.

El datasource MQTT muestra datos desde que el dashboard está abierto. Para consultar
datos anteriores usamos el dashboard conectado a PostgreSQL.

## Archivos

```text
grafana/
├── dashboards/
│   ├── smartegg-historical.json
│   └── smartegg-realtime.json
└── provisioning/
    ├── dashboards/smartegg.yml
    └── datasources/smartegg.yml
```
