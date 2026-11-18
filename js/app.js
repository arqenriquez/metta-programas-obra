/* ================================================================
   app.js — Arranque del visor (programa.html?obra=<id>).

   Única capa que conoce fetch, DOMParser y los estados de error.
   ================================================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const obra = OBRAS.find((o) => o.id === params.get('obra'));
  if (!obra) {
    // Sin obra válida en la URL: regresar a la pantalla de inicio.
    location.replace('./');
    return;
  }

  // Evita que soltar un archivo fuera de la zona navegue la pestaña al archivo.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  function mostrarEstado(cual, mensaje) {
    const paneles = {
      cargando: $('loading'),
      dropzone: $('dropzone'),
      error: $('errorPanel'),
      vacio: $('emptyState'),
      viewer: $('viewer')
    };
    const estado = Object.prototype.hasOwnProperty.call(paneles, cual) ? cual : 'error';
    Object.entries(paneles).forEach(([nombre, el]) => { if (el) el.hidden = nombre !== estado; });
    if (estado === 'error') $('errorMessage').textContent = mensaje || 'Ocurrió un problema inesperado.';
  }

  function extraerPosicion(texto) {
    const m = texto.match(/line\s*(?:number)?\s*(\d+)[^\d]*column\s*(\d+)/i);
    return m ? ` (línea ${m[1]}, columna ${m[2]})` : '';
  }

  function procesarXml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) {
      throw new Error(
        `El archivo XML está mal formado${extraerPosicion(err.textContent || '')}. ` +
        'Vuelve a exportarlo desde MS Project (Archivo → Guardar como → XML).'
      );
    }
    const proyecto = parseProject(doc);
    if (!proyecto.start || !proyecto.finish) {
      throw new Error('El XML no trae fechas de inicio o fin del proyecto.');
    }
    Gantt.setProject(proyecto, obra, { zoom: params.get('vista') });
    mostrarEstado(proyecto.tasksFlat.length ? 'viewer' : 'vacio');
  }

  function validarExtension(archivo) {
    const nombre = archivo.name || '';
    if (/\.xml$/i.test(nombre)) return null;
    if (/\.mpp$/i.test(nombre)) {
      return `"${nombre}" es el archivo de MS Project, no el XML. En MS Project ve a ` +
        'Archivo → Guardar como, elige el tipo "XML (*.xml)" y usa ese archivo.';
    }
    return `"${nombre}" no es un archivo XML exportado desde MS Project.`;
  }

  /** Vista previa local: lee un XML del equipo sin publicarlo. */
  function leerArchivo(archivo) {
    if (!archivo) return;
    const errorExtension = validarExtension(archivo);
    if (errorExtension) { mostrarEstado('error', errorExtension); return; }

    const lector = new FileReader();
    lector.onload = () => {
      try {
        mostrarEstado('cargando');
        procesarXml(lector.result);
        const aviso = $('previewBanner');
        $('previewName').textContent = archivo.name;
        aviso.hidden = false;
      } catch (e) {
        mostrarEstado('error', e.message);
      }
    };
    lector.onerror = () => mostrarEstado('error', 'No se pudo leer el archivo.');
    lector.readAsText(archivo, 'UTF-8');
  }

  function conectarCargaLocal() {
    const input = $('fileInput');
    input.addEventListener('change', (ev) => {
      leerArchivo(ev.target.files[0]);
      input.value = '';
    });
    document.querySelectorAll('[data-pick-file]').forEach((b) => b.addEventListener('click', () => input.click()));

    const zona = $('dropzone');
    ['dragenter', 'dragover'].forEach((evt) => zona.addEventListener(evt, (ev) => {
      ev.preventDefault();
      zona.classList.add('is-dragover');
    }));
    zona.addEventListener('dragleave', () => zona.classList.remove('is-dragover'));
    zona.addEventListener('drop', (ev) => {
      ev.preventDefault();
      zona.classList.remove('is-dragover');
      leerArchivo(ev.dataTransfer.files[0]);
    });

    // Soltar un XML sobre el visor ya cargado también abre la vista previa.
    $('viewer').addEventListener('drop', (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer.files[0]) leerArchivo(ev.dataTransfer.files[0]);
    });

    $('btnPreviewClose').addEventListener('click', () => location.reload());
  }

  async function arrancar() {
    document.title = `${obra.nombre} · Programa de Obra | Metta`;
    $('projectName').textContent = obra.nombre;
    $('projectSub').textContent = obra.subtitulo;

    Gantt.cachearDom();
    Gantt.conectarInteraccion();
    Gantt.conectarControles();
    conectarCargaLocal();
    mostrarEstado('cargando');

    let texto;
    try {
      const res = await fetch(obra.xml, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      texto = await res.text();
    } catch (e) {
      // Típico al abrir el HTML con doble clic (file://): se ofrece cargar el XML a mano.
      mostrarEstado('dropzone');
      return;
    }

    try {
      procesarXml(texto);
    } catch (e) {
      mostrarEstado('error', e.message);
    }
  }

  window.addEventListener('DOMContentLoaded', arrancar);
})();
