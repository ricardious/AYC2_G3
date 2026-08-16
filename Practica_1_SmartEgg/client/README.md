# SmartEgg Client

Aplicación web de SmartEgg desarrollada con Next.js, React, TypeScript y Tailwind CSS.

## Requisitos

- Node.js 20.9 o superior.
- pnpm 10.18.2.

Para comprobar las versiones instaladas:

```bash
node --version
pnpm --version
```

Si pnpm no está disponible, puede habilitarse mediante Corepack:

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
```

## Instalación

Desde la raíz del repositorio:

```bash
cd Practica_1_SmartEgg/client
pnpm install
```

El archivo `pnpm-lock.yaml` contiene las versiones exactas de las dependencias y debe mantenerse versionado en Git.

## Ejecución en desarrollo

Dentro de la carpeta `client`:

```bash
pnpm dev
```

La aplicación estará disponible en <http://localhost:3000> y se actualizará automáticamente al modificar el código fuente.

Para detener el servidor, presionar `Ctrl+C`.

## Acceso desde otro dispositivo de la red local

Para abrir la aplicación desde un teléfono, tablet u otra computadora conectada a la misma red:

```bash
pnpm dev --hostname 0.0.0.0
```

Luego se accede mediante la dirección IP local de la computadora, por ejemplo:

```text
http://192.168.1.10:3000
```

La dirección IP puede consultarse en Linux con:

```bash
hostname -I
```

## Verificaciones

Ejecutar el analizador estático:

```bash
pnpm lint
```

Generar una compilación optimizada para producción:

```bash
pnpm build
```

## Ejecución en producción

Primero se genera la compilación y luego se inicia el servidor:

```bash
pnpm build
pnpm start
```

La aplicación se servirá en <http://localhost:3000>.

## Archivos principales

```text
client/
├── app/
│   ├── globals.css    # Estilos globales y configuración de Tailwind CSS
│   ├── layout.tsx     # Estructura raíz y metadatos
│   └── page.tsx       # Página principal
├── public/            # Recursos estáticos
├── package.json       # Scripts y dependencias
├── pnpm-lock.yaml     # Versiones exactas de las dependencias
└── next.config.ts     # Configuración de Next.js
```

## Servicios relacionados

El backend de SmartEgg se encuentra en `../server` y, durante el desarrollo, se ejecuta por defecto en <http://127.0.0.1:8000>.
