# Programas de Obra · Metta

Visor web de los programas de obra activos de Metta Arquitectura y Construcción.
Lee directamente el XML que exporta MS Project y lo dibuja como Gantt.

- **Inicio** (`index.html`): una tarjeta por obra con avance real, fechas y actividades.
- **Programa** (`programa.html?obra=<id>`): Gantt con escalas **Día / Semana / Mes**,
  botón **Hoy**, **Desglosar / Resumen**, línea de fecha de corte y semáforo de estado.

Sitio estático (HTML + CSS + JS vanilla), sin backend. Publicado en Vercel.

## Obras

| id         | Obra                              | Archivo             |
|------------|-----------------------------------|---------------------|
| `lander`   | Lander · Amenidades Mar de Planta | `data/lander.xml`   |
| `altozano` | Altozano · Cierre 7 casas         | `data/altozano.xml` |

El catálogo vive en `js/obras.js`.

## Uso del visor

| Control | Qué hace |
|---|---|
| **Día** (tecla D) | Una columna por día: mes · semana de obra · día (L 17). Fines de semana sombreados. |
| **Semana** (tecla S) | Una columna por semana de obra (S1 = semana del arranque) con la fecha del lunes. |
| **Mes** (tecla M) | Vista general: la obra completa se ajusta al ancho de la pantalla. |
| **Hoy** (tecla H) | Lleva el calendario a la fecha de hoy. |
| **Desglosar / Resumen** | Todas las tareas, o solo las partidas principales. |
| ▸ / clic en una partida | Contrae o expande esa partida. |
| Botón ⤒ | Vista previa local de un XML nuevo antes de publicarlo (no se publica). |

Al cambiar de escala se conserva la fecha que estabas viendo. La URL recuerda la
escala (`&vista=dia|semana|mes`), así que el link se puede compartir tal cual.

**Colores de barra** (contra la fecha de corte = *Fecha de estado* de MS Project):
verde completada · azul en tiempo · rojo atrasada · naranja debió iniciar · gris por iniciar ·
grafito partida. Línea roja = fecha de corte; línea azul punteada = hoy.

## Estructura

```
index.html          Pantalla de inicio (tarjetas)
programa.html       Visor Gantt
css/home.css        Estilos del inicio
css/gantt.css       Estilos del visor
js/obras.js         Catálogo de obras  ← aquí se agregan/quitan obras
js/parser.js        XML de MS Project → modelo de tareas
js/schedule.js      Escalas Día/Semana/Mes, estados, geometría
js/gantt.js         Render e interacción del Gantt
js/app.js           Arranque del visor (carga del XML, errores, vista previa)
js/home.js          Arranque del inicio
data/*.xml          Programas exportados de MS Project
assets/             Logo Metta y favicon
vercel.json         Sin caché para data/, js/, css/ y html
```

## Correr en local

```bash
python -m http.server 3110
```

y abrir http://localhost:3110. (Con doble clic al HTML no carga el XML: el navegador
bloquea `fetch` en `file://`; el visor ofrece entonces arrastrar el archivo.)

Para actualizar un programa, ver **MANUAL-ACTUALIZACION.md**.
