# Responsiveness Check: http://localhost:3000 (SmartEgg · Control Core)

**Fecha**: 2026-08-16
**Modo**: Standard (8 anchos) + rastreo puntual de la transición 1020–1030
**Anchos probados**: 320, 375, 768, 1024, 1280, 1440, 1920, 2560 · altura 900
**Herramienta**: playwright-cli

## Resumen

| Ancho  | Estado | Incidencias        |
| ------ | ------ | ------------------ |
| 320px  | Warn   | 1 media, 2 bajas   |
| 375px  | Warn   | 1 media, 2 bajas   |
| 768px  | Warn   | 2 medias           |
| 1024px | Fail   | 1 alta, 1 media    |
| 1280px | Warn   | 1 media            |
| 1440px | Pass   | —                  |
| 1920px | Warn   | 1 media            |
| 2560px | Fail   | 1 alta             |

**Global**: 2 altas y 6 medias. Ningún ancho produce desbordamiento horizontal de página
(0 px en los ocho), pero la legibilidad va al revés de lo esperado justo al cruzar a modo
plano, y en ultra-ancho los huecos entre columnas acaban midiendo más que los propios
instrumentos.

## Incidencias altas

### La transición a modo plano empequeñece el texto — Alta

**Anchos**: 1024–1440px
**Comprobación**: Desbordamiento de texto / tamaño de fuente

El cambio de pila a plano ocurre limpiamente en 1024px (verificado en 1020, 1023, 1024,
1025, 1030: sin estado intermedio roto, sin desbordamiento). El problema no es la
transición en sí, es su dirección:

| Ancho  | Modo  | Escala | Fuente mínima renderizada |
| ------ | ----- | ------ | ------------------------- |
| 768px  | pila  | 1.0    | **7.9px**                 |
| 1023px | pila  | 1.0    | ~7.9px                    |
| 1024px | plano | 0.595  | **4.7px**                 |
| 1280px | plano | 0.748  | 5.9px                     |
| 1440px | plano | 0.843  | 6.6px                     |
| 1920px | plano | 0.876  | 6.9px                     |

Ensanchar la ventana de 1023 a 1024 px **reduce** el texto de 7.9 a 4.7 px. El umbral
`STAGE_STACK_WIDTH = 1024` deja entrar al modo plano en escalas donde su propia razón de
ser —que la tipografía sobreviva— ya no se cumple. El texto no vuelve a los 7.9 px de la
pila en ningún ancho: se queda en 6.9 px incluso a 2560.

**Sugerencia**: subir el umbral de pila a la escala en la que el texto de 8 px llega a
~7 px, es decir `STAGE_STACK_SCALE ≈ 0.85`, y dejar que sea la escala y no el ancho la
que mande. Con altura 900 eso mantiene la pila hasta ~1430 px. Alternativa menos radical:
`STAGE_STACK_WIDTH = 1440`.

---

### Ultra-ancho: los huecos superan a los instrumentos — Alta

**Anchos**: 1920px y sobre todo 2560px
**Comprobación**: Equilibrio de espacio en blanco

La escala queda limitada por la altura y se estanca en 0.876 desde 1920, así que el ancho
extra va íntegro a los huecos entre columnas:

| Ancho  | Plano   | Escala | Huecos entre columnas (px reales) |
| ------ | ------- | ------ | --------------------------------- |
| 1280px | 1712    | 0.748  | 49 / 90                           |
| 1920px | 2192    | 0.876  | 268 / 315                         |
| 2560px | 2922    | 0.876  | **588 / 635**                     |

A 2560 px cada hueco mide más que la columna derecha entera (363 px reales). Los
instrumentos no crecen nada entre 1920 y 2560; sólo se separan.

**Sugerencia**: poner tope al ensanchado del plano en `useStageScale` —por ejemplo
`Math.min(width / scale, STAGE_WIDTH * 1.3)`— y dejar que el sobrante vuelva a ser banda
exterior. Un plano de 2184 mantiene los huecos en ~270 px reales y devuelve unas bandas
simétricas de 190 px, que es un vacío mucho más legible que el hueco interior.

## Incidencias medias

### La plataforma del ángulo de bandeja se recorta por la izquierda — Media

**Anchos**: todos los de pila (320–1023px)
**Comprobación**: Escalado de medios

`.platform-face` se extiende 26 px a la izquierda de su bloque (medido a 768: bloque
`[20..748]`, plataforma `[-6..526]`). El `overflow-hidden` de `FitBlock` corta la elipse
en recto contra el borde de la pantalla en lugar de dejarla curvar.

