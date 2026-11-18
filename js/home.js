/* ================================================================
   home.js — Pantalla de inicio: una tarjeta por obra de OBRAS.

   Las tarjetas se pintan de inmediato; los datos (avance, fechas,
   actividades) se leen del XML de cada obra en segundo plano.
   ================================================================ */

(function () {
  'use strict';

  const ICONOS = {
    amenidades: `
      <svg viewBox="0 0 160 96" aria-hidden="true">
        <path d="M18 60 V34 a16 16 0 0 1 32 0 V60" />
        <path d="M54 60 V34 a16 16 0 0 1 32 0 V60" />
        <path d="M12 26 H92" />
        <rect x="8" y="64" width="144" height="26" rx="5" />
        <path class="ola" d="M18 74 q7 -5 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0" />
        <path class="ola" d="M18 82 q7 -5 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0" />
        <path d="M122 70 V44 a6 6 0 0 1 12 0 M134 70 V44 a6 6 0 0 1 12 0 M122 52 H134 M122 61 H134" />
        <circle class="sol" cx="128" cy="18" r="9" />
      </svg>`,
    casas: `
      <svg viewBox="0 0 160 96" aria-hidden="true">
        <path d="M4 88 H156" />
        <path d="M8 54 L30 36 L52 54" /><path d="M12 51 V88 H48 V51" />
        <rect x="25" y="70" width="10" height="18" /><rect x="16" y="58" width="8" height="8" />
        <path d="M56 40 L80 18 L104 40" /><path d="M60 37 V88 H100 V37" />
        <rect x="74" y="68" width="12" height="20" /><rect x="66" y="46" width="9" height="9" /><rect x="85" y="46" width="9" height="9" />
        <path d="M108 54 L130 36 L152 54" /><path d="M112 51 V88 H148 V51" />
        <rect x="125" y="70" width="10" height="18" /><rect x="136" y="58" width="8" height="8" />
        <path class="sol" d="M80 4 V9 M66 9 l3 3 M94 9 l-3 3" />
      </svg>`,
    edificio: `
      <svg viewBox="0 0 160 96" aria-hidden="true">
        <path d="M4 88 H156" /><rect x="50" y="14" width="60" height="74" />
        <path d="M60 26 H100 M60 38 H100 M60 50 H100 M60 62 H100 M60 74 H100" />
      </svg>`
  };

  const fmt = (d) => {
    if (!d) return '—';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  };

  function tarjeta(obra) {
    const a = document.createElement('a');
    a.className = 'obra-card is-loading';
    a.href = `programa.html?obra=${encodeURIComponent(obra.id)}`;
    a.dataset.obra = obra.id;
    a.innerHTML = `
      <div class="obra-visual icono-${obra.icono}">
        ${ICONOS[obra.icono] || ICONOS.edificio}
        <span class="obra-estado" data-campo="estado">Cargando…</span>
      </div>
      <div class="obra-body">
        <div class="obra-titulos">
          <h2 class="obra-nombre"></h2>
          <p class="obra-sub"></p>
        </div>
        <div class="obra-avance">
          <div class="avance-top">
            <span class="avance-label">Avance real</span>
            <span class="avance-valor" data-campo="avance">—</span>
          </div>
          <div class="avance-barra"><span data-campo="barra"></span></div>
        </div>
        <dl class="obra-datos">
          <div><dt>Inicio</dt><dd data-campo="inicio">—</dd></div>
          <div><dt>Fin</dt><dd data-campo="fin">—</dd></div>
          <div><dt>Actividades</dt><dd data-campo="actividades">—</dd></div>
        </dl>
        <span class="obra-cta">Ver programa <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14m-6-6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>`;
    a.querySelector('.obra-nombre').textContent = obra.nombre;
    a.querySelector('.obra-sub').textContent = obra.subtitulo;
    return a;
  }

  function estadoObra(proyecto, rango, avance) {
    const hoy = new Date();
    if (avance >= 100) return 'Terminada';
    if (rango && hoy < rango.start) return 'Por iniciar';
    return 'En proceso';
  }

  async function cargarDatos(obra, card) {
    const set = (campo, valor) => { const el = card.querySelector(`[data-campo="${campo}"]`); if (el) el.textContent = valor; };
    try {
      const res = await fetch(obra.xml, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML mal formado');
      const p = parseProject(doc);
      const rango = projectDateRange(p.tasksFlat);
      const avance = p.percentComplete != null ? p.percentComplete
        : (p.tasksTree[0] ? p.tasksTree[0].percentComplete : 0);
      const hojas = p.tasksFlat.filter((t) => !t.isSummary && !t.isMilestone);
      const terminadas = hojas.filter((t) => t.percentComplete >= 100).length;

      set('avance', `${avance}%`);
      card.querySelector('[data-campo="barra"]').style.width = `${avance}%`;
      set('inicio', fmt(rango ? rango.start : p.start));
      set('fin', fmt(rango ? rango.finish : p.finish));
      set('actividades', terminadas ? `${terminadas} / ${hojas.length}` : `${hojas.length}`);
      card.querySelector('[data-campo="actividades"]').title = terminadas
        ? `${terminadas} terminadas de ${hojas.length}` : `${hojas.length} actividades`;
      set('estado', estadoObra(p, rango, avance));
    } catch (e) {
      set('estado', 'Sin datos');
    } finally {
      card.classList.remove('is-loading');
    }
  }

  function arrancar() {
    const cont = document.getElementById('obras');
    OBRAS.forEach((obra, i) => {
      const card = tarjeta(obra);
      card.style.setProperty('--i', i);
      cont.appendChild(card);
      cargarDatos(obra, card);
    });
  }

  document.addEventListener('DOMContentLoaded', arrancar);
})();
