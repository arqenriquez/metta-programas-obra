# Manual de actualización · Programas de Obra Metta

## 1. Actualizar el programa de una obra (lo normal, cada semana)

1. Abre el `.mpp` de la obra en MS Project.
2. Captura el avance (% completado) de las tareas.
3. **Proyecto → Información del proyecto → Fecha de estado**: pon la fecha de corte.
   El visor dibuja la línea roja ahí y calcula el semáforo contra esa fecha.
4. **Archivo → Guardar como → tipo "XML (*.xml)"**.
5. Guárdalo en la carpeta `data/` de este proyecto **con el nombre exacto** que ya tiene:
   - Lander → `data/lander.xml`
   - Altozano → `data/altozano.xml`

   (Reemplaza el archivo anterior.)
6. *(Opcional)* Revísalo antes de publicar: en el visor, botón ⤒ (arriba a la derecha)
   → elige el XML nuevo. Aparece una franja amarilla "Vista previa local": solo lo ves tú.
7. Publica:

```bash
git add data
```

```bash
git commit -m "Actualiza programa Lander AAAA-MM-DD"
```

```bash
git push
```

En 30–60 segundos Vercel publica la versión nueva. No hace falta borrar caché:
`vercel.json` ya lo desactiva para `data/`.

## 2. Agregar una obra nueva

1. Exporta su XML y guárdalo en `data/` con un nombre corto sin espacios ni acentos
   (ej. `data/pasadena.xml`).
2. Abre `js/obras.js` y agrega un bloque:

```js
{
  id: 'pasadena',
  nombre: 'PASADENA',
  subtitulo: 'Residencia · Obra negra',
  xml: 'data/pasadena.xml',
  icono: 'casas',           // 'amenidades' | 'casas' | 'edificio'
  vistaInicial: 'desglose'  // 'desglose' | 'resumen'
},
```

3. `git add .` → `git commit -m "Agrega obra Pasadena"` → `git push`.
   La tarjeta aparece sola en la pantalla de inicio.

## 3. Retirar una obra

Borra su bloque en `js/obras.js` (y si quieres, su XML en `data/`), luego commit y push.

## Notas

- El visor **no lee `.mpp`**, solo el XML. Si arrastras un `.mpp`, te lo indica.
- El nombre que aparece en pantalla sale de `js/obras.js`, no del XML.
- El avance general de la tarjeta es el % completado del proyecto (tarea resumen del
  proyecto en MS Project).
- Mientras una tarea tenga 0 % y su inicio ya pasó la fecha de corte, sale en naranja
  ("Debió iniciar"). Es el comportamiento esperado.
