/* ================================================================
   schedule.js — Cálculos puros sobre el modelo de tareas.

   No toca el DOM ni conoce el XML. Convierte fechas en coordenadas,
   arma las escalas Día / Semana / Mes y clasifica tareas por estado.
   ================================================================ */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LETRAS_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/**
 * Los tres niveles de zoom. `pxPerDay` define la geometría; `filas` dice
 * qué campos de cada celda forman las filas del encabezado (de la más
 * gruesa a la más fina). Las filas se agrupan cuando celdas consecutivas
 * repiten etiqueta; la última fila siempre es una celda por unidad.
 *
 *   Día    → mes · semana de obra · día (letra + número)
 *   Semana → mes · semana de obra · lunes de esa semana
 *   Mes    → año · mes
 */
const ZOOMS = {
  dia:    { pxPerDay: 30, filas: ['mes', 'semana', 'label'] },
  semana: { pxPerDay: 9,  filas: ['mes', 'semana', 'label'] },
  mes:    { pxPerDay: 3,  filas: ['anio', 'label'] }
};

function aMedianoche(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumarDias(fecha, n) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + n);
  return d;
}

/** Lunes 00:00 de la semana que contiene a `fecha` (domingo retrocede). */
function lunesDeLaSemana(fecha) {
  const d = aMedianoche(fecha);
  const dow = d.getDay();
  return sumarDias(d, dow === 0 ? -6 : 1 - dow);
}