**Sugerencia**: `TrayAngleDial` debería declarar su caja incluyendo el desbordamiento
propio, o `FitBlock` medir con `getBoundingClientRect()` de los descendientes en vez de
con `offsetWidth`. Lo primero es más barato.

### Objetivos táctiles por debajo de 44px — Media

**Anchos**: 320, 375px (y peor en plano)

| Elemento              | Tamaño a 375px | Tamaño a 1024px |
| --------------------- | -------------- | --------------- |
| Pestañas de navegación| 162 × **43**   | 79 × **20**     |
| Fichas de espécimen   | **43** × 63    | **42** × 61     |

En pila hay 17 elementos interactivos por debajo de 44 px en alguna dimensión. Las
pestañas se quedan a 1 px del mínimo —trivial— y las fichas de huevo (43 px de ancho)
están por debajo de forma apreciable.

**Sugerencia**: `py-3.5` → `py-4` en `NavItem` horizontal, y un `min-h-11` en
`GhostButton` cuando la disposición es de pila.

### 768px desperdicia más de la mitad del ancho — Media

**Ancho**: 768px (tablet en vertical)

Los bloques miden 728 px pero los instrumentos que contienen miden 172–290 px y quedan
alineados a la izquierda, así que la columna deja ~60 % del ancho vacío. La pila trata un
iPad en vertical igual que un móvil de 320.

**Sugerencia**: rejilla de dos columnas en `main` a partir de ~640 px
(`sm:grid sm:grid-cols-2`), con los bloques anchos ocupando las dos.

### Etiquetas internas de la urna por debajo de 5px en móvil — Media

**Anchos**: 320, 375px

La fuente mínima renderizada es 4.4 px a 320 px y 4.9 px a 375 px: es el rótulo
`SMART EGG · INCUBADORA DIGITAL`, de 8 px, dentro de la urna escalada a 0.55. El suelo
`MIN_FIT_SCALE = 0.55` protege el desplazamiento lateral pero no la legibilidad del texto
interno de los dibujos.

**Sugerencia**: subir `MIN_FIT_SCALE` a 0.7 (el bloque se desplazaría un poco más) o
suprimir el rótulo de la placa en pila, como ya se hace con las guías de la urna.

## Incidencias bajas

- **La tira de pestañas no lleva indicador de desplazamiento** (320, 375px). Sólo 2 de 5
  pestañas caben, con 338 px de recorrido oculto y la barra de scroll suprimida por CSS.
  Mitigado en la práctica: la tercera pestaña asoma parcialmente y hace de pista.
- **El texto de 8 px del diseño queda por debajo de la guía de 12 px incluso a 1:1** (7.9 px
  a 768). Es la escala tipográfica del diseño original, no un defecto de la adaptación.

## Análisis de transiciones

| Transición                    | Observada en | ¿Limpia? | Notas                                            |
| ----------------------------- | ------------ | -------- | ------------------------------------------------ |
| Riel vertical → barra superior| exactamente 1024px | Sí | Sin estado intermedio; 0 desbordamiento a ambos lados |
| Pila → plano                  | exactamente 1024px | No | Limpia en layout, pero el texto encoge de 7.9 a 4.7 px |
| Pestañas: desplazables → fijas| ~640–768px   | Sí       | 338 px de recorrido a 320, 18 px a 640, 0 a 768   |
| Escala del plano se estanca   | ~1830px      | —        | Tope por altura en 0.876; a partir de ahí sólo crecen los huecos |

## Comprobaciones sin hallazgos

- **Desbordamiento horizontal de página**: 0 px en los ocho anchos.
- **Escalado de medios**: ningún SVG o imagen desborda su contenedor.
- **Apilado de contenido**: los 9 bloques del Centro de control caen en columna única en el
  orden en que la pantalla los declara; ninguno se solapa.
## Recomendaciones por esfuerzo

### Arreglos rápidos (una constante o una clase)

- `STAGE_STACK_SCALE: 0.5 → 0.85` en `lib/smartegg/catalog.ts` — resuelve la incidencia alta
  de legibilidad.
- Tope al ensanchado en `useStageScale` — resuelve la incidencia alta de ultra-ancho.
- `MIN_FIT_SCALE: 0.55 → 0.7` en `lib/hooks/useFitScale.ts`.
- `py-3.5 → py-4` en el `NavItem` horizontal.

### Cambios estructurales

- Rejilla de dos columnas en la pila a partir de ~640 px.
- Que `TrayAngleDial` declare su caja incluyendo el desbordamiento de la plataforma.
- `min-h-11` en los controles cuando la disposición es de pila.

---

# Reverificación — 2026-08-17

