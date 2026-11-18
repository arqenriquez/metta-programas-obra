/* ================================================================
   parser.js — Documento XML de MS Project → modelo de tareas.

   Módulo PURO: no toca el DOM de la página, no hace fetch, no
   conoce CSS. Recibe un Document ya parseado (app.js lo produce
   con DOMParser en el navegador; las pruebas lo inyectan desde
   @xmldom/xmldom en Node).
   ================================================================ */

const HORAS_POR_JORNADA = 8;

/**
 * Texto de un hijo DIRECTO por nombre de etiqueta, ignorando el namespace.
 *
 * Se recorre childNodes filtrando nodeType===1 en vez de usar `children`
 * porque @xmldom/xmldom no implementa `children`. Se compara por localName
 * para no tener que registrar el prefijo del namespace de MS Project.
 */
function getChildText(node, tagName) {
  const hijos = node.childNodes;
  for (let i = 0; i < hijos.length; i++) {
    const c = hijos[i];
    if (c.nodeType === 1 && c.localName === tagName) return c.textContent;
  }
  return null;
}

/**
 * Duración ISO 8601 de MS Project → días laborales.
 * Formatos reales: "PT80H0M0S", "P2DT8H0M0S", "PT0H0M0S".
 * Convención: 8 horas = 1 día (coincide con MinutesPerDay=480 del XML).
 */
function parseDurationDays(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const mDias  = iso.match(/P(?:(\d+)D)?/);
  const mHoras = iso.match(/T(?:(\d+)H)?(?:(\d+)M)?/);
  const dias   = mDias  && mDias[1]  ? parseInt(mDias[1], 10)  : 0;
  const horas  = mHoras && mHoras[1] ? parseInt(mHoras[1], 10) : 0;
  const mins   = mHoras && mHoras[2] ? parseInt(mHoras[2], 10) : 0;
  const totalHoras = dias * HORAS_POR_JORNADA + horas + mins / 60;
  return Math.max(0, Math.round(totalHoras / HORAS_POR_JORNADA));
}

/**
 * "2026-01-05T09:00:00" → Date. null si viene vacío o inválido.
 */
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Lee los UIDs de las tareas predecesoras de un nodo <Task>.
 * Cada <PredecessorLink> tiene un <PredecessorUID>.
 */
function leerPredecesoras(nodo) {
  const uids = [];
  const hijos = nodo.childNodes;
  for (let i = 0; i < hijos.length; i++) {
    const c = hijos[i];
    if (c.nodeType === 1 && c.localName === 'PredecessorLink') {
      const uid = parseInt(getChildText(c, 'PredecessorUID'), 10);
      if (!Number.isNaN(uid)) uids.push(uid);
    }
  }
  return uids;
}

/**
 * Convierte un nodo <Task> al objeto del modelo.
 * Devuelve null si la tarea debe descartarse (UID=0 o sin nombre).
 */
function nodoATarea(nodo) {
  const uid = parseInt(getChildText(nodo, 'UID'), 10);
  if (Number.isNaN(uid) || uid === 0) return null;   // UID=0 es el nodo raíz

  const name = (getChildText(nodo, 'Name') || '').trim();
  if (!name) return null;

  const pct = parseInt(getChildText(nodo, 'PercentComplete'), 10) || 0;

  return {
    uid,
    name,
    wbs: getChildText(nodo, 'WBS') || '',
    outlineLevel: parseInt(getChildText(nodo, 'OutlineLevel'), 10) || 1,
    isSummary: getChildText(nodo, 'Summary') === '1',
    isMilestone: getChildText(nodo, 'Milestone') === '1',
    isCritical: getChildText(nodo, 'Critical') === '1',
    start: parseDate(getChildText(nodo, 'Start')),
    finish: parseDate(getChildText(nodo, 'Finish')),
    durationDays: parseDurationDays(getChildText(nodo, 'Duration')),
    percentComplete: Math.max(0, Math.min(100, pct)),
    predecessors: leerPredecesoras(nodo),
    resources: [],
    children: [],
    parent: null,
    isCollapsed: false,
    isHidden: false
  };
}

/**
 * Arma el árbol a partir de la lista plana.
 * El XML viene en orden de esquema, así que basta con una pila indexada
 * por nivel: el padre de una tarea de nivel N es la última tarea vista
 * de nivel N-1.
 * Muta las tareas (asigna parent/children) y devuelve las raíces.
 */
