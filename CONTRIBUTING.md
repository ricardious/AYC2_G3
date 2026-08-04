# Contribuciones

## Flujo de trabajo

La rama `main` se utilizará para mantener versiones estables. Todo el trabajo se integrará primero en la rama `develop`.

Para realizar un cambio:

1. Actualizar la rama `develop`.
2. Crear una rama nueva a partir de `develop`.
3. Realizar y verificar los cambios.
4. Crear un pull request hacia `develop`.
5. Solicitar la revisión de otro integrante del equipo.

Los nombres de las ramas deben indicar su propósito, por ejemplo:

```text
feature/lectura-temperatura
fix/error-conexion
docs/actualizar-readme
```

## Conventional Commits

Los mensajes de los commits deben seguir este formato:

```text
tipo: descripción breve
```

Tipos principales:

- `feat`: agrega una funcionalidad.
- `fix`: corrige un error.
- `docs`: modifica documentación.
- `refactor`: reorganiza código sin cambiar su funcionamiento.
- `test`: agrega o modifica pruebas.
- `chore`: realiza tareas de mantenimiento o configuración.

Ejemplos:

```text
feat: agregar lectura del sensor de temperatura
fix: corregir activación del ventilador
docs: actualizar instrucciones del proyecto
```

No se deben subir contraseñas, credenciales ni archivos que contengan información sensible.