function etiquetaMes(fecha) {
  return `${MESES_LARGOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

function rangoSemana(lunes) {
  const dom = sumarDias(lunes, 6);
  return `${lunes.getDate()} ${MESES_CORTOS[lunes.getMonth()]} – ${dom.getDate()} ${MESES_CORTOS[dom.getMonth()]} ${dom.getFullYear()}`;
}

/** Día: una celda por día; se rellena hasta completar la semana. */
function celdasDiarias(origin, fin) {
  const cells = [];
  let cursor = new Date(origin);
  while (cursor <= fin || cells.length % 7 !== 0) {
    const siguiente = sumarDias(cursor, 1);
    const dow = cursor.getDay();
    const nSemana = Math.floor(cells.length / 7) + 1;
    const lunes = sumarDias(origin, (nSemana - 1) * 7);
    cells.push({
      start: new Date(cursor),
      end: siguiente,
      mes: etiquetaMes(cursor),
      semana: `Semana ${nSemana}`,
      semanaTitulo: `Semana ${nSemana} · ${rangoSemana(lunes)}`,
      label: `${LETRAS_DIA[dow]} ${cursor.getDate()}`,
      titulo: cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      isWeekend: dow === 0 || dow === 6,
      isMajor: dow === 1
    });
    cursor = siguiente;
  }
  return cells;
}

/** Semana: una celda por semana de obra (S1 = semana del arranque). */
function celdasSemanales(origin, fin) {
  const cells = [];
  let cursor = new Date(origin);
  let n = 1;
  while (cursor <= fin) {
    const siguiente = sumarDias(cursor, 7);
    cells.push({
      start: new Date(cursor),
      end: siguiente,
      mes: etiquetaMes(cursor),
      semana: `S${n}`,
      semanaTitulo: `Semana ${n} · ${rangoSemana(cursor)}`,
      label: `${cursor.getDate()} ${MESES_CORTOS[cursor.getMonth()]}`,
      titulo: `Semana ${n} · ${rangoSemana(cursor)}`,
      isWeekend: false,
      isMajor: cells.length === 0 || cells[cells.length - 1].start.getMonth() !== cursor.getMonth()
    });
    cursor = siguiente;
    n++;
  }
  return cells;
}

/**
 * Mes: una celda por mes. La primera arranca en el origen (no el día 1)
 * para que las coordenadas midan desde el mismo punto en los tres zooms.
 */
function celdasMensuales(origin, fin) {
  const cells = [];
  let cursor = new Date(origin);
  while (cursor <= fin) {
    const sig = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    cells.push({
      start: new Date(cursor),
      end: sig,
      anio: `${cursor.getFullYear()}`,
      label: MESES_LARGOS[cursor.getMonth()],
      labelCorto: MESES_CORTOS[cursor.getMonth()],
      titulo: etiquetaMes(cursor),
      isWeekend: false,
      isMajor: true
    });
    cursor = sig;
  }
  return cells;
}

/**
 * Escala de tiempo del Gantt.
 * @param {'dia'|'semana'|'mes'} zoom  Fallback: 'semana'.
 * @param {number} [anchoDisponible]  En 'mes' la escala se estira para
 *   llenar este ancho: la vista mensual muestra la obra completa en pantalla.
 */
function computeScale(projectStart, projectFinish, zoom, anchoDisponible) {
  const nivel = ZOOMS[zoom] ? zoom : 'semana';
  const cfg = ZOOMS[nivel];

  if (aMedianoche(projectFinish) < aMedianoche(projectStart)) {
    throw new Error('Las fechas del proyecto están invertidas: la fecha de fin es anterior a la de inicio.');
  }

  const origin = lunesDeLaSemana(projectStart);
  // Una semana de aire al final para que la última barra no quede pegada al borde.
  const fin = sumarDias(aMedianoche(projectFinish), 7);

  let cells;
  if (nivel === 'dia') cells = celdasDiarias(origin, fin);
  else if (nivel === 'mes') cells = celdasMensuales(origin, fin);
  else cells = celdasSemanales(origin, fin);

  const totalDays = (cells[cells.length - 1].end - origin) / MS_POR_DIA;
  let pxPerDay = cfg.pxPerDay;
  if (nivel === 'mes' && anchoDisponible > 0) {
    pxPerDay = Math.max(pxPerDay, anchoDisponible / totalDays);
  }

  return {
    zoom: nivel,
    pxPerDay,
    filas: cfg.filas,
    origin,
    cells,
    totalDays,
    totalWidth: totalDays * pxPerDay
  };
}

const ANCHO_MINIMO_BARRA = 3;

/** Avance que la tarea DEBERÍA llevar a la fecha de corte (interpolación lineal). */
function expectedProgress(task, cutoffDate) {
  if (!task.start || !task.finish) return 0;
  const inicio = task.start.getTime();
  const fin = task.finish.getTime();
  const corte = cutoffDate.getTime();
  if (fin <= inicio) return corte >= fin ? 100 : 0;
  if (corte <= inicio) return 0;
  if (corte >= fin) return 100;
  return ((corte - inicio) / (fin - inicio)) * 100;
}

/** Estado de la tarea contra la FECHA DE CORTE. Es el sufijo de la clase CSS. */
function taskStatus(task, cutoffDate) {
  if (task.isSummary) return 'resumen';
  if (task.percentComplete >= 100) return 'completada';
  if (task.percentComplete > 0) {
    return task.percentComplete >= expectedProgress(task, cutoffDate) ? 'en-tiempo' : 'atrasada';
  }
  if (!task.start) return 'no-iniciada';
  return task.start.getTime() <= cutoffDate.getTime() ? 'debio-iniciar' : 'no-iniciada';
}

/** Posición horizontal (px) del inicio del día de `date`. */
function dateToPx(date, scale) {
  return ((aMedianoche(date) - scale.origin) / MS_POR_DIA) * scale.pxPerDay;
}

/** Geometría de la barra. El Finish de MS Project es inclusivo (+1 día). */
function barMetrics(task, scale) {
  if (!task.start || !task.finish) return null;
  const left = dateToPx(task.start, scale);
  const right = dateToPx(sumarDias(task.finish, 1), scale);
  return { left, width: Math.max(ANCHO_MINIMO_BARRA, right - left) };
}

/** Rango real de las tareas (el StartDate del XML suele ser otra cosa). */
function projectDateRange(tasksFlat) {
  let start = null;
  let finish = null;
  (tasksFlat || []).forEach((t) => {
    if (!t.start || !t.finish) return;
    if (!start || t.start < start) start = t.start;
    if (!finish || t.finish > finish) finish = t.finish;
  });
  if (!start || !finish) return null;
  return { start: new Date(start), finish: new Date(finish) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZOOMS, computeScale, lunesDeLaSemana, sumarDias, aMedianoche, MS_POR_DIA,
    expectedProgress, taskStatus, dateToPx, barMetrics, projectDateRange
  };
}
