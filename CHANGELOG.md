# CHANGELOG — DESENREDA

## 6.3.0 — Estabilización funcional y UX

### Fechas, agenda y planificación
- Se separan explícitamente fecha/hora límite (`dueDate`, `dueTime`) y fecha/hora programada (`scheduledDate`, `scheduledTime`).
- Crear una actividad desde el calendario establece el día de agenda, no una fecha límite.
- Una actividad aparece en el calendario tanto en su día programado como en su día de vencimiento, cuando son diferentes.
- La hora que se muestra depende del tipo de evento del día seleccionado.
- Se validan fechas reales, horas válidas, orden entre programación y vencimiento y duración frente a la hora límite.
- Las tareas con día programado pero sin hora pueden recibir un bloque horario del organizador semanal sin cambiar el día elegido.
- El organizador usa solo bloques programados como ocupación y respeta la hora límite de cada tarea.

### Resumen, agenda y recordatorios
- El resumen diario se calcula con actividades programadas o con vencimiento hoy y tareas completadas hoy; deja de mezclar todo el histórico.
- Agenda y vencimientos generan recordatorios independientes y claramente etiquetados.
- Las claves de recordatorio distinguen tipo, fecha y hora para evitar duplicados incorrectos.
- Los vencimientos atrasados se limitan a una ventana de 14 días para que no saturen el centro de notificaciones.
- En navegadores compatibles, las notificaciones se muestran mediante `ServiceWorkerRegistration.showNotification`, con fallback a `Notification`.
- Al tocar una notificación, el Service Worker enfoca la aplicación o abre la vista Mi día y la tarea correspondiente.
- El planificador de avisos sigue ejecutándose mientras DESENREDA está abierto; no se presenta como push de fondo.

### Datos, respaldos y sincronización
- Los respaldos incluyen historial local del asistente y preferencias de tema, vista de tareas y concentración.
- La importación sanea fechas imposibles, horas inválidas y combinaciones incoherentes.
- Firestore utiliza transacciones para combinar cambios en lugar de reemplazar el documento completo sin conciliación.
- Se incorporan versiones por registro (`modifiedAt`) y tombstones de eliminación para que un registro borrado no reaparezca desde un dispositivo desactualizado.
- Se protege el estado local frente a respuestas de sincronización que terminen después de una edición más reciente.

### Asistente local
- Se amplía el contexto opcional con tareas, horarios, planes, hitos e ideas guardadas.
- Se corrigen intenciones sensibles a tildes y el orden de detección entre ideas, estudio, proyectos y compras.
- Se agregan respuestas contextuales para tareas de mañana, ideas guardadas y planes activos.
- Se elimina una función de resumen de contexto que no se utilizaba.

### UX, accesibilidad y correcciones
- El dashboard se actualiza al volver a Inicio y cuando se crea, adapta o modifica un plan.
- Se mejora el contraste de etiquetas, metadatos, prioridades y textos secundarios.
- Se reduce la altura del historial del chat en móvil para mantener visible el compositor de mensajes.
- Se ocultan las barras de desplazamiento decorativas de las sugerencias horizontales sin quitar el gesto de deslizamiento.
- Se elimina el registro duplicado del Service Worker en HTML; `app.js` queda como único responsable.
- Se actualiza la caché PWA a `desenreda-shell-v22`.

### Pruebas
- `npm test` ahora incluye validación de fechas, pruebas de fusión/tombstones, simulador y servidor.
- Se realizaron pruebas de navegador en 64 combinaciones de 8 vistas y 8 anchos, sin desbordamiento horizontal ni errores de consola.
