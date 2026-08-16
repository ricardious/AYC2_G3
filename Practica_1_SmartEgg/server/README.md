# SmartEgg Server

Backend de SmartEgg desarrollado con [FastAPI](https://fastapi.tiangolo.com/) y administrado con [uv](https://docs.astral.sh/uv/).

## Requisitos

- Python 3.12 o superior.
- `uv` instalado.

Para comprobar la instalación:

```bash
python --version
uv --version
```

## Instalación

Desde la raíz del repositorio:

```bash
cd Practica_1_SmartEgg/server
uv sync
```

`uv sync` crea el entorno virtual `.venv` y descarga las dependencias registradas en `uv.lock`.

## Ejecución en desarrollo

Dentro de la carpeta `server`:

```bash
uv run fastapi dev
```

El servidor estará disponible en:

- API: <http://127.0.0.1:8000>
- Swagger UI: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>

FastAPI reinicia automáticamente el servidor cuando detecta cambios en el código. Para detenerlo, presionar `Ctrl+C`.

El punto de entrada `main:app` está declarado en `pyproject.toml`, por lo que no es necesario indicar `main.py` en el comando.

## Acceso desde otro dispositivo de la red local

Para que la aplicación pueda consultarse desde un teléfono, tablet u otra computadora conectada a la misma red:

```bash
uv run fastapi dev --host 0.0.0.0
```

Luego se accede mediante la dirección IP local de la computadora, por ejemplo:

```text
http://192.168.1.10:8000
```

La IP puede consultarse en Linux con:

```bash
hostname -I
```

## Ejecución sin recarga automática

```bash
uv run fastapi run
```

## Probar el endpoint actual

Con el servidor en ejecución:

```bash
curl http://127.0.0.1:8000/
```

Respuesta esperada:

```json
{
  "message": "Hello World"
}
```

## Gestión de dependencias

Agregar una dependencia:

```bash
uv add nombre-del-paquete
```

Agregar una dependencia exclusiva para desarrollo:

```bash
uv add --dev nombre-del-paquete
```

Eliminar una dependencia:

```bash
uv remove nombre-del-paquete
```

Actualizar las dependencias:

```bash
uv lock --upgrade
uv sync
```

## Archivos principales

```text
server/
├── main.py          # Punto de entrada de la API
├── pyproject.toml   # Configuración y dependencias del proyecto
├── uv.lock          # Versiones exactas de las dependencias
└── README.md        # Instrucciones de instalación y ejecución
```

Tanto `pyproject.toml` como `uv.lock` deben mantenerse versionados en Git. La carpeta `.venv` se genera localmente y no debe subirse al repositorio.
