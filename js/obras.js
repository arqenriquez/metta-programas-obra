/* ================================================================
   obras.js — Catálogo de obras activas.

   Para AGREGAR una obra: copia uno de los bloques, cambia el id (sin
   espacios ni acentos), el nombre, el subtítulo y el archivo XML que
   pusiste en la carpeta data/. La pantalla de inicio crea la tarjeta
   sola. Para RETIRAR una obra, borra su bloque.

   icono:        'amenidades' | 'casas' | 'edificio'
   vistaInicial: 'desglose' (todas las tareas) | 'resumen' (solo partidas)
   ================================================================ */

const OBRAS = [
  {
    id: 'lander',
    nombre: 'LANDER',
    subtitulo: 'Amenidades · Mar de Planta',
    xml: 'data/lander.xml',
    icono: 'amenidades',
    vistaInicial: 'desglose'
  },
  {
    id: 'altozano',
    nombre: 'ALTOZANO',
    subtitulo: 'Programa de cierre · 7 casas',
    xml: 'data/altozano.xml',
    icono: 'casas',
    vistaInicial: 'resumen'
  }
];