function buildTree(tasksFlat) {
  const pila = [];
  tasksFlat.forEach((tarea) => {
    tarea.parent = pila[tarea.outlineLevel - 1] || null;
    if (tarea.parent) tarea.parent.children.push(tarea);
    pila[tarea.outlineLevel] = tarea;
    // Al subir de nivel, invalidar los niveles más profundos.
    for (let i = tarea.outlineLevel + 1; i < pila.length; i++) pila[i] = undefined;
  });
  return tasksFlat.filter((t) => t.parent === null);
}

/**
 * Bloque <Resources> → Map(UID string → Nombre).
 * Descarta el recurso nulo (UID 0, sin <Name>) y los nombres vacíos.
 * En MS Project el "recurso" es el responsable de la actividad.
 */
function leerRecursos(doc) {
  const porUid = new Map();
  const nodos = doc.getElementsByTagName('Resource');
  for (let i = 0; i < nodos.length; i++) {
    const uid = getChildText(nodos[i], 'UID');
    const nombre = (getChildText(nodos[i], 'Name') || '').trim();
    if (uid && uid !== '0' && nombre) porUid.set(uid, nombre);
  }
  return porUid;
}

/**
 * Bloque <Assignments> → Map(TaskUID number → [nombres de responsables]).
 * Cada <Assignment> liga un TaskUID con un ResourceUID. Se descartan:
 *   - ResourceUID -65535: marcador de "sin recurso" que mete MS Project.
 *   - UIDs que no estén en el mapa de recursos (el nulo, o basura).
 * Una tarea puede tener varias asignaciones; se deduplica por nombre.
 */
function leerAsignaciones(doc, recursosPorUid) {
  const porTarea = new Map();
  const nodos = doc.getElementsByTagName('Assignment');
  for (let i = 0; i < nodos.length; i++) {
    const tuid = parseInt(getChildText(nodos[i], 'TaskUID'), 10);
    if (Number.isNaN(tuid)) continue;
    const nombre = recursosPorUid.get(getChildText(nodos[i], 'ResourceUID'));
    if (!nombre) continue;
    const lista = porTarea.get(tuid) || [];
    if (!lista.includes(nombre)) lista.push(nombre);
    porTarea.set(tuid, lista);
  }
  return porTarea;
}

/**
 * Punto de entrada del módulo.
 * @param {Document} doc  XML de MS Project ya parseado.
 * @returns {{name, start, finish, statusDate, tasksFlat, tasksTree}}
 */
function parseProject(doc) {
  const raiz = doc.documentElement;
  if (!raiz || raiz.localName !== 'Project') {
    throw new Error('El archivo no parece un XML de MS Project (falta el nodo <Project>).');
  }

  const recursosPorUid = leerRecursos(doc);
  const responsablesPorTarea = leerAsignaciones(doc, recursosPorUid);

  const nodos = doc.getElementsByTagName('Task');
  const tasksFlat = [];
  // La tarea UID=0 es el resumen del proyecto que arma MS Project: no se
  // lista, pero su % completado ES el avance general de la obra.
  let avanceProyecto = null;
  for (let i = 0; i < nodos.length; i++) {
    if (getChildText(nodos[i], 'UID') === '0') {
      const pct = parseInt(getChildText(nodos[i], 'PercentComplete'), 10);
      if (!Number.isNaN(pct)) avanceProyecto = Math.max(0, Math.min(100, pct));
    }
    const tarea = nodoATarea(nodos[i]);
    if (tarea) {
      tarea.resources = responsablesPorTarea.get(tarea.uid) || [];
      tasksFlat.push(tarea);
    }
  }

  return {
    name: getChildText(raiz, 'Title') || getChildText(raiz, 'Name') || 'Proyecto sin nombre',
    start: parseDate(getChildText(raiz, 'StartDate')),
    finish: parseDate(getChildText(raiz, 'FinishDate')),
    statusDate: parseDate(getChildText(raiz, 'StatusDate')) || new Date(),
    percentComplete: avanceProyecto,
    tasksFlat,
    tasksTree: buildTree(tasksFlat)
  };
}

// Exporta en Node (pruebas) sin romper el <script> del navegador.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getChildText, parseDurationDays, parseDate, buildTree, parseProject, leerRecursos, leerAsignaciones };
}
