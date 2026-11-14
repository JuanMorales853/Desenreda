# QA REPORT — DESENREDA 6.3.0

## Alcance
Se revisó el ZIP DESENREDA 6.2 entregado por el usuario y se corrigieron sus problemas sobre la misma base, publicada como DESENREDA 6.3. La versión mantiene el asistente simulado local; no se conectó una IA generativa.

## Hallazgos corregidos

| Hallazgo | Corrección |
|---|---|
| Fecha límite y horario de agenda se confundían | Campos separados y validación semántica |
| El calendario mostraba una tarea solo en una de sus fechas | La actividad aparece tanto en el día programado como en el vencimiento |
| El organizador excluía tareas con hora límite y trataba `dueTime` como ocupación | Solo las horas programadas ocupan bloques; la fecha/hora límite restringe el final del bloque |
| Tareas con fecha programada pero sin hora no recibían bloque | El organizador conserva el día y asigna solo la hora faltante |
| El resumen diario mezclaba métricas históricas | Se calcula sobre actividades de hoy y finalizaciones de hoy |
| Agenda y vencimiento no se distinguían en recordatorios | Entradas independientes con etiqueta, fecha y hora |
| Fechas imposibles podían entrar por importación | Saneamiento estricto de fecha/hora y relaciones entre campos |
| Respaldo incompleto | Se incluyen conversación local y preferencias relevantes |
| Firebase podía perder ediciones concurrentes o resucitar elementos eliminados | Transacciones, merge por `modifiedAt`, tombstones y conciliación de estado local más reciente |
| El dashboard no reflejaba inmediatamente un plan recién creado | Actualización de tarjetas del dashboard al modificar planes y al volver a Inicio |
| Preguntas del asistente no consultaban ideas/planes guardados | Contexto local opcional y respuestas específicas |
| Contraste insuficiente y compositor móvil fuera de vista | Colores secundarios más oscuros, chat móvil más compacto y controles visibles |
| Service Worker registrado desde dos lugares | Registro único desde `app.js` |

## Pruebas automatizadas

Comando ejecutado: `npm test`.

- Sintaxis de `app.js`, `assistant-simulator.js` y `server.mjs`.
- Estructura HTML, identificadores, vistas, versión y modo local del asistente.
- Fechas imposibles, horas inválidas, programación posterior al vencimiento, duración superior a la hora límite y horario válido.
- Fusión de registros entre dispositivos, conservación de registros remotos, tombstones y edición local durante una transacción en curso.
- 25 pruebas de intenciones del asistente, privacidad del contexto, ideas guardadas, planes activos, consulta de mañana, creación confirmada y seguimiento.
- 8 comprobaciones HTTP del servidor: health, assets, modo IA deshabilitado, rutas privadas, traversal, URL malformada, HEAD y disponibilidad.

## Pruebas de navegador

Se ejecutó Chromium sobre la aplicación local y se verificaron:

1. Resumen diario con actividades de hoy y finalizaciones reales.
2. Creación de una tarea con fecha límite y programación independientes.
3. Rechazo de programación posterior a la fecha límite sin borrar el formulario.
4. Acción «Añadir desde calendario» rellenando `scheduledDate`, no `dueDate`.
5. Una misma tarea visible en el día programado y en el día de vencimiento.
6. Recordatorios separados para agenda y vencimiento.
7. Organizador semanal que asigna hora a tareas de día elegido y respeta el vencimiento.
8. Contexto local del asistente para ideas y planes guardados.
9. Importación de respaldo con fechas imposibles: las fechas y horas inválidas quedan vacías.
10. Restauración de historial de conversación desde respaldo.
11. Selección de días fuera del mes visible sin reiniciar la selección.
12. Dashboard actualizado al crear un plan.
13. La misma tarea aparece en el día de agenda y en su día de vencimiento.
14. Matriz responsive de 8 vistas por 8 anchos: 320, 360, 375, 390, 430, 768, 1024 y 1440 px.

**Resultado de navegador:** 64 combinaciones responsive, 0 desbordamientos horizontales y 0 excepciones/errores de consola durante el recorrido.

## Evidencia visual
Las capturas nuevas están en `previews/`:
- `01-inicio-desktop.png`
- `02-asistente-desktop.png`
- `03-asistente-mobile.png`
- `04-crear-tarea-desktop.png`
- `05-agenda-desktop.png`
- `06-inicio-mobile.png`

## Límites de verificación
- No se conectó una cuenta Firebase real; la conciliación de estados se probó con pruebas unitarias del algoritmo, no con dos dispositivos autenticados en producción.
- Las notificaciones del navegador requieren permiso. El planificador local revisa vencimientos mientras la aplicación está abierta; el Service Worker muestra el aviso y gestiona el clic, pero no se implementó un servicio push de fondo ni un servidor de tareas programadas.
- El asistente sigue siendo un simulador local de respuestas preparadas; no es IA generativa.
- No se hizo una auditoría WCAG completa con lector de pantalla físico; se corrigieron contrastes y estados de foco detectados en la inspección.
