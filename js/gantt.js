/* ================================================================
   gantt.js — Render del Gantt y su interacción.

   Consume el modelo de parser.js y los cálculos de schedule.js.
   No sabe nada de XML ni de fetch.
   ================================================================ */

const Gantt = (function () {
  'use strict';

  const state = {
    obra: null,
    project: null,
    tasksFlat: [],
    tasksTree: [],
    scale: null,
    zoom: 'semana',
    cutoff: new Date(),
    collapsed: new Set()
  };

  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cachearDom() {
    ['projectStart', 'projectFinish', 'projectCutoff', 'projectProgress',
     'viewer', 'taskList', 'panelRight', 'timelineHeader', 'ganttBody',
     'emptyState', 'loading', 'appHeader'
    ].forEach((id) => { dom[id] = $(id); });
  }

  function formatDate(d) {
    if (!d) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  const mismoDia = (a, b) => aMedianoche(a).getTime() === aMedianoche(b).getTime();

  /* ---- Persistencia (por obra, por pestaña) ---- */

  const clave = (k) => `metta.${state.obra ? state.obra.id : 'obra'}.${k}`;

  function guardarColapso() {
    try { sessionStorage.setItem(clave('colapso'), JSON.stringify([...state.collapsed])); } catch (e) {}
  }

  /** Partidas que se colapsan en "Resumen": todas con hijos salvo la raíz principal. */
  function conjuntoResumen() {
    const raizUid = state.tasksTree[0] ? state.tasksTree[0].uid : null;
    const set = new Set();
    state.tasksFlat.forEach((t) => {
      if (t.children.length && t.uid !== raizUid) set.add(t.uid);
    });
    return set;
  }

  function cargarColapso() {
    state.collapsed = new Set();
    try {
      const crudo = sessionStorage.getItem(clave('colapso'));
      if (crudo) { state.collapsed = new Set(JSON.parse(crudo)); return; }
    } catch (e) {}
    if (state.obra && state.obra.vistaInicial === 'resumen') state.collapsed = conjuntoResumen();
  }

  function guardarZoom() {
    try { sessionStorage.setItem(clave('zoom'), state.zoom); } catch (e) {}
    // Refleja la vista en la URL para poder compartir el link tal cual.
    try {
      const url = new URL(location.href);
      url.searchParams.set('vista', state.zoom);
      history.replaceState(null, '', url);
    } catch (e) {}
  }

  function cargarZoom() {
    try {
      const z = sessionStorage.getItem(clave('zoom'));
      if (z && ZOOMS[z]) state.zoom = z;
    } catch (e) {}
  }

  /* ---- Visibilidad ---- */

  function recalcularVisibilidad() {
    state.tasksFlat.forEach((t) => {
      let oculta = false;
      for (let p = t.parent; p; p = p.parent) {
        if (state.collapsed.has(p.uid)) { oculta = true; break; }
      }
      t.isHidden = oculta;
      t.isCollapsed = state.collapsed.has(t.uid);
    });
  }

  /* ---- Panel izquierdo ---- */

  function celda(clase, texto) {
    const d = document.createElement('div');
    d.className = clase;
    d.textContent = texto;
    return d;
  }

  function construirFilaTarea(task) {
    const fila = document.createElement('div');
    fila.className = 'task-row';
    if (task.isHidden) fila.classList.add('is-hidden');
    if (task.isSummary) fila.classList.add('is-summary');
    if (task.isMilestone) fila.classList.add('is-milestone');
    fila.dataset.uid = task.uid;
    fila.dataset.level = task.outlineLevel;

    const toggle = document.createElement('button');
    toggle.className = 'task-toggle';
    toggle.type = 'button';
    if (task.children.length === 0) {
      toggle.classList.add('is-leaf');
      toggle.tabIndex = -1;
    } else {
      toggle.textContent = task.isCollapsed ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', String(!task.isCollapsed));
      toggle.setAttribute('aria-label', `Contraer o expandir ${task.name}`);
    }
    fila.appendChild(toggle);

    const nombre = celda('task-name', task.name);
    nombre.title = task.name;
    nombre.style.paddingLeft = `calc(4px + ${Math.max(0, task.outlineLevel - 1)} * 16px)`;
    fila.appendChild(nombre);

    fila.appendChild(celda('task-num is-dur', task.isMilestone ? 'Hito' : `${task.durationDays} d`));
    fila.appendChild(celda('task-num is-start', formatDate(task.start)));
    fila.appendChild(celda('task-num is-finish', formatDate(task.finish)));

    const pct = celda('task-num is-pct', `${task.percentComplete}%`);
    if (task.percentComplete >= 100) pct.classList.add('is-done');
    else if (task.percentComplete > 0) pct.classList.add('is-partial');
    fila.appendChild(pct);

    return fila;
  }

  function renderPanelIzquierdo() {
    const frag = document.createDocumentFragment();
    state.tasksFlat.forEach((t) => frag.appendChild(construirFilaTarea(t)));
    dom.taskList.replaceChildren(frag);
  }

  /* ---- Encabezado de tiempo ---- */

  const ALTO_HEADER = 54;   // = .timeline-header y .panel-left-header en CSS

  function renderTimeline() {
    const sc = state.scale;
    const anchoDe = (c) => ((c.end - c.start) / MS_POR_DIA) * sc.pxPerDay;
    const alto = ALTO_HEADER / sc.filas.length;
    const ultima = sc.filas.length - 1;

    const filas = sc.filas.map((campo, i) => {
      const fila = document.createElement('div');
      fila.className = 'timeline-row';
      fila.style.height = `${alto}px`;

      if (i === ultima) {
        // Fila fina: una celda por unidad.
        sc.cells.forEach((c) => {
          const n = document.createElement('div');
          n.className = 'timeline-cell';
          n.style.width = `${anchoDe(c)}px`;
          const ancho = anchoDe(c);
          n.textContent = (c.labelCorto && ancho < 72) ? c.labelCorto : c[campo];
          n.title = c.titulo || '';
          if (c.isWeekend) n.classList.add('weekend');
          if (c.isMajor) n.classList.add('is-major');
          fila.appendChild(n);
        });
        return fila;
      }

      // Fila agrupada: fusiona celdas consecutivas con la misma etiqueta.
      let grupo = null;
      sc.cells.forEach((c) => {
        if (!grupo || grupo.etiqueta !== c[campo]) {
          grupo = { etiqueta: c[campo], ancho: 0, nodo: document.createElement('div') };
          grupo.nodo.className = `timeline-cell group group-${campo}`;
          const span = document.createElement('span');
          span.textContent = c[campo];
          grupo.nodo.appendChild(span);
          grupo.nodo.title = campo === 'semana' ? c.semanaTitulo : c[campo];
          fila.appendChild(grupo.nodo);
        }
        grupo.ancho += anchoDe(c);
        grupo.nodo.style.width = `${grupo.ancho}px`;
      });
      return fila;
    });

    dom.timelineHeader.replaceChildren(...filas);
    dom.timelineHeader.style.width = `${sc.totalWidth}px`;
    dom.timelineHeader.dataset.escala = sc.zoom;
  }

  /* ---- Gantt ---- */

  function tooltip(task) {
    const resp = (task.resources && task.resources.length) ? `\nRecurso: ${task.resources.join(', ')}` : '';
    if (task.isMilestone) return `${task.name}\nHito · ${formatDate(task.start)} · ${task.percentComplete}%${resp}`;
    return `${task.name}\n${formatDate(task.start)} → ${formatDate(task.finish)}\n${task.durationDays} d · ${task.percentComplete}% completado${resp}`;
  }

  function construirBarra(task) {
    const m = barMetrics(task, state.scale);
    if (!m) return null;
    const estado = taskStatus(task, state.cutoff);

    if (task.isMilestone) {
      const d = document.createElement('div');
      d.className = `milestone milestone--${estado}`;
      const centro = m.left + Math.min(state.scale.pxPerDay, 30) / 2;
      d.style.left = `${centro - 7}px`;
      d.title = tooltip(task);
      return d;
    }

    const barra = document.createElement('div');
    barra.className = `bar bar--${estado}`;
    if (task.isCritical) barra.classList.add('is-critical');
    barra.style.left = `${m.left}px`;
    barra.style.width = `${m.width}px`;
    barra.title = tooltip(task);

    if (task.percentComplete > 0 && task.percentComplete < 100 && !task.isSummary) {
      const avance = document.createElement('div');
      avance.className = 'bar-progress';
      avance.style.width = `${task.percentComplete}%`;
      barra.appendChild(avance);
    }
    return barra;
  }

  function marcador(clase, fecha, etiqueta, enMedio) {
    const sc = state.scale;
    const x = dateToPx(fecha, sc) + (enMedio ? sc.pxPerDay / 2 : sc.pxPerDay);
    const linea = document.createElement('div');
    linea.className = `marker ${clase}`;
    linea.style.left = `${x}px`;
    const tag = document.createElement('span');
    tag.className = 'marker-tag';
    tag.textContent = etiqueta;
    linea.appendChild(tag);
    return linea;
  }

  function renderGantt() {
    const sc = state.scale;
    const frag = document.createDocumentFragment();

    let x = 0;
    sc.cells.forEach((c) => {
      const ancho = ((c.end - c.start) / MS_POR_DIA) * sc.pxPerDay;
      if (c.isWeekend) {
        const banda = document.createElement('div');
        banda.className = 'gantt-weekend-band';
        banda.style.left = `${x}px`;
        banda.style.width = `${ancho}px`;
        frag.appendChild(banda);
      }
      const linea = document.createElement('div');
      linea.className = 'gantt-grid-line' + (c.isMajor ? ' is-major' : '');
      linea.style.left = `${x}px`;
      frag.appendChild(linea);
      x += ancho;
    });

    state.tasksFlat.forEach((task) => {
      const fila = document.createElement('div');
      fila.className = 'gantt-row';
      if (task.isHidden) fila.classList.add('is-hidden');
      if (task.isSummary) fila.classList.add('is-summary');
      fila.dataset.uid = task.uid;
      const barra = construirBarra(task);
      if (barra) fila.appendChild(barra);
      frag.appendChild(fila);
    });

    // Línea de corte (StatusDate del XML) y, si es otro día, la de hoy.
    frag.appendChild(marcador('marker--corte', state.cutoff, `Corte ${formatDate(state.cutoff)}`, false));
    const hoy = new Date();
    if (!mismoDia(hoy, state.cutoff)) {
      frag.appendChild(marcador('marker--hoy', hoy, 'Hoy', true));
    }

    dom.ganttBody.replaceChildren(frag);
    dom.ganttBody.style.width = `${sc.totalWidth}px`;
  }

  /* ---- Scroll: conservar la fecha al cambiar de zoom ---- */

  function insetGantt() {
    return parseFloat(getComputedStyle(dom.panelRight).paddingLeft) || 0;
  }

  /** Fecha (en días desde el origen) en la posición `fraccion` del ancho visible. */
  function diaVisible(fraccion) {
    if (!state.scale) return null;
    const p = dom.panelRight;
    const x = p.scrollLeft + p.clientWidth * fraccion - insetGantt();
    return x / state.scale.pxPerDay;
  }

  function scrollADia(dias, fraccion) {
    const p = dom.panelRight;
    p.scrollLeft = Math.max(0, dias * state.scale.pxPerDay + insetGantt() - p.clientWidth * fraccion);
  }

  /** Lleva la vista a una fecha, dejándola a un tercio del ancho visible. */
  function irAFecha(fecha) {
    if (!state.scale) return;
    scrollADia((aMedianoche(fecha) - state.scale.origin) / MS_POR_DIA, 0.33);
  }

  /* ---- Orquestación ---- */

  function render() {
    if (!state.tasksFlat.length) {
      dom.viewer.hidden = true;
      dom.emptyState.hidden = false;
      dom.loading.hidden = true;
      return;
    }
    // Visible ANTES de medir: la vista Mes necesita el ancho real del panel.
    dom.loading.hidden = true;
    dom.viewer.hidden = false;
    dom.emptyState.hidden = true;
    recalcularVisibilidad();
    const rango = projectDateRange(state.tasksFlat);
    const inicio = rango ? rango.start : state.project.start;
    const fin = rango ? rango.finish : state.project.finish;
    const ancho = dom.panelRight.clientWidth - insetGantt() * 2;
    state.scale = computeScale(inicio, fin, state.zoom, ancho);
    renderPanelIzquierdo();
    renderTimeline();
    renderGantt();
  }

  // Al cambiar el tamaño de la ventana, la vista Mes se reajusta al nuevo ancho.
  let esperaResize = null;
  window.addEventListener('resize', () => {
    if (state.zoom !== 'mes' || !state.tasksFlat.length) return;
    clearTimeout(esperaResize);
    esperaResize = setTimeout(render, 150);
  });

  /** Fecha a la que se lleva la vista al abrir: hoy si cae dentro de la obra, si no el corte. */
  function fechaFoco() {
    const rango = projectDateRange(state.tasksFlat);
    const hoy = new Date();
    if (rango && hoy >= rango.start && hoy <= rango.finish) return hoy;
    return state.cutoff;
  }

  function setProject(project, obra, opciones) {
    state.obra = obra || state.obra;
    state.project = project;
    state.tasksFlat = project.tasksFlat;
    state.tasksTree = project.tasksTree;
    state.cutoff = project.statusDate || new Date();

    const rango = projectDateRange(state.tasksFlat);
    dom.projectStart.textContent = formatDate(rango ? rango.start : project.start);
    dom.projectFinish.textContent = formatDate(rango ? rango.finish : project.finish);
    dom.projectCutoff.textContent = formatDate(state.cutoff);
    const avance = project.percentComplete != null
      ? project.percentComplete
      : (state.tasksTree[0] ? state.tasksTree[0].percentComplete : 0);
    dom.projectProgress.textContent = `${avance}%`;

    cargarColapso();
    cargarZoom();
    // ?vista=dia|semana|mes en la URL manda sobre lo recordado en la pestaña.
    if (opciones && ZOOMS[opciones.zoom]) state.zoom = opciones.zoom;
    sincronizarBotonesZoom();
    render();
    irAFecha(fechaFoco());
  }

  /* ---- Interacción ---- */

  function alternarColapso(uid) {
    if (state.collapsed.has(uid)) state.collapsed.delete(uid);
    else state.collapsed.add(uid);
    guardarColapso();
    const dia = diaVisible(0.5);
    render();
    if (dia != null) scrollADia(dia, 0.5);
  }

  function conectarColapso() {
    dom.taskList.addEventListener('click', (ev) => {
      const fila = ev.target.closest('.task-row');
      if (!fila) return;
      const boton = fila.querySelector('.task-toggle');
      // Clic en el triángulo o en el nombre de una partida: colapsa/expande.
      if (boton && !boton.classList.contains('is-leaf') &&
          (ev.target.closest('.task-toggle') || ev.target.closest('.task-name'))) {
        alternarColapso(parseInt(fila.dataset.uid, 10));
      }
    });
  }

  function conectarScrollSincronizado() {
    let sincronizando = false;
    const enlazar = (origen, destino) => {
      origen.addEventListener('scroll', () => {
        if (sincronizando) return;
        sincronizando = true;
        destino.scrollTop = origen.scrollTop;
        requestAnimationFrame(() => { sincronizando = false; });
      });
    };
    enlazar(dom.taskList, dom.panelRight);
    enlazar(dom.panelRight, dom.taskList);

    // La rueda sobre el panel izquierdo (que no muestra scrollbar) también desplaza.
    dom.taskList.addEventListener('wheel', (ev) => {
      if (ev.shiftKey) return;
      dom.panelRight.scrollTop += ev.deltaY;
      ev.preventDefault();
    }, { passive: false });
  }

  function conectarHover() {
    let uidActivo = null;
    const pintar = (uid, on) => {
      document.querySelectorAll(`[data-uid="${uid}"]`).forEach((el) => el.classList.toggle('is-hover', on));
    };
    const alMover = (ev) => {
      const fila = ev.target.closest('[data-uid]');
      const uid = fila ? fila.dataset.uid : null;
      if (uid === uidActivo) return;
      if (uidActivo !== null) pintar(uidActivo, false);
      if (uid !== null) pintar(uid, true);
      uidActivo = uid;
    };
    const alSalir = () => {
      if (uidActivo !== null) pintar(uidActivo, false);
      uidActivo = null;
    };
    [dom.taskList, dom.ganttBody].forEach((panel) => {
      panel.addEventListener('mousemove', alMover);
      panel.addEventListener('mouseleave', alSalir);
    });
  }

  let interaccionConectada = false;
  function conectarInteraccion() {
    if (interaccionConectada) return;
    interaccionConectada = true;
    conectarColapso();
    conectarScrollSincronizado();
    conectarHover();
  }

  /* ---- Controles del encabezado ---- */

  function sincronizarBotonesZoom() {
    document.querySelectorAll('.btn-zoom[data-zoom]').forEach((b) => {
      const activo = b.dataset.zoom === state.zoom;
      b.classList.toggle('is-active', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
  }

  /** Cambia de escala conservando la fecha que estaba al centro de la vista. */
  function aplicarZoom(nivel) {
    if (!ZOOMS[nivel] || !state.tasksFlat.length) return;
    const dia = diaVisible(0.5);
    state.zoom = nivel;
    guardarZoom();
    sincronizarBotonesZoom();
    render();
    if (dia != null) scrollADia(dia, 0.5);
  }

  function colapsarTodo(colapsar) {
    state.collapsed = colapsar ? conjuntoResumen() : new Set();
    guardarColapso();
    const dia = diaVisible(0.5);
    render();
    if (dia != null) scrollADia(dia, 0.5);
  }

  function alternarHeader() {
    const colapsado = dom.appHeader.classList.toggle('is-collapsed');
    const b = $('btnHeaderCollapse');
    if (b) b.setAttribute('aria-expanded', String(!colapsado));
  }

  let controlesConectados = false;
  function conectarControles() {
    if (controlesConectados) return;
    controlesConectados = true;
    document.querySelectorAll('.btn-zoom[data-zoom]').forEach((b) => {
      b.addEventListener('click', () => aplicarZoom(b.dataset.zoom));
    });
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('btnHoy', () => irAFecha(new Date()));
    on('btnExpandAll', () => colapsarTodo(false));
    on('btnCollapseAll', () => colapsarTodo(true));
    on('btnHeaderCollapse', alternarHeader);

    // Atajos: D / S / M cambian la escala; H va a hoy.
    document.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target.closest('input, textarea, select')) return;
      const k = ev.key.toLowerCase();
      if (k === 'd') aplicarZoom('dia');
      else if (k === 's') aplicarZoom('semana');
      else if (k === 'm') aplicarZoom('mes');
      else if (k === 'h') irAFecha(new Date());
    });
    sincronizarBotonesZoom();
  }

  return {
    state, cachearDom, formatDate, render, setProject,
    conectarInteraccion, conectarControles, aplicarZoom, colapsarTodo, irAFecha
  };
})();