Aplicados los arreglos y repetida la comprobación en los mismos ocho anchos.
De paso, la elección de disposición pasó de TypeScript a una media query
(`--breakpoint-console`), así que ya no hay dos ramas de marcado que mantener.

## Resumen

| Ancho  | Antes | Ahora | Fuente mínima     | Táctiles < 44px |
| ------ | ----- | ----- | ----------------- | --------------- |
| 320px  | Warn  | Pass  | 4.4 → **7.9**     | 17 → **0**      |
| 375px  | Warn  | Pass  | 4.9 → **7.9**     | 17 → **0**      |
| 768px  | Warn  | Pass  | 7.9 → 7.9         | 13 → **0**      |
| 1024px | Fail  | Pass  | 4.7 → **7.9**     | 21 → **0**      |
| 1280px | Warn  | Pass  | 5.9 → **7.9**     | 17 → **0**      |
| 1440px | Pass  | Pass  | 6.6 → 6.6         | 17 (plano)      |
| 1920px | Warn  | Pass  | 6.9 → 6.9         | 17 (plano)      |
| 2560px | Fail  | Pass  | 6.9 → 6.9         | 17 (plano)      |

Cero desbordamiento horizontal de página en los ocho anchos **y en las cinco
pantallas** (40 combinaciones). Ningún elemento sale del viewport fuera de un
contenedor desplazable.

## Qué se arregló

| Incidencia                          | Severidad | Arreglo                                                        |
| ----------------------------------- | --------- | -------------------------------------------------------------- |
| Transición empequeñecía el texto    | Alta      | Punto de ruptura 1024 → 1440. La pila llega hasta 1439 a 1:1     |
| Huecos > instrumentos en ultra-ancho| Alta      | `STAGE_MAX_STRETCH = 1.3`. El plano tapa en 2184                 |
| Plataforma del dial recortada 26px  | Media     | La caja del organismo pasa a 532 e incluye la proyección         |
| Objetivos táctiles < 44px           | Media     | `min-h-11` en filas y `min-height` en `.btn-ghost`, sólo en pila |
| 768px desperdiciaba el ancho        | Media     | Rejilla de dos columnas desde `md:`, con `wide` para los anchos  |
| Rótulos de la urna a 4.4px          | Media     | Se elimina el escalado por bloque: todo se dibuja a 1:1          |

## Comprobado

- **Tipografía**: 7.9 px —el tamaño del diseño a 1:1— en toda la pila, de 320 a 1439.
- **Ultra-ancho**: plano tapado en 2184 tanto a 1920 como a 2560; a 2560 quedan bandas
  de 323 px por lado en vez de huecos interiores de 630.
- **Dial**: `recorteIzq: 0, recorteDer: 0` a 375, 768, 1440 y 1920.
- **Táctiles**: 0 elementos por debajo de 44 px a 320, 375, 768 y 1280.
- **Rejilla**: 1 columna de 335 px a 375; 2 de 344 a 768; 2 de 472 a 1024.
- **Plano intacto**: a 1920 × 964 el plano sigue en 2043 con bandas 0/0 y las columnas
  en 176, 747–1295 (centro exacto) y 1589–2003 (margen 40). El dial pasa de 781–1261 a
  755–1287: misma línea central, caja más ancha.

## Punto ciego del propio chequeo

Las ocho comprobaciones miden contra el **viewport**, así que no ven lo que se sale de un
contenedor estrecho sin llegar al borde de la pantalla. Al unificar el marcado del riel se
coló ahí un `whitespace-nowrap` —necesario en la tira de pestañas, dañino en el riel— y
«CENTRO DE CONTROL» dejó de partirse en dos líneas y desbordó los 132 px. `overflowPagina`
seguía en 0 en los ocho anchos.

Añadida una comprobación novena que mide cada texto contra su propio contenedor: 0
desbordamientos a 768, 1440 y 1920, y a 375 sólo las pestañas fuera de vista de la tira
desplazable. La mayor ahora llega a 123 px de los 133 del riel.

## Residuos aceptados

- **6.6 px a 1440**, contra 7.9 en la pila justo debajo. El salto ya no es de 3.2 px sino
  de 1.3, y no se puede eliminar: con una ventana de 900 px de alto el plano nunca pasa de
  0.876 de escala, así que su mejor tipografía posible es 7.0 px. Llevar el punto de
  ruptura a 1500 recuperaría esos 0.4 px a cambio de un umbral menos convencional.
- **La tira de pestañas no lleva indicador de desplazamiento** a 320–375. La siguiente
  pestaña asoma parcialmente y hace de pista.
- **Fichas de espécimen de 43 px de ancho**, 1 px por debajo del mínimo táctil. Ensancharlas
  obligaría a recomponer la tira.
