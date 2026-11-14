# DESENREDA 6.3 — Estabilización

Aplicación web responsive para organizar tareas, agenda, ideas, decisiones, planes y concentración. Incluye un asistente conversacional simulado que funciona localmente sin conexión a una API de IA.

## Requisitos
- Node.js 20 o superior para ejecutar el servidor incluido.
- Navegador moderno.

## Ejecutar
1. Descomprime el ZIP.
2. Abre la carpeta `DESENREDA_6.3` en Visual Studio Code.
3. Ejecuta `npm start`.
4. Abre `http://localhost:4173`.

También puedes abrir `index.html` con Live Server para utilizar las funciones locales. Para PWA, servidor y Firebase se recomienda `localhost` o HTTPS.

## Funciones
- Inicio con métricas diarias reales, planes, ideas, agenda y recordatorios.
- Mi día con lista y tablero Kanban.
- Calendario semanal y mensual.
- Fecha límite independiente del día/hora programados.
- Organizador semanal que asigna bloques sin cambiar la fecha límite ni mover una fecha de agenda elegida.
- Generador y colección de ideas.
- Matriz de decisiones ponderada.
- Planes con hitos y progreso.
- Temporizador de concentración.
- Asistente local con respuestas preparadas y contexto opcional de tareas, planes e ideas.
- Exportación/importación de datos, historial local del asistente y preferencias.
- Firebase opcional con transacciones, fusión por registro y tombstones para eliminaciones.

## Fechas y agenda
- **Fecha límite / hora límite:** cuándo debe estar terminada la tarea (`dueDate`, `dueTime`).
- **Día en agenda / hora programada:** cuándo planeas realizarla (`scheduledDate`, `scheduledTime`).
- Una tarea puede aparecer en ambos días del calendario si la fecha programada y la fecha límite son distintas.
- El organizador semanal solo considera ocupados los bloques que tienen fecha y hora programadas. La hora límite actúa como restricción para que la duración no la sobrepase.

## Asistente
El asistente de esta versión es un simulador local de respuestas preparadas. No utiliza una IA generativa, no realiza peticiones externas y no necesita claves. La opción **Usar mi contexto local** está desactivada por defecto; al activarla, el simulador puede consultar localmente tareas, ideas y planes para responder de forma contextual. Esa información no se envía a internet.

## Firebase (opcional)
1. Copia `firebase-config.js` con la configuración web de tu proyecto Firebase.
2. Habilita Authentication anónimo o el proveedor de acceso que utilices.
3. Crea Firestore y publica `firestore.rules`.
4. Configura dominios autorizados y App Check para un despliegue público.

La sincronización usa transacciones y fusiona registros mediante `modifiedAt`; las eliminaciones se representan con tombstones para evitar que reaparezcan desde un dispositivo desactualizado. Aun así, prueba con dos cuentas/dispositivos reales antes de producción.

## Pruebas
```bash
npm test
```
Incluye sintaxis, estructura, reglas de fechas, fusión de estados, intenciones del asistente y pruebas HTTP del servidor. El informe detallado está en `QA_REPORT.md`.

## Estructura
```text
DESENREDA_6.3/
├── index.html
├── desenreda.css
├── app.js
├── assistant-simulator.js
├── server.mjs
├── firebase-config.js
├── firestore.rules
├── sw.js
├── manifest.webmanifest
├── scripts/
│   ├── check-project.mjs
│   ├── test-date-rules.mjs
│   ├── test-state-sync.mjs
│   ├── test-simulator.mjs
│   └── test-server.mjs
├── assets/
└── previews/
```
