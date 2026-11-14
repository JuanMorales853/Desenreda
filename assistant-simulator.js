/* DESENREDA 6.3 — Conversational simulation engine (offline, deterministic).
 * This is NOT a generative model. It uses local patterns, curated replies and
 * optional local app context. No network requests or external APIs.
 */
(() => {
  "use strict";

  const normal = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const has = (value, ...patterns) => patterns.some(pattern => pattern.test(value));
  const clean = value => String(value ?? "").replace(/[<>]/g, "").trim().slice(0, 120);
  const choose = (options, index) => options[Math.abs(index) % options.length];
  const go = (view, label) => ({ type: "view", view, label });
  const ask = (label, prompt) => ({ label, prompt });
  const base = (reply, intent, actions = [], followUps = []) => ({ reply, intent, actions, followUps });
  const priorityScore = item => ({ high: 0, medium: 1, low: 2 })[item.priority] ?? 1;
  const compareTasks = (a, b) => {
    const aDate = a.dueDate || a.scheduledDate || "9999-12-31";
    const bDate = b.dueDate || b.scheduledDate || "9999-12-31";
    return aDate.localeCompare(bDate) || priorityScore(a) - priorityScore(b);
  };


  function respond(raw, context = null, history = []) {
    const message = normal(raw);
    const round = Array.isArray(history) ? history.filter(item => item.role === "user").length : 0;
    const tasks = Array.isArray(context?.pendingTasks) ? [...context.pendingTasks].sort(compareTasks) : null;
    const plans = Array.isArray(context?.activePlans) ? context.activePlans : null;
    const savedIdeas = Array.isArray(context?.savedIdeas) ? context.savedIdeas : null;

    if (!message) return base("Escribe algo que te gustaría organizar y comenzaré por ahí.", "empty", [], [ask("Ayúdame a empezar", "No sé por dónde empezar")]);

    // Explicit task requests lead to a confirmation button; never silently mutate data.
    const taskMatch = raw.match(/(?:crea|crear|agrega|agregar|anota|añade|anade|registrar|registra|apunta)(?:me)?\s+(?:(?:una?|la)\s+)?tarea\s*(?:de|para|:|que\s+diga)?\s*["“]?([^\n.!?]{4,120})/i);
    if (taskMatch && clean(taskMatch[1])) {
      const title = clean(taskMatch[1]).replace(/["”]+$/, "");
      return base(`Puedo añadir «${title}» a tu lista.\n\nConfirma con el botón de abajo para crearla. No cambiaré tus tareas sin que lo autorices.`, "create-task", [
        { type: "task", title, label: "＋ Añadir a Mi día" }, go("tasks", "Ver mis tareas")
      ], [ask("¿Qué hago después?", "¿Cómo puedo priorizar mis tareas?")]);
    }

    // Contextual follow-up: a concise affirmative or request for more detail.
    if (has(message, /^(otra|otra idea|dame otra|otra opcion|mas ideas|otra sugerencia|continu[aúe]|dime mas|amplia|como lo hago|y despues|si|sí)$/)) {
      const last = [...history].reverse().find(item => item.role === "user" && !has(normal(item.content), /^(si|sí|otra|dime mas|como lo hago)$/));
      if (last) {
        const next = respond(last.content, context, history);
        return { ...next, reply: `Claro, veamos otra forma de abordarlo.\n\n${next.reply}`, intent: "follow-up" };
      }
      return base("Podemos profundizar. Dime si hablamos de tus tareas, un objetivo, una decisión o ideas para tu tiempo libre.", "follow-up", [go("ideas", "Explorar ideas")]);
    }

    if (has(message, /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|holi|saludos)(\b|[!.])/, /quien eres|que puedes hacer|como funcionas|eres una ia|eres real/)) {
      return base(`¡Hola! Soy el asistente de demostración de DESENREDA ✦\n\nPuedo orientarte con respuestas preparadas sobre organización, estudio, decisiones, bienestar, presupuestos y objetivos. También puedo darte sugerencias a partir de tus tareas cuando actives el contexto local.\n\nNo soy una IA generativa y no necesito internet. ¿Qué quieres resolver hoy?`, "welcome", [go("tasks", "Mis tareas"), go("ideas", "Buscar ideas")], [ask("Quiero organizar mi día", "Ayúdame a organizar mi día"), ask("Tengo un objetivo", "Ayúdame a dividir un objetivo")]);
    }

    if (has(message, /ideas guardadas|mis ideas|ideas favoritas|que ideas tengo/)) {
      if (!savedIdeas) return base("Puedo revisar tu colección de ideas si activas «Usar mi contexto local». Tus ideas permanecen en este dispositivo y no se envían a ningún servidor.", "saved-ideas", [go("ideas", "Abrir mi colección")]);
      if (!savedIdeas.length) return base("Todavía no tienes ideas guardadas. Puedes generar propuestas, abrir su detalle y guardar las que quieras explorar después.", "saved-ideas", [go("ideas", "Generar ideas")]);
      return base(`Estas son algunas ideas que guardaste:\n\n${savedIdeas.slice(0, 8).map((idea, index) => `${index + 1}. ${clean(idea.title)}`).join("\n")}\n\nPuedes abrir tu colección para filtrarlas por categoría o convertir una en tarea.`, "saved-ideas", [go("ideas", "Ver colección de ideas")]);
    }

    if (has(message, /planes activos|mis planes|que planes tengo|objetivos activos/)) {
      if (!plans) return base("Activa «Usar mi contexto local» para consultar los nombres y avances de tus planes guardados.", "plans-summary", [go("plans", "Abrir mis planes")]);
      if (!plans.length) return base("No tienes planes activos por ahora. Puedes crear uno y dividirlo en hitos pequeños.", "plans-summary", [go("plans", "Crear un plan")]);
      return base(`Estos son tus planes activos:\n\n${plans.slice(0, 8).map((plan, index) => { const total = plan.steps?.length || 0; const done = (plan.steps || []).filter(step => step.completed).length; return `${index + 1}. ${clean(plan.goal)} · ${done}/${total} hitos`; }).join("\n")}\n\nAbre Mis planes para marcar avances o adaptar el tiempo diario.`, "plans-summary", [go("plans", "Ver mis planes")]);
    }

    if (has(message, /manana|dia siguiente|proximo dia/) && has(message, /que hago|que tengo|tareas|pendientes|agenda|organizar/)) {
      if (!tasks) return base("Para decirte qué tienes mañana, activa «Usar mi contexto local». Puedo revisar las tareas que vencen o están programadas para ese día.", "tomorrow", [go("calendar", "Abrir agenda"), go("tasks", "Ver tareas")]);
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      const items = tasks.filter(task => task.scheduledDate === iso || task.dueDate === iso);
      if (!items.length) return base("No veo tareas pendientes para mañana en tu espacio local. Puedes aprovechar para adelantar algo o reservar un bloque de descanso.", "tomorrow", [go("calendar", "Ver agenda de mañana"), go("tasks", "Añadir una tarea")]);
      return base(`Para mañana tienes estas actividades:\n\n${items.slice(0, 8).map((task, index) => `${index + 1}. ${clean(task.title)}${task.scheduledTime ? ` · ${task.scheduledTime}` : ""}${task.dueDate === iso ? " · vence mañana" : ""}`).join("\n")}\n\nDeja un margen entre actividades y revisa primero las que tienen hora programada.`, "tomorrow", [go("calendar", "Abrir agenda"), go("tasks", "Ver pendientes")]);
    }

    if (!has(message, /priori|urgente|importante primero/) && has(message, /mis tareas|tareas de hoy|que tareas tengo|que tengo pendiente|que debo hacer hoy|resumen de mi dia|cuantas tareas|que tengo para hacer/)) {
      if (!tasks) return base("Puedo ayudarte a revisar tus pendientes. Activa «Usar mi contexto local» en este chat para que consulte las tareas guardadas, sin compartirlas con ningún servidor. También puedes abrir Mi día directamente.", "tasks-summary", [go("tasks", "Abrir Mi día")]);
      if (!tasks.length) return base("¡Tu lista está despejada! No encontré tareas pendientes. Puedes crear una tarea pequeña para avanzar en lo que te importa o aprovechar para descansar.", "tasks-summary", [go("tasks", "Crear una tarea"), go("ideas", "Explorar ideas")]);
      const lines = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${clean(t.title)}${t.scheduledDate ? ` · agenda ${t.scheduledDate}${t.scheduledTime ? ` ${t.scheduledTime}` : ""}` : t.dueDate ? ` · vence ${t.dueDate}` : ""}`).join("\n");
      return base(`Tienes ${tasks.length} pendiente(s). Los primeros por fecha y prioridad son:\n\n${lines}\n\nElige uno y dedica 20–25 minutos a empezar. No es necesario terminar toda la lista de una vez.`, "tasks-summary", [go("tasks", "Revisar lista"), go("calendar", "Abrir agenda")], [ask("¿Cuál hago primero?", "Ayúdame a priorizar mis tareas")]);
    }

    if (has(message, /priori|urgente|importante primero|por donde empiezo|por d[oó]nde empezar|demasiados pendientes|muchas cosas|sobrecarga/)) {
      if (tasks && tasks.length) {
        const top = tasks[0];
        return base(`Vamos a reducir el ruido. Te recomiendo empezar por «${clean(top.title)}»${top.dueDate ? ` (vence ${top.dueDate})` : top.scheduledDate ? ` (programada ${top.scheduledDate}${top.scheduledTime ? ` a las ${top.scheduledTime}` : ""})` : ""}.\n\n1. Reserva 20 minutos para esa tarea.\n2. Divide su primer paso en algo que puedas completar hoy.\n3. Después revisa tu siguiente pendiente.\n\nCon el contexto local veo ${tasks.length} tarea(s) pendientes; prioricé las más próximas a vencer y luego su nivel de importancia.`, "priorities", [go("tasks", "Ver mis pendientes"), go("focus", "Empezar concentración")], [ask("Organiza mi semana", "Ayúdame a organizar mi semana")]);
      }
      return base(choose([
        "Te propongo el método 1–2–3:\n\n1. Escribe lo que te preocupa.\n2. Señala una única tarea urgente y dos importantes.\n3. Trabaja 20 minutos en la urgente antes de revisar lo demás.\n\nSi activas tu contexto local, puedo señalar tareas concretas de tu lista.",
        "Prueba esta secuencia:\n\n1. Elimina o pospone lo que no sea necesario hoy.\n2. Identifica el pendiente con fecha más cercana.\n3. Haz su primer paso durante 15 minutos.\n\nPuedes usar el tablero Kanban para ver tu avance."
      ], round), "priorities", [go("tasks", "Abrir tablero"), go("focus", "Iniciar enfoque")], [ask("Tengo poco tiempo", "Solo tengo 30 minutos, ¿cómo me organizo?")]);
    }

    if (has(message, /idea|creativ|inspir|aburr|tiempo libre|actividad|regalo|sorprend/)) {
      return base(choose([
        "Aquí tienes tres ideas sencillas:\n\n✦ Prueba un reto de 20 minutos para aprender algo nuevo.\n✦ Prepara una actividad económica con lo que tienes en casa.\n✦ Anota cinco ideas y selecciona la más fácil de empezar.\n\nEn «Ideas» puedes ajustar categoría, presupuesto y tiempo para encontrar opciones más específicas.",
        "Si necesitas inspiración, cambia una sola variable:\n\n• Lugar: casa, exterior o espacio de estudio.\n• Tiempo: 15, 30 o 60 minutos.\n• Presupuesto: gratis o bajo costo.\n\nGenera propuestas con esos límites y guarda la que más te interese."
      ], round), "ideas", [go("ideas", "Generar más ideas")], [ask("Otra idea", "Dame otra idea")]);
    }


    if (has(message, /estudi|examen|parcial|universidad|clase|aprender|tarea escolar|materia/)) {
      return base(choose([
        "Para estudiar con más intención:\n\n1. Divide el tema en tres conceptos.\n2. Estudia 25 minutos sin distracciones.\n3. Cierra apuntes y responde preguntas de memoria.\n4. Anota lo que aún no dominas y repásalo mañana.\n\nSi tienes examen pronto, prioriza ejercicios y simulacros antes que releer todo.",
        "Prueba una sesión de aprendizaje activo:\n\n• 10 min: repasa lo esencial.\n• 20 min: resuelve ejercicios o preguntas.\n• 10 min: explica el tema en tus palabras.\n• 5 min: registra errores.\n\nRepite el bloque con el tema más difícil."
      ], round), "study", [go("focus", "Temporizador de estudio"), go("plans", "Crear plan de estudio")], [ask("Prepárame un horario", "Quiero un horario para estudiar esta semana")]);
    }

    if (has(message, /decid|decision|elegir|opcion|alternativa|que me conviene|pros y contras|comparar/)) {
      return base("Para decidir con claridad, usa cuatro preguntas:\n\n1. ¿Cuáles son tus opciones reales?\n2. ¿Qué criterios importan (costo, tiempo, utilidad)?\n3. ¿Qué peso tiene cada criterio?\n4. ¿Qué sacrificios estás dispuesto a aceptar?\n\nEn «Decisiones» puedes puntuar alternativas y comparar sus resultados. La herramienta guía tu reflexión, pero la elección sigue siendo tuya.", "decisions", [go("decisions", "Comparar opciones")], [ask("Tengo un presupuesto", "Ayúdame a elegir con un presupuesto limitado")]);
    }

    if (has(message, /lista de compras|mercado|supermercado|compras del mes|hacer la compra/)) {
      return base("Para planear tus compras:\n\n1. Revisa lo que ya tienes en casa.\n2. Escribe lo que falta por categorías.\n3. Establece un presupuesto máximo.\n4. Prioriza básicos antes que extras.\n\nPuedes guardar cada pendiente importante en Mi día para marcarlo al comprar.", "shopping", [go("tasks", "Organizar lista"), go("decisions", "Comparar alternativas")]);
    }


    if (has(message, /presupuesto|dinero|gastar|ahorrar|finanzas|costo|comprar|econom/)) {
      return base("Para tomar decisiones con dinero:\n\n1. Define cuánto puedes gastar sin afectar gastos esenciales.\n2. Separa lo necesario de lo deseable.\n3. Compara al menos dos alternativas por costo total y utilidad.\n4. Reserva un margen para imprevistos.\n\nSi me dices tu presupuesto y objetivo, puedo proponerte un esquema orientativo con categorías; no tengo acceso a tus cuentas.", "budget", [go("decisions", "Comparar alternativas"), go("plans", "Crear una meta")], [ask("Quiero ahorrar", "Dame ideas para ahorrar dinero esta semana")]);
    }



    if (has(message, /plan|objetivo|meta|proyecto|paso a paso|divid|lograr|alcanzar/)) {
      const planLine = plans && plans.length ? `\n\nYa tienes ${plans.length} plan(es) activo(s). Puedes revisar sus hitos en Mis planes.` : "";
      return base(`Convierte ese objetivo en una ruta alcanzable:\n\n1. Define un resultado concreto y una fecha realista.\n2. Escribe entre 3 y 5 hitos verificables.\n3. Reserva un pequeño bloque cada día o semana.\n4. Revisa avances y ajusta el ritmo si cambian tus condiciones.${planLine}\n\nPuedes crear el plan y marcar cada paso en DESENREDA.`, "plans", [go("plans", "Crear o revisar plan"), go("calendar", "Ver calendario")], [ask("Tengo poco tiempo", "¿Cómo logro mi meta si tengo poco tiempo?")]);
    }

    if (!has(message, /idea|creativ|inspir|aburr|tiempo libre|actividad|regalo|sorprend/) && has(message, /semana|agenda|horario|tiempo|organizar mi dia|organizar el dia|manana|calendario|planifica/)) {
      return base(choose([
        "Organiza tu día con tres bloques:\n\n• Primero: una tarea importante (25–45 min).\n• Después: pendientes pequeños agrupados (20 min).\n• Al final: repaso y preparación de mañana (10 min).\n\nDeja márgenes libres para imprevistos. En la agenda puedes ver tus actividades y usar el organizador semanal automático.",
        "Para ordenar tu semana:\n\n1. Agrupa los pendientes por prioridad.\n2. Coloca primero los que tienen fechas próximas.\n3. Reserva pausas entre actividades.\n4. Evita llenar más del 80 % de tu tiempo.\n\nPuedes usar «Organizar mis pendientes» para asignar bloques disponibles."
      ], round), "time", [go("calendar", "Abrir agenda"), go("assistant", "Planificador automático")], [ask("Quiero concentrarme", "¿Cómo puedo concentrarme mejor?")]);
    }


    if (has(message, /comida|receta|almuerzo|desayuno|cena|cocinar|hambre/)) {
      return base("Si quieres resolver una comida sin complicarte:\n\n1. Mira qué ingredientes ya tienes.\n2. Elige una base (arroz, pasta, papa o legumbres).\n3. Combina con proteína y vegetales disponibles.\n4. Ajusta el tamaño de porción a tus necesidades.\n\nEn el generador de ideas encontrarás alternativas para comidas con tiempo y presupuesto definidos.", "food", [go("ideas", "Ideas para comidas")]);
    }

    if (has(message, /h[aá]bito|rutina|bienestar|cansad|estres|ansios|agotad|descans|salud|motiv/)) {
      return base("Cuando todo pesa demasiado, empieza por lo pequeño:\n\n1. Haz una pausa breve y toma agua.\n2. Escribe qué es realmente necesario hoy.\n3. Elige una tarea de menos de 15 minutos.\n4. Reserva un descanso sin culpa.\n\nSi quieres crear una rutina sostenible, comienza con un hábito sencillo y una hora de referencia. Si el malestar es intenso o persistente, busca apoyo profesional.", "wellbeing", [go("focus", "Tomar una pausa"), go("plans", "Crear hábito")]);
    }

    if (has(message, /concentr|distracc|procrast|pomodoro|enfoque|productiv/)) {
      return base("Prueba este protocolo de concentración:\n\n1. Define una tarea concreta.\n2. Aleja notificaciones y abre un temporizador de 25 minutos.\n3. Trabaja hasta que suene, sin cambiar de actividad.\n4. Descansa cinco minutos antes del siguiente bloque.\n\nSi te cuesta empezar, comienza con cinco minutos: lo importante es activar el movimiento.", "focus", [go("focus", "Iniciar temporizador"), go("tasks", "Elegir tarea")]);
    }

    if (has(message, /viaj|vacacion|itinerario|turismo|paseo|escapada/)) {
      return base("Para organizar un viaje sin estrés:\n\n1. Define destino, fechas y presupuesto máximo.\n2. Separa transporte, alojamiento, comida y actividades.\n3. Reserva espacios libres en el itinerario.\n4. Prepara documentos y una lista de cosas indispensables.\n\nPuedes crear un plan por hitos y registrar preparativos en Mi día.", "travel", [go("plans", "Crear plan de viaje"), go("tasks", "Lista de preparativos")]);
    }

    if (has(message, /limpiar|ordenar mi casa|organizar mi casa|aseo|hogar|habitacion|cuarto desordenado/)) {
      return base("Cuando la casa se siente desordenada, empieza por zonas:\n\n1. Elige una superficie pequeña.\n2. Recoge lo que no pertenece allí.\n3. Dedica 15 minutos a limpiar y ordenar.\n4. Programa otra zona para mañana, si hace falta.\n\nLa meta es avanzar sin intentar hacerlo todo en una sola sesión.", "home", [go("tasks", "Crear tareas del hogar"), go("focus", "Temporizador de 15 min")]);
    }


    if (has(message, /reunion|oficina|trabajo|empleo|jefe|clientes|entrega laboral/)) {
      return base("Para avanzar con tu trabajo:\n\n1. Define el resultado que debes entregar.\n2. Identifica dependencias y fechas importantes.\n3. Elige una tarea de máximo 30 minutos para empezar.\n4. Revisa lo pendiente antes de finalizar la jornada.\n\nSi el proyecto tiene varias etapas, conviértelo en un plan con hitos verificables.", "work", [go("tasks", "Ver tareas de trabajo"), go("plans", "Crear plan de proyecto")]);
    }

    if (has(message, /gracias|perfecto|genial|bien|excelente|listo/)) {
      return base("¡Con gusto! ✦ Me alegra que te sirva. Cuando necesites ordenar algo más, escríbeme: tareas, ideas, objetivos o decisiones.", "thanks", [], [ask("Organizar mi día", "Ayúdame a organizar mi día")]);
    }

    return base(`Entiendo que quieres avanzar con «${clean(raw).slice(0, 80)}».\n\nPara ayudarte a convertirlo en algo manejable, te propongo:\n\n1. Escribir exactamente qué quieres conseguir.\n2. Identificar qué te falta y qué puedes hacer hoy.\n3. Elegir un primer paso de 15 minutos.\n\nPuedo guiarte mejor si me dices si se trata de tareas, estudio, ideas, una decisión o un objetivo.`, "general", [go("tasks", "Organizar tareas"), go("ideas", "Explorar ideas"), go("plans", "Crear plan")], [ask("Necesito priorizar", "Ayúdame a priorizar mis tareas")]);
  }

  const simulator = Object.freeze({ respond, normalize: normal, version: "6.3" });
  globalThis.DESENREDA_SIMULATOR = simulator;
})();
