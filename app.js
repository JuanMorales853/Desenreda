(() => {
"use strict";

const firebaseConfig = window.DESENREDA_FIREBASE_CONFIG || {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};

const STORAGE_KEY = "desenreda-app-v1";
const defaultState = { tasks: [], ideas: [], plans: [], decisions: [], deletedRecords: [], updatedAt: null };
const memoryStorage = new Map();
let storageWarningShown = false;
let state = loadState();
let lastPersistedState = JSON.parse(JSON.stringify(state));
let currentTaskFilter = "open";
const storedTaskView = safeStorageGet("desenreda-task-view");
let currentTaskView = ["list", "board"].includes(storedTaskView) ? storedTaskView : "list";
let draggedKanbanTaskId = null;
let currentCalendarMode = "week";
let calendarMonthOffset = 0;
let savedIdeasFilter = "all";
let savedIdeasQuery = "";
let generatedIdeas = [];
let currentDecision = null;
let cloudDocument = null;
let cloudSaveTimer = null;
let focusTimerInterval = null;
let focusEndAt = null;
let focusSecondsRemaining = 25 * 60;
let focusTotalSeconds = 25 * 60;
let focusRunning = false;
let focusMode = "focus";
let focusSessionDate = safeStorageGet("desenreda-focus-date") || localDateISO();
let focusSessionsToday = focusSessionDate === localDateISO() ? Math.max(0, Number.parseInt(safeStorageGet("desenreda-focus-sessions") || "0", 10) || 0) : 0;
let lastIdeaFormValues = null;
let deferredInstallPrompt = null;
let calendarWeekOffset = 0;
let selectedWeekdayIndex = (new Date().getDay() + 6) % 7;
let selectedCalendarDate = localDateISO();
let firebaseConfigured = false;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseSdk = null;
let currentUser = null;
let cloudUnsubscribe = null;
let cloudReady = false;
let authMode = "login";
let localOwnerUid = safeStorageGet("desenreda-owner-uid") || "local";
let assistantMessages = loadAssistantMessages();
let reminderInterval = null;
let assistantRequestActive = false;
let assistantConversationEpoch = 0;

const q = (selector, scope = document) => scope.querySelector(selector);
const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const viewCopy = {
  dashboard: ["Inicio", "Un lugar para poner tus ideas en orden."],
  tasks: ["Mi día", "Organiza tus pendientes a tu propio ritmo."],
  calendar: ["Agenda", "Visualiza y distribuye tus tareas durante la semana."],
  ideas: ["Ideas", "Encuentra posibilidades que encajen contigo."],
  decisions: ["Decisiones", "Compara opciones con lo que realmente importa."],
  plans: ["Mis planes", "Convierte tus objetivos en pasos alcanzables."],
  focus: ["Concentración", "Reserva un momento para avanzar sin interrupciones."],
  assistant: ["Asistente virtual", "Respuestas programadas para desenredar tu día, sin conexión a IA."]
};

const ideaCatalog = {
  organizacion: [
    { title: "Haz una descarga mental de 10 minutos", description: "Escribe todo lo que ronda tu cabeza sin intentar organizarlo. Después agrupa lo que sea parecido.", time: 15, cost: 0, tag: "Claridad", icon: "✎" },
    { title: "Prepara tu semana en bloques", description: "Reserva momentos para tus prioridades, tareas pequeñas y descansos. Deja espacios libres para imprevistos.", time: 30, cost: 0, tag: "Planificación", icon: "▦" },
    { title: "Crea una zona de enfoque", description: "Ordena una superficie, deja a mano solo lo necesario y define una tarea para comenzar.", time: 15, cost: 0, tag: "Productividad", icon: "⌂" },
    { title: "Aplica la regla de los dos minutos", description: "Identifica pendientes que puedas resolver en menos de dos minutos y sácalos de tu lista.", time: 15, cost: 0, tag: "Acción", icon: "↗" },
    { title: "Diseña una rutina de cierre", description: "Dedica unos minutos al final del día para revisar avances y elegir el primer paso de mañana.", time: 15, cost: 0, tag: "Hábitos", icon: "☾" }
  ],
  estudio: [
    { title: "Estudia con bloques de enfoque", description: "Trabaja durante 25 minutos en un solo tema y descansa 5 minutos. Repite el ciclo según tu energía.", time: 30, cost: 0, tag: "Concentración", icon: "◷" },
    { title: "Convierte el tema en preguntas", description: "Cierra tus apuntes y escribe preguntas que deberías poder responder. Practica recordar, no solo releer.", time: 30, cost: 0, tag: "Aprendizaje activo", icon: "?" },
    { title: "Explica el tema en voz alta", description: "Imagina que se lo enseñas a alguien que empieza desde cero. Detecta qué partes todavía no puedes explicar.", time: 15, cost: 0, tag: "Comprensión", icon: "◉" },
    { title: "Crea un mapa de conexiones", description: "Relaciona conceptos, ejemplos y aplicaciones en una hoja. Usa flechas para mostrar cómo se conectan.", time: 30, cost: 0, tag: "Síntesis", icon: "⌘" },
    { title: "Haz un mini simulacro", description: "Resuelve tres preguntas sin consultar material y revisa después qué necesitas reforzar.", time: 30, cost: 0, tag: "Práctica", icon: "✓" }
  ],
  trabajo: [
    { title: "Define el resultado mínimo viable", description: "Describe qué tendría que estar listo para considerar que hoy avanzaste de verdad en el proyecto.", time: 15, cost: 0, tag: "Enfoque", icon: "◎" },
    { title: "Divide el proyecto en entregables", description: "Separa el trabajo en resultados pequeños que puedas revisar y completar de forma independiente.", time: 30, cost: 0, tag: "Gestión", icon: "▤" },
    { title: "Prepara una lista de bloqueos", description: "Anota qué te está frenando, qué depende de otras personas y cuál es la siguiente acción posible.", time: 15, cost: 0, tag: "Resolución", icon: "↗" },
    { title: "Reserva una hora sin interrupciones", description: "Silencia notificaciones y dedica un bloque a la tarea de mayor impacto.", time: 60, cost: 0, tag: "Productividad", icon: "◷" },
    { title: "Pide una revisión temprana", description: "Comparte un avance pequeño con alguien de confianza para validar la dirección antes de invertir más tiempo.", time: 30, cost: 0, tag: "Colaboración", icon: "✦" }
  ],
  bienestar: [
    { title: "Haz una pausa para volver al presente", description: "Aléjate de la pantalla, respira con calma y observa cinco cosas que puedas ver a tu alrededor.", time: 15, cost: 0, tag: "Pausa consciente", icon: "☼" },
    { title: "Sal a caminar sin prisa", description: "Da una vuelta corta, cambia de ambiente y permite que tu mente descanse de las tareas pendientes.", time: 30, cost: 0, tag: "Movimiento", icon: "↗" },
    { title: "Prepara un pequeño ritual de descanso", description: "Elige una actividad sencilla que te ayude a cerrar el día: leer, escuchar música o preparar una bebida.", time: 15, cost: 0, tag: "Descanso", icon: "☾" },
    { title: "Escribe tres cosas que necesitas", description: "Identifica qué te está haciendo falta hoy: descanso, ayuda, tiempo, compañía o espacio.", time: 15, cost: 0, tag: "Autoconocimiento", icon: "♡" },
    { title: "Planea una actividad que disfrutes", description: "Reserva un momento realista esta semana para hacer algo solo porque te gusta.", time: 30, cost: 1, tag: "Tiempo para ti", icon: "✿" }
  ],
  tiempo: [
    { title: "Explora un lugar cercano", description: "Elige un parque, biblioteca o rincón de tu ciudad que todavía no conozcas y organiza una visita breve.", time: 60, cost: 1, tag: "Explorar", icon: "⌖" },
    { title: "Prueba un reto creativo", description: "Toma una foto, escribe un microcuento o dibuja algo que tengas cerca. No busques que quede perfecto.", time: 30, cost: 0, tag: "Creatividad", icon: "✎" },
    { title: "Organiza una tarde temática", description: "Elige una película, música y algo sencillo para comer alrededor de un tema que te guste.", time: 60, cost: 1, tag: "En casa", icon: "▣" },
    { title: "Aprende algo en 20 minutos", description: "Busca un tutorial breve sobre una habilidad que siempre te haya dado curiosidad y practica lo aprendido.", time: 30, cost: 0, tag: "Curiosidad", icon: "✦" },
    { title: "Haz una lista de experiencias", description: "Escribe diez cosas pequeñas que te gustaría vivir este mes y elige una para empezar.", time: 15, cost: 0, tag: "Inspiración", icon: "♡" }
  ],
  comidas: [
    { title: "Arma un plato con lo que ya tienes", description: "Revisa tu nevera y combina una proteína, un acompañamiento y vegetales disponibles para evitar compras innecesarias.", time: 30, cost: 0, tag: "Aprovechar", icon: "◒" },
    { title: "Prepara una base para varios días", description: "Deja listas algunas porciones de arroz, vegetales o legumbres para facilitar las comidas de la semana.", time: 60, cost: 1, tag: "Organización", icon: "▤" },
    { title: "Prueba una receta de pocos ingredientes", description: "Elige una preparación sencilla con cinco ingredientes o menos y ajusta las cantidades a lo que tengas.", time: 30, cost: 1, tag: "Fácil", icon: "✿" },
    { title: "Planea tres comidas antes de comprar", description: "Define opciones para los próximos días y crea una lista de mercado basada únicamente en lo que necesitas.", time: 15, cost: 0, tag: "Ahorro", icon: "✓" }
  ],
  regalos: [
    { title: "Escribe una carta con recuerdos", description: "Incluye tres momentos que recuerdes con cariño, algo que admires de esa persona y un deseo para el futuro.", time: 30, cost: 0, tag: "Personal", icon: "♡" },
    { title: "Crea una lista de pequeños detalles", description: "Piensa en gustos, colores, canciones o rutinas de esa persona y conviértelos en pistas para un regalo.", time: 15, cost: 0, tag: "Inspiración", icon: "✦" },
    { title: "Diseña un cupón de experiencias", description: "Regala tiempo: una tarde de películas, una comida preparada por ti o una actividad que puedan compartir.", time: 30, cost: 0, tag: "Experiencia", icon: "▣" },
    { title: "Arma un detalle hecho a mano", description: "Usa fotos, papel, frases o materiales que tengas en casa para crear algo que tenga significado.", time: 60, cost: 1, tag: "Hecho a mano", icon: "✎" },
    { title: "Prepara una playlist especial", description: "Selecciona canciones relacionadas con recuerdos o momentos que quieras compartir.", time: 30, cost: 0, tag: "Emocional", icon: "♫" }
  ]
};

function safeStorageGet(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      memoryStorage.set(key, value);
      return value;
    }
  } catch {
    // Some privacy modes and file origins restrict persistent storage.
  }
  return memoryStorage.has(key) ? memoryStorage.get(key) : null;
}

function safeStorageSet(key, value) {
  const serialized = String(value);
  memoryStorage.set(key, serialized);
  try {
    window.localStorage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

function uid() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function taskDateValidationMessage(dueDate, dueTime, scheduledDate, scheduledTime, estimatedMinutes = 25) {
  if (dueTime && !dueDate) return "Selecciona una fecha límite para utilizar una hora límite.";
  if (scheduledTime && !scheduledDate) return "Selecciona un día en agenda para utilizar una hora programada.";
  if (dueDate && scheduledDate && scheduledDate > dueDate) return "La actividad no puede programarse después de su fecha límite.";
  if (dueDate && scheduledDate === dueDate && dueTime && scheduledTime) {
    const finish = Number(scheduledTime.slice(0, 2)) * 60 + Number(scheduledTime.slice(3)) + Math.max(5, Number(estimatedMinutes) || 25);
    const deadline = Number(dueTime.slice(0, 2)) * 60 + Number(dueTime.slice(3));
    if (finish > deadline) return "La duración estimada termina después de la hora límite. Ajusta el horario o la duración.";
  }
  return "";
}

function taskDatesAreConsistent(task) {
  return !taskDateValidationMessage(task.dueDate || "", task.dueTime || "", task.scheduledDate || "", task.scheduledTime || "", task.estimatedMinutes || 25);
}

function sanitizeState(input) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackTimestamp = typeof source.updatedAt === "string" && Number.isFinite(Date.parse(source.updatedAt)) ? source.updatedAt : null;
  const validPriorities = ["high", "medium", "low"];
  const validCategories = ["personal", "study", "work", "home", "wellbeing"];
  return {
    updatedAt: fallbackTimestamp,
    deletedRecords: (Array.isArray(source.deletedRecords) ? source.deletedRecords : []).filter(item => item && typeof item === "object" && ["tasks", "ideas", "plans", "decisions"].includes(item.collection) && item.id && Number.isFinite(Date.parse(item.deletedAt || ""))).map(item => ({ collection: item.collection, id: String(item.id), deletedAt: item.deletedAt })).slice(-3000),
    tasks: (Array.isArray(source.tasks) ? source.tasks : []).filter(item => item && typeof item === "object").map(task => ({
      id: String(task.id || uid()),
      title: String(task.title || "Tarea sin titulo").slice(0, 120),
      priority: validPriorities.includes(task.priority) ? task.priority : "medium",
      category: validCategories.includes(task.category) ? task.category : "personal",
      dueDate: isValidISODate(task.dueDate) ? task.dueDate : "",
      dueTime: isValidTime(task.dueTime) ? task.dueTime : "",
      scheduledDate: isValidISODate(task.scheduledDate) ? task.scheduledDate : "",
      scheduledTime: isValidTime(task.scheduledTime) ? task.scheduledTime : "",
      reminderSentKeys: Array.isArray(task.reminderSentKeys) ? task.reminderSentKeys.filter(key => typeof key === "string" && key.length <= 64).slice(-20) : [],
      modifiedAt: typeof task.modifiedAt === "string" && Number.isFinite(Date.parse(task.modifiedAt)) ? task.modifiedAt : (task.createdAt || fallbackTimestamp),
      reminderSentAt: typeof task.reminderSentAt === "string" && Number.isFinite(Date.parse(task.reminderSentAt)) ? task.reminderSentAt : null,
      scheduledByAssistant: Boolean(task.scheduledByAssistant),
      estimatedMinutes: Math.max(5, Math.min(480, Number(task.estimatedMinutes) || 25)),
      notes: String(task.notes || "").slice(0, 400),
      status: task.completed ? "done" : (["todo", "inprogress", "done"].includes(task.status) ? task.status : "todo"),
      completed: Boolean(task.completed) || task.status === "done",
      completedAt: typeof task.completedAt === "string" && Number.isFinite(Date.parse(task.completedAt)) ? task.completedAt : null,
      createdAt: task.createdAt || new Date().toISOString()
    })).map(task => {
      if (!task.dueDate) task.dueTime = "";
      if (!task.scheduledDate) task.scheduledTime = "";
      if (task.dueDate && task.scheduledDate && task.scheduledDate > task.dueDate) {
        task.scheduledDate = "";
        task.scheduledTime = "";
      } else if (task.dueDate && task.scheduledDate === task.dueDate && task.dueTime && task.scheduledTime && !taskDatesAreConsistent(task)) {
        task.scheduledTime = "";
      }
      return task;
    }),
    ideas: (Array.isArray(source.ideas) ? source.ideas : []).filter(item => item && typeof item === "object").map(idea => ({
      ...idea,
      id: String(idea.id || uid()),
      title: String(idea.title || "Idea guardada").slice(0, 140),
      description: String(idea.description || "").slice(0, 600),
      modifiedAt: typeof idea.modifiedAt === "string" && Number.isFinite(Date.parse(idea.modifiedAt)) ? idea.modifiedAt : (idea.savedAt || fallbackTimestamp)
    })),
    plans: (Array.isArray(source.plans) ? source.plans : []).filter(item => item && typeof item === "object").map(plan => ({
      ...plan,
      id: String(plan.id || uid()),
      goal: String(plan.goal || "Objetivo sin titulo").slice(0, 140),
      modifiedAt: typeof plan.modifiedAt === "string" && Number.isFinite(Date.parse(plan.modifiedAt)) ? plan.modifiedAt : (plan.createdAt || fallbackTimestamp),
      goalType: String(plan.goalType || "general"),
      durationDays: Math.max(1, Number(plan.durationDays) || 14),
      dailyMinutes: Math.max(5, Number(plan.dailyMinutes) || 30),
      steps: (Array.isArray(plan.steps) ? plan.steps : []).map(step => ({
        ...step,
        id: String(step.id || uid()),
        title: String(step.title || "Paso").slice(0, 140),
        description: String(step.description || "").slice(0, 300),
        dueDay: Math.max(1, Number(step.dueDay) || 1),
        modifiedAt: typeof step.modifiedAt === "string" && Number.isFinite(Date.parse(step.modifiedAt)) ? step.modifiedAt : (plan.createdAt || fallbackTimestamp),
        completed: Boolean(step.completed)
      }))
    })),
    decisions: (Array.isArray(source.decisions) ? source.decisions : []).filter(item => item && typeof item === "object").map(decision => ({
      ...decision,
      id: String(decision.id || uid()),
      title: String(decision.title || "Decision").slice(0, 140),
      winner: String(decision.winner || "Sin resultado").slice(0, 140),
      score: Number(decision.score) || 0,
      modifiedAt: typeof decision.modifiedAt === "string" && Number.isFinite(Date.parse(decision.modifiedAt)) ? decision.modifiedAt : (decision.createdAt || fallbackTimestamp)
    }))
  };
}

function loadState() {
  try {
    const stored = JSON.parse(safeStorageGet(STORAGE_KEY) || "null");
    return sanitizeState(stored || defaultState);
  } catch {
    return sanitizeState(defaultState);
  }
}

function recordTimestamp(record) {
  return Date.parse(record?.modifiedAt || record?.createdAt || record?.savedAt || "") || 0;
}

function mergeCollection(preferred = [], secondary = []) {
  const merged = new Map();
  preferred.forEach(item => merged.set(item.id, item));
  secondary.forEach(item => {
    const current = merged.get(item.id);
    if (!current || recordTimestamp(item) > recordTimestamp(current)) merged.set(item.id, item);
  });
  return [...merged.values()];
}

function mergeStates(preferred, secondary) {
  const collections = ["tasks", "ideas", "plans", "decisions"];
  const deletedMap = new Map();
  [...(preferred.deletedRecords || []), ...(secondary.deletedRecords || [])].forEach(item => {
    const key = `${item.collection}:${item.id}`;
    const current = deletedMap.get(key);
    if (!current || Date.parse(item.deletedAt) > Date.parse(current.deletedAt)) deletedMap.set(key, item);
  });
  const deletedRecords = [...deletedMap.values()].slice(-3000);
  const result = { deletedRecords };
  collections.forEach(collection => {
    const tombstones = new Map(deletedRecords.filter(item => item.collection === collection).map(item => [item.id, Date.parse(item.deletedAt)]));
    result[collection] = mergeCollection(preferred[collection] || [], secondary[collection] || [])
      .filter(item => !tombstones.has(item.id) || recordTimestamp(item) > tombstones.get(item.id));
  });
  const dates = [preferred.updatedAt, secondary.updatedAt].filter(Boolean).map(value => Date.parse(value)).filter(Number.isFinite);
  result.updatedAt = dates.length ? new Date(Math.max(...dates)).toISOString() : new Date().toISOString();
  return result;
}

function markStateChanges(previous, current, timestamp) {
  current.deletedRecords = Array.isArray(current.deletedRecords) ? current.deletedRecords : [];
  for (const collection of ["tasks", "ideas", "plans", "decisions"]) {
    const before = new Map((previous?.[collection] || []).map(item => [item.id, item]));
    const after = new Map((current[collection] || []).map(item => [item.id, item]));
    for (const [id, item] of after) {
      const oldItem = before.get(id);
      const oldComparable = oldItem ? { ...oldItem } : null;
      const newComparable = { ...item };
      if (oldComparable) delete oldComparable.modifiedAt;
      delete newComparable.modifiedAt;
      if (!oldComparable || JSON.stringify(oldComparable) !== JSON.stringify(newComparable)) item.modifiedAt = timestamp;
    }
    for (const id of before.keys()) {
      if (!after.has(id)) current.deletedRecords.push({ collection, id, deletedAt: timestamp });
    }
  }
  const latest = new Map();
  current.deletedRecords.forEach(item => {
    const key = `${item.collection}:${item.id}`;
    const existing = latest.get(key);
    if (!existing || Date.parse(item.deletedAt) > Date.parse(existing.deletedAt)) latest.set(key, item);
  });
  current.deletedRecords = [...latest.values()].slice(-3000);
}

function persistState() {
  const now = new Date().toISOString();
  markStateChanges(lastPersistedState, state, now);
  state.updatedAt = now;
  const stored = safeStorageSet(STORAGE_KEY, JSON.stringify(state));
  if (!stored && !storageWarningShown) {
    storageWarningShown = true;
    showToast("El navegador bloquea el guardado permanente. Tus cambios se conservarán mientras esta pestaña permanezca abierta.");
  }
  if (currentUser) {
    localOwnerUid = currentUser.uid;
    safeStorageSet("desenreda-owner-uid", localOwnerUid);
  }
  lastPersistedState = JSON.parse(JSON.stringify(state));

  if (cloudReady && cloudDocument && firebaseSdk?.runTransaction && firebaseDb && currentUser) {
    clearTimeout(cloudSaveTimer);
    const snapshot = JSON.parse(JSON.stringify(state));
    const userId = currentUser.uid;
    cloudSaveTimer = setTimeout(async () => {
      try {
        const committed = await firebaseSdk.runTransaction(firebaseDb, async transaction => {
          const remoteSnapshot = await transaction.get(cloudDocument);
          const remoteState = remoteSnapshot.exists() ? sanitizeState(remoteSnapshot.data()) : sanitizeState(defaultState);
          const combined = mergeStates(snapshot, remoteState);
          transaction.set(cloudDocument, combined);
          return combined;
        });
        if (firebaseAuth?.currentUser?.uid !== userId) return;
        // A second local edit may occur while the first transaction is in flight.
        // Merge the committed result with the latest in-memory state instead of replacing it.
        const latestLocal = sanitizeState(state);
        const merged = mergeStates(latestLocal, committed);
        if (JSON.stringify(merged) !== JSON.stringify(state)) {
          state = sanitizeState(merged);
          safeStorageSet(STORAGE_KEY, JSON.stringify(state));
          lastPersistedState = JSON.parse(JSON.stringify(state));
          renderAll();
        }
        setSyncStatus("Sincronizado con Firebase", true);
      } catch (error) {
        console.warn("Error al sincronizar con Firebase:", error);
        setSyncStatus("Cambios guardados localmente; sincronización pendiente", false);
      }
    }, 500);
  }
  updateCounters();
}

function showToast(message) {
  const region = q("#toastRegion");
  if (!region) return;
  // Keep feedback visible without covering the current form or navigation.
  while (region.children.length >= 2) region.firstElementChild.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function setSyncStatus(message, cloud = false) {
  q("#syncText").textContent = message;
  q("#syncDot").classList.toggle("is-cloud", cloud);
  q("#syncPill").title = message;
  if (q("#accountSyncLabel")) q("#accountSyncLabel").textContent = message;
  if (q("#settingsSyncText")) q("#settingsSyncText").textContent = message;
  if (q("#settingsSyncDot")) q("#settingsSyncDot").classList.toggle("is-cloud", cloud);
}

function dashboardGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  return `${greeting}, <span class="heading-gradient">¿cómo te ayudo hoy?</span>`;
}

function showView(viewName) {
  if (!viewCopy[viewName]) return;
  qa(".view").forEach(view => view.classList.toggle("active", view.id === `view-${viewName}`));
  qa(".nav-link, .mobile-nav-link[data-view]").forEach(link => {
    const active = link.dataset.view === viewName;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const mobileMore = q("#mobileMoreBtn");
  if (mobileMore) {
    const moreActive = ["assistant", "decisions", "plans", "focus"].includes(viewName);
    mobileMore.classList.toggle("active", moreActive);
    mobileMore.setAttribute("aria-expanded", "false");
  }
  const moreDialog = q("#mobileMoreDialog");
  if (moreDialog?.open) moreDialog.close();
  document.body.dataset.view = viewName;
  if (viewName === "dashboard") {
    q("#pageTitle").innerHTML = dashboardGreeting();
  } else {
    q("#pageTitle").textContent = viewCopy[viewName][0];
  }
  q("#pageSubtitle").textContent = viewCopy[viewName][1];
  if (viewName === "dashboard") renderDashboard();
  if (viewName === "tasks") renderTasks();
  if (viewName === "calendar") renderCalendar();
  if (viewName === "ideas") renderSavedIdeas();
  if (viewName === "plans") renderPlans();
  if (viewName === "focus") renderFocusTaskOptions();
  if (viewName === "assistant") renderAssistant();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getUpcomingReminderEntries(daysAhead = 7) {
  const today = localDateISO();
  const horizon = localDateISO(addCalendarDays(new Date(), daysAhead));
  const overdueStart = localDateISO(addCalendarDays(new Date(), -14));
  const entries = [];
  state.tasks.filter(task => !task.completed).forEach(task => {
    if (task.scheduledDate && task.scheduledDate >= today && task.scheduledDate <= horizon) {
      entries.push({ task, kind: "scheduled", date: task.scheduledDate, time: task.scheduledTime || "", key: `scheduled:${task.scheduledDate}:${task.scheduledTime || "all-day"}` });
    }
    if (task.dueDate && task.dueDate >= today && task.dueDate <= horizon) {
      entries.push({ task, kind: "deadline", date: task.dueDate, time: task.dueTime || "", key: `deadline:${task.dueDate}:${task.dueTime || "all-day"}` });
    }
    if (task.dueDate && task.dueDate < today && task.dueDate >= overdueStart) {
      entries.push({ task, kind: "deadline", date: task.dueDate, time: task.dueTime || "", key: `deadline:${task.dueDate}:${task.dueTime || "all-day"}` });
    }
  });
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99") || a.kind.localeCompare(b.kind));
}

function updateCounters() {
  const pending = state.tasks.filter(task => !task.completed).length;
  const activePlans = state.plans.filter(plan => !plan.steps.every(step => step.completed)).length;
  const today = localDateISO();
  const dailyTasks = state.tasks.filter(task => task.scheduledDate === today || task.dueDate === today || (task.completed && task.completedAt && localDateISO(new Date(task.completedAt)) === today));
  const dailyCompleted = dailyTasks.filter(task => task.completed).length;
  const dailyPending = dailyTasks.filter(task => !task.completed).length;
  const completedToday = state.tasks.filter(task => task.completed && task.completedAt && localDateISO(new Date(task.completedAt)) === today).length;
  q("#pendingStat").textContent = dailyPending;
  q("#ideasStat").textContent = state.ideas.length;
  q("#plansStat").textContent = activePlans;
  q("#completedStat").textContent = dailyCompleted;
  q("#navTaskCount").textContent = pending;
  q("#navPlanCount").textContent = activePlans;
  if (q("#mobileTaskCount")) {
    q("#mobileTaskCount").textContent = pending > 99 ? "99+" : String(pending);
    q("#mobileTaskCount").hidden = pending === 0;
  }
  q("#completedToday").textContent = completedToday;
  const reminderCount = getUpcomingReminderEntries(7).length;
  if (q("#dashboardReminderCount")) q("#dashboardReminderCount").textContent = reminderCount;
  if (q("#notificationDot")) q("#notificationDot").hidden = reminderCount === 0;
  const progress = dailyTasks.length ? Math.round((dailyCompleted / dailyTasks.length) * 100) : 0;
  const ring = q("#summaryProgressRing");
  if (ring) {
    ring.style.setProperty("--progress-deg", `${progress * 3.6}deg`);
    ring.setAttribute("aria-label", `Progreso de las actividades de hoy: ${progress} por ciento`);
  }
  if (q("#summaryProgressValue")) q("#summaryProgressValue").textContent = `${progress}%`;
  if (q("#summaryProgressCaption")) q("#summaryProgressCaption").textContent = dailyTasks.length ? `${dailyCompleted} de ${dailyTasks.length} actividades de hoy` : "Sin actividades para hoy";
}

function renderAll() {
  renderTasks();
  renderSavedIdeas();
  renderDecisionHistory();
  renderPlans();
  updateCounters();
}

function priorityLabel(priority) {
  return ({ high: "Alta", medium: "Normal", low: "Baja" })[priority] || "Normal";
}

function categoryLabel(category) {
  return ({ personal: "Personal", study: "Estudio", work: "Trabajo", home: "Hogar", wellbeing: "Bienestar" })[category] || "Personal";
}

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A task may appear twice in the calendar when its scheduled day differs from its deadline.
function taskHasCalendarEntryOnDate(task, isoDate) {
  return Boolean(isoDate && (task.scheduledDate === isoDate || task.dueDate === isoDate));
}
function taskHasCalendarEntryInRange(task, startISO, endISO) {
  return [task.scheduledDate, task.dueDate].some(date => date && date >= startISO && date <= endISO);
}
function calendarEventKind(task, isoDate) {
  const isScheduled = task.scheduledDate === isoDate;
  const isDeadline = task.dueDate === isoDate;
  if (isScheduled && isDeadline) return "Agenda · vence";
  return isScheduled ? "Agenda" : "Vencimiento";
}
function calendarTimeOf(task, isoDate = "") {
  if (isoDate && task.scheduledDate === isoDate) return task.scheduledTime || (task.dueDate === isoDate ? task.dueTime || "" : "");
  if (isoDate && task.dueDate === isoDate) return task.dueTime || "";
  return task.scheduledDate ? (task.scheduledTime || "") : (task.dueTime || "");
}
function taskScheduleLabel(task) {
  if (!task.scheduledDate) return "";
  const date = calendarDateLabel(new Date(`${task.scheduledDate}T12:00:00`), { day: "numeric", month: "short" });
  return `Agenda ${date}${task.scheduledTime ? ` · ${task.scheduledTime}` : ""}`;
}

function addCalendarDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getCalendarWeekStart() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + calendarWeekOffset * 7);
  return start;
}

function calendarDateLabel(date, options = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("es-CO", options).format(date);
}

function renderCalendar() {
  const grid = q("#calendarWeekGrid");
  if (!grid) return;
  const today = localDateISO();
  let visibleDays = [];
  let rangeLabel = "";
  let summaryTasks = [];

  if (currentCalendarMode === "month") {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth() + calendarMonthOffset, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridStart = addCalendarDays(monthStart, -((monthStart.getDay() + 6) % 7));
    visibleDays = Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
    rangeLabel = calendarDateLabel(monthStart, { month: "long", year: "numeric" });
    summaryTasks = state.tasks.filter(task => [task.scheduledDate, task.dueDate].some(date => date?.startsWith(`${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`)));
    if (!selectedCalendarDate.startsWith(`${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`)) {
      selectedCalendarDate = today.startsWith(`${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`) ? today : localDateISO(monthStart);
    }
    grid.classList.add("is-month-view");
  } else {
    const weekStart = getCalendarWeekStart();
    visibleDays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
    const weekEnd = visibleDays[6];
    rangeLabel = `${calendarDateLabel(weekStart, { day: "numeric", month: "short" })} - ${calendarDateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;
    selectedCalendarDate = localDateISO(visibleDays[selectedWeekdayIndex]);
    summaryTasks = state.tasks.filter(task => taskHasCalendarEntryInRange(task, localDateISO(weekStart), localDateISO(weekEnd)));
    grid.classList.remove("is-month-view");
  }

  q("#calendarRangeLabel").textContent = rangeLabel;
  const weekMinutes = summaryTasks.reduce((sum, task) => sum + (Number(task.estimatedMinutes) || 25), 0);
  q("#calendarWeekSummary").textContent = `${summaryTasks.length} ${summaryTasks.length === 1 ? "tarea" : "tareas"} · ${weekMinutes} min planificados`;
  q("#calendarPrevBtn").setAttribute("aria-label", currentCalendarMode === "month" ? "Mes anterior" : "Semana anterior");
  q("#calendarNextBtn").setAttribute("aria-label", currentCalendarMode === "month" ? "Mes siguiente" : "Semana siguiente");
  qa("[data-calendar-mode]").forEach(button => {
    const active = button.dataset.calendarMode === currentCalendarMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const activeMonth = new Date(new Date().getFullYear(), new Date().getMonth() + calendarMonthOffset, 1);
  const monthKey = `${activeMonth.getFullYear()}-${String(activeMonth.getMonth() + 1).padStart(2, "0")}`;
  grid.innerHTML = `${currentCalendarMode === "month" ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => `<span class="calendar-month-weekday">${day}</span>`).join("") : ""}${visibleDays.map(date => {
    const iso = localDateISO(date);
    const tasks = state.tasks.filter(task => taskHasCalendarEntryOnDate(task, iso)).sort((a, b) => Number(a.completed) - Number(b.completed) || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
    const completed = tasks.filter(task => task.completed).length;
    const weekday = calendarDateLabel(date, { weekday: "short" }).replace(".", "").toUpperCase();
    if (currentCalendarMode === "month") {
      return `<button class="calendar-day-card month-day-card ${iso === selectedCalendarDate ? "selected" : ""} ${iso === today ? "is-today" : ""} ${iso.slice(0, 7) !== monthKey ? "outside-month" : ""}" type="button" data-calendar-date="${iso}" aria-pressed="${iso === selectedCalendarDate}">
        <span class="calendar-day-number">${date.getDate()}</span><span class="month-day-task-count">${tasks.length ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}` : ""}</span>
        <span class="calendar-day-dots">${tasks.slice(0, 4).map(task => `<i class="${task.completed ? "done" : task.priority}"></i>`).join("")}</span>
        ${tasks.length ? `<span class="month-day-preview">${escapeHTML(tasks[0].title)}${tasks.length > 1 ? ` +${tasks.length - 1}` : ""}</span>` : ""}
      </button>`;
    }
    const previews = tasks.slice(0, 2).map(task => `<span class="calendar-task-preview ${task.completed ? "is-complete" : ""}">${escapeHTML(task.title)}</span>`).join("");
    return `<button class="calendar-day-card ${iso === selectedCalendarDate ? "selected" : ""} ${iso === today ? "is-today" : ""}" type="button" data-calendar-date="${iso}" aria-pressed="${iso === selectedCalendarDate}">
      <span class="calendar-day-name">${weekday}</span><strong class="calendar-day-number">${date.getDate()}</strong>
      <span class="calendar-day-count">${tasks.length ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}` : "Libre"}</span>
      <span class="calendar-day-dots">${tasks.slice(0, 5).map(task => `<i class="${task.completed ? "done" : task.priority}"></i>`).join("")}</span>
      <span class="calendar-day-previews">${previews || `<span class="calendar-task-preview muted">Sin pendientes</span>`}</span>
      ${tasks.length ? `<span class="calendar-day-completion">${completed}/${tasks.length} listas</span>` : `<span class="calendar-day-completion">Planifica tu día</span>`}
    </button>`;
  }).join("")}`;

  const selectedTasks = state.tasks.filter(task => taskHasCalendarEntryOnDate(task, selectedCalendarDate)).sort((a, b) => Number(a.completed) - Number(b.completed) || (calendarTimeOf(a, selectedCalendarDate) || "99:99").localeCompare(calendarTimeOf(b, selectedCalendarDate) || "99:99") || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  const selectedDate = new Date(`${selectedCalendarDate}T12:00:00`);
  const completed = selectedTasks.filter(task => task.completed).length;
  const minutes = selectedTasks.reduce((sum, task) => sum + (Number(task.estimatedMinutes) || 25), 0);
  q("#calendarSelectedDateTitle").textContent = calendarDateLabel(selectedDate);
  q("#calendarSelectedDateMeta").textContent = selectedCalendarDate === today ? "Este es tu día de hoy." : "Actividades y vencimientos de esta fecha.";
  q("#calendarDayStats").innerHTML = `<span><strong>${selectedTasks.length}</strong> ${selectedTasks.length === 1 ? "tarea" : "tareas"}</span><span><strong>${completed}</strong> completadas</span><span><strong>${minutes}</strong> min estimados</span>`;
  q("#calendarTaskList").innerHTML = selectedTasks.length
    ? selectedTasks.map(task => taskRowHTML(task)).join("")
    : `<div class="calendar-empty"><span>✦</span><strong>Este día tiene espacio libre.</strong><p>Si tienes algo pendiente, prográmalo para que no se quede dando vueltas en tu cabeza.</p></div>`;
}

function changeCalendarWeek(direction) {
  if (currentCalendarMode === "month") calendarMonthOffset += direction;
  else calendarWeekOffset += direction;
  renderCalendar();
}

function selectCalendarDay(isoDate) {
  if (!isValidISODate(isoDate)) return;
  selectedCalendarDate = isoDate;
  const selected = new Date(`${isoDate}T12:00:00`);
  if (currentCalendarMode === "month") {
    const today = new Date();
    calendarMonthOffset = (selected.getFullYear() - today.getFullYear()) * 12 + selected.getMonth() - today.getMonth();
  }
  const selectedWeekStart = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
  selectedWeekStart.setDate(selectedWeekStart.getDate() - ((selectedWeekStart.getDay() + 6) % 7));
  const currentWeekStart = getCalendarWeekStart();
  calendarWeekOffset = Math.round((selectedWeekStart - currentWeekStart) / 604800000) + calendarWeekOffset;
  selectedWeekdayIndex = (selected.getDay() + 6) % 7;
  renderCalendar();
}

function addTaskFromCalendar() {
  const scheduledDate = selectedCalendarDate;
  showView("tasks");
  if (q("#taskAdvancedOptions")) q("#taskAdvancedOptions").open = true;
  q("#taskScheduleDate").value = scheduledDate;
  q("#taskScheduleTime").value = "";
  window.setTimeout(() => q("#taskInput").focus(), 100);
  showToast(`Nueva actividad programada para ${calendarDateLabel(new Date(`${scheduledDate}T12:00:00`), { day: "numeric", month: "long" })}.`);
}

function taskDueInfo(task) {
  if (!task.dueDate) return "";
  const due = new Date(`${task.dueDate}T00:00:00`);
  const today = localDateISO();
  const status = !task.completed && task.dueDate < today ? "overdue" : task.dueDate === today ? "today" : "future";
  const label = status === "overdue" ? "Vencida" : status === "today" ? "Hoy" : new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(due);
  return `<span class="task-due due-${status}">${escapeHTML(label)}</span>`;
}

function taskRowHTML(task, compact = false) {
  return `
    <div class="task-row ${task.completed ? "is-done" : ""}" data-task-id="${escapeHTML(task.id)}">
      <button class="task-check" type="button" data-action="toggle-task" aria-label="${task.completed ? "Marcar como pendiente" : "Completar tarea"}" aria-pressed="${task.completed}"></button>
      <div class="task-row-content">
        <span class="task-name">${escapeHTML(task.title)}</span>
        ${compact ? "" : `<span class="task-meta"><span class="task-category category-${escapeHTML(task.category || "personal")}">${categoryLabel(task.category)}</span>${taskDueInfo(task)}${task.scheduledDate ? `<span class="task-scheduled-time">${escapeHTML(taskScheduleLabel(task))}</span>` : calendarTimeOf(task) ? `<span class="task-scheduled-time">${escapeHTML(calendarTimeOf(task))}</span>` : ""}<span class="task-estimate">${Number(task.estimatedMinutes) || 25} min</span></span>`}
      </div>
      <span class="priority-pill priority-${escapeHTML(task.priority)}">${priorityLabel(task.priority)}</span>
      <div class="task-actions">
        <button class="task-edit" type="button" data-action="edit-task" aria-label="Editar tarea" title="Editar">&#9998;</button>
        <button class="task-delete" type="button" data-action="delete-task" aria-label="Eliminar tarea" title="Eliminar">&times;</button>
      </div>
    </div>`;
}

function dashboardTaskRowHTML(task) {
  const due = task.dueDate ? taskDueInfo(task) : task.scheduledDate ? `<span class="dashboard-no-date">${escapeHTML(calendarDateLabel(new Date(`${task.scheduledDate}T12:00:00`), { day: "numeric", month: "short" }))}${task.scheduledTime ? ` · ${escapeHTML(task.scheduledTime)}` : ""}</span>` : '<span class="dashboard-no-date">Sin fecha</span>';
  const scheduled = task.scheduledDate ? `<small class="dashboard-schedule-note">Agenda · ${escapeHTML(calendarDateLabel(new Date(`${task.scheduledDate}T12:00:00`), { day: "numeric", month: "short" }))}${task.scheduledTime ? ` · ${escapeHTML(task.scheduledTime)}` : ""}</small>` : "";
  return `<div class="dashboard-task-row ${task.completed ? "is-done" : ""}" data-task-id="${escapeHTML(task.id)}">
    <button class="task-check" type="button" data-action="toggle-task" aria-label="${task.completed ? "Marcar como pendiente" : "Completar tarea"}" aria-pressed="${task.completed}"></button>
    <span class="dashboard-task-name">${escapeHTML(task.title)}${scheduled}</span>
    <span class="priority-pill priority-${escapeHTML(task.priority)}">${priorityLabel(task.priority)}</span>
    ${due}
    <span class="dashboard-task-actions"><button type="button" data-action="edit-task" aria-label="Editar tarea" title="Editar">&#9998;</button></span>
  </div>`;
}

function renderDashboardAgenda() {
  const weekStart = getCalendarWeekStart();
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const weekEnd = days[6];
  const today = localDateISO();
  const selectedDate = days[selectedWeekdayIndex] || new Date();
  selectedCalendarDate = localDateISO(selectedDate);
  const startLabel = calendarDateLabel(weekStart, { day: "numeric", month: "short" });
  const endLabel = calendarDateLabel(weekEnd, { day: "numeric", month: "short" });
  q("#dashboardAgendaRange").textContent = `${startLabel} - ${endLabel}`;
  q("#dashboardWeekStrip").innerHTML = days.map((date, index) => {
    const iso = localDateISO(date);
    const count = state.tasks.filter(task => taskHasCalendarEntryOnDate(task, iso) && !task.completed).length;
    const dayName = calendarDateLabel(date, { weekday: "short" }).replace(".", "");
    return `<button type="button" class="dashboard-week-day ${index === selectedWeekdayIndex ? "selected" : ""} ${iso === today ? "is-today" : ""}" data-dashboard-date="${iso}" data-weekday-index="${index}" aria-pressed="${index === selectedWeekdayIndex}"><span>${escapeHTML(dayName)}</span><strong>${date.getDate()}</strong><i class="${count ? "has-tasks" : ""}"></i></button>`;
  }).join("");

  const dayTasks = state.tasks.filter(task => taskHasCalendarEntryOnDate(task, selectedCalendarDate)).sort((a, b) => {
    const aTime = calendarTimeOf(a, selectedCalendarDate);
    const bTime = calendarTimeOf(b, selectedCalendarDate);
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
    if (aTime && !bTime) return -1;
    if (!aTime && bTime) return 1;
    return ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]);
  });
  q("#dashboardAgendaList").innerHTML = dayTasks.length ? dayTasks.slice(0, 3).map((task, index) => {
    const time = calendarTimeOf(task, selectedCalendarDate) || "Sin hora";
    const category = categoryLabel(task.category || "personal");
    const eventType = calendarEventKind(task, selectedCalendarDate);
    const deadlineNote = task.scheduledDate === selectedCalendarDate && task.dueDate === selectedCalendarDate && task.dueTime ? ` · límite ${task.dueTime}` : "";
    return `<div class="dashboard-agenda-item" data-task-id="${escapeHTML(task.id)}"><span class="agenda-time">${escapeHTML(time)}</span><i class="agenda-color agenda-color-${index % 3}"></i><div class="agenda-event-copy"><strong class="${task.completed ? "is-complete" : ""}">${escapeHTML(task.title)}</strong><span>${eventType}${deadlineNote} · ${escapeHTML(category)} &middot; ${Number(task.estimatedMinutes) || 25} min</span></div><button type="button" class="agenda-event-more" data-action="edit-task" aria-label="Editar actividad">&#8943;</button></div>`;
  }).join("") : `<div class="dashboard-agenda-empty"><span class="agenda-empty-icon">&#10022;</span><span>No hay actividades para este d&iacute;a.</span><button type="button" data-go-view="calendar">Organizar agenda</button></div>`;
}

function renderDashboardPlans() {
  const plans = state.plans.slice(0, 3);
  q("#dashboardPlans").innerHTML = plans.length ? plans.map((plan, index) => {
    const completed = plan.steps.filter(step => step.completed).length;
    const total = plan.steps.length || 1;
    const progress = Math.round(completed / total * 100);
    const icons = [
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z"/><path d="M4 21c3-5 6-8 11-11"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 13 8-2 8-7 2 2-7 8-2 8-3-6-6-3Z"/><path d="m13 11 3 3"/></svg>'
    ];
    const classes = ["plan-lilac", "plan-mint", "plan-peach"];
    return `<button type="button" class="dashboard-plan-row" data-go-view="plans"><span class="dashboard-plan-icon ${classes[index % classes.length]}">${icons[index % icons.length]}</span><span class="dashboard-plan-copy"><strong>${escapeHTML(plan.goal)}</strong><small>${completed} de ${total} hitos</small></span><span class="dashboard-plan-progress"><i><b style="width:${progress}%"></b></i><strong>${progress}%</strong></span></button>`;
  }).join("") : `<div class="dashboard-empty-block"><span class="empty-block-icon">&#10022;</span><strong>Tus objetivos empiezan aqu&iacute;.</strong><span>Crea un plan y convierte una meta en pasos posibles.</span><button type="button" data-go-view="plans">Crear mi primer plan <span>&rarr;</span></button></div>`;
}

function reminderEntryLabel(entry) {
  const today = localDateISO();
  const dateLabel = entry.date < today ? "Vencida" : entry.date === today ? "Hoy" : calendarDateLabel(new Date(`${entry.date}T12:00:00`), { day: "numeric", month: "short" });
  const kindLabel = entry.kind === "scheduled" ? "Agenda" : "Vence";
  return `${kindLabel} · ${dateLabel}${entry.time ? ` · ${entry.time}` : ""}`;
}

function renderDashboardReminders() {
  const reminders = getUpcomingReminderEntries(7).slice(0, 4);
  q("#dashboardReminders").innerHTML = reminders.length ? reminders.map(entry => `
    <div class="dashboard-reminder-row" data-task-id="${escapeHTML(entry.task.id)}">
      <button class="task-check" type="button" data-action="toggle-task" aria-label="Completar tarea"></button>
      <span class="dashboard-reminder-copy"><strong>${escapeHTML(entry.task.title)}</strong><small>${escapeHTML(reminderEntryLabel(entry))}</small></span>
      <button type="button" class="reminder-edit" data-action="edit-task" aria-label="Editar recordatorio">&#8943;</button>
    </div>`).join("") : `<div class="dashboard-reminders-empty"><span>&#10003;</span><strong>No tienes recordatorios próximos.</strong><small>Programa una actividad o asigna una fecha límite para verla aquí.</small></div>`;
}

function renderNotificationPopover() {
  const list = q("#notificationPopoverList");
  if (!list) return;
  const reminders = getUpcomingReminderEntries(7).slice(0, 6);
  list.innerHTML = reminders.length ? reminders.map(entry => `
    <button class="notification-item ${entry.date < localDateISO() ? "is-overdue" : ""}" type="button" data-task-id="${escapeHTML(entry.task.id)}" data-action="edit-task">
      <span class="notification-item-icon">${entry.kind === "scheduled" ? "◷" : "!"}</span>
      <span class="notification-item-copy"><strong>${escapeHTML(entry.task.title)}</strong><small>${escapeHTML(reminderEntryLabel(entry))} · ${priorityLabel(entry.task.priority)}</small></span>
      <span class="notification-item-arrow">›</span>
    </button>`).join("") : `<div class="notification-empty"><span>✓</span><strong>Todo está al día</strong><small>Cuando tengas una actividad o fecha límite próxima, aparecerá aquí.</small></div>`;
}

function renderWeeklyActivity() {
  const chart = q("#weeklyActivityChart");
  if (!chart) return;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(today, index - 6);
    return { date, iso: localDateISO(date), label: new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(date).replace(".", "").slice(0, 2) };
  });
  const counts = days.map(day => state.tasks.filter(task => task.completed && task.completedAt && localDateISO(new Date(task.completedAt)) === day.iso).length);
  const maxCount = Math.max(1, ...counts);
  const total = counts.reduce((sum, value) => sum + value, 0);
  q("#weeklyActivityTotal").textContent = `${total} ${total === 1 ? "tarea" : "tareas"}`;
  chart.innerHTML = days.map((day, index) => `
    <div class="weekly-bar-column" aria-label="${escapeHTML(day.label)}: ${counts[index]} tareas completadas">
      <strong>${counts[index] || ""}</strong>
      <div class="weekly-bar-track"><span style="height:${counts[index] ? Math.max(9, Math.round(counts[index] / maxCount * 100)) : 4}%"></span></div>
      <small>${escapeHTML(day.label)}</small>
    </div>`).join("");
  q("#weeklyActivityNote").textContent = total
    ? "Cada barra refleja tareas que completaste en los últimos siete días."
    : "Cuando completes tareas, verás aquí tu actividad de los últimos siete días.";
}

function renderDashboard() {
  const today = localDateISO();
  const pending = state.tasks.filter(task => !task.completed);
  const ordered = [...pending].sort((a, b) => {
    const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
    const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]);
  });
  const allCount = state.tasks.length;
  const doneCount = state.tasks.filter(task => task.completed).length;
  q("#dashPendingCount").textContent = pending.length;
  q("#dashAllCount").textContent = allCount;
  q("#dashDoneCount").textContent = doneCount;
  qa("[data-dashboard-filter]").forEach(button => {
    const active = button.dataset.dashboardFilter === currentTaskFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  let dashboardTasks = currentTaskFilter === "done" ? state.tasks.filter(task => task.completed) : currentTaskFilter === "all" ? state.tasks : ordered;
  dashboardTasks = [...dashboardTasks].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    return ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]);
  });
  q("#dashboardTaskList").innerHTML = dashboardTasks.length
    ? dashboardTasks.slice(0, 3).map(dashboardTaskRowHTML).join("")
    : `<div class="dashboard-task-empty"><span>&#10003;</span><strong>${currentTaskFilter === "done" ? "A&uacute;n no has completado tareas." : "No tienes tareas pendientes."}</strong><small>Agrega una actividad para comenzar a organizar tu d&iacute;a.</small></div>`;

  const ideas = state.ideas.slice(0, 4);
  q("#dashboardIdeas").innerHTML = ideas.length ? ideas.map((idea, index) => `<button type="button" class="dashboard-idea-chip idea-chip-${index % 4}" data-go-view="ideas"><span>&#10022;</span>${escapeHTML(idea.title)}</button>`).join("") : `<div class="dashboard-ideas-empty"><span class="empty-block-icon">&#10022;</span><strong>Guarda aqu&iacute; tus ideas favoritas.</strong><small>Explora el generador y conserva las propuestas que quieras probar.</small><button type="button" data-go-view="ideas">Generar una idea <span>&rarr;</span></button></div>`;

  renderWeeklyActivity();
  renderDashboardAgenda();
  renderDashboardPlans();
  renderDashboardReminders();
  renderNotificationPopover();
  updateCounters();
}

function renderKanbanBoard(tasks) {
  const columns = [
    { id: "todo", title: "Por hacer", tone: "todo", items: tasks.filter(task => !task.completed && (task.status || "todo") === "todo") },
    { id: "inprogress", title: "En progreso", tone: "progress", items: tasks.filter(task => !task.completed && task.status === "inprogress") },
    { id: "done", title: "Completadas", tone: "done", items: tasks.filter(task => task.completed || task.status === "done") }
  ];
  return columns.map(column => `
    <section class="kanban-column kanban-${column.tone}" data-kanban-column="${column.id}" aria-label="${column.title}">
      <header class="kanban-column-heading"><span class="kanban-column-dot"></span><h3>${column.title}</h3><strong>${column.items.length}</strong></header>
      <div class="kanban-dropzone" data-kanban-dropzone="${column.id}">
        ${column.items.length ? column.items.map(task => `
          <article class="kanban-card ${task.completed ? "is-complete" : ""}" draggable="true" data-kanban-task="${escapeHTML(task.id)}" data-task-id="${escapeHTML(task.id)}">
            <div class="kanban-card-top"><span class="task-category category-${escapeHTML(task.category || "personal")}">${categoryLabel(task.category)}</span><button class="kanban-card-menu" type="button" data-action="edit-task" aria-label="Editar ${escapeHTML(task.title)}">···</button></div>
            <h4>${escapeHTML(task.title)}</h4>
            ${task.notes ? `<p>${escapeHTML(task.notes)}</p>` : ""}
            <div class="kanban-card-meta"><span class="priority-pill priority-${escapeHTML(task.priority)}">${priorityLabel(task.priority)}</span><span>${task.dueDate ? escapeHTML(taskDueInfo(task).replace(/<[^>]*>/g, "")) : task.scheduledDate ? escapeHTML(taskScheduleLabel(task)) : "Sin fecha"}</span><span>◷ ${Number(task.estimatedMinutes) || 25} min</span></div>
            <div class="kanban-card-footer"><button type="button" data-action="toggle-task" aria-pressed="${task.completed}">${task.completed ? "↶ Reabrir" : "✓ Completar"}</button><label class="kanban-status-label"><span class="sr-only">Cambiar estado</span><select data-task-status="${escapeHTML(task.id)}" aria-label="Estado de ${escapeHTML(task.title)}"><option value="todo" ${column.id === "todo" ? "selected" : ""}>Por hacer</option><option value="inprogress" ${column.id === "inprogress" ? "selected" : ""}>En progreso</option><option value="done" ${column.id === "done" ? "selected" : ""}>Completada</option></select></label></div>
          </article>`).join("") : `<div class="kanban-empty">Suelta aquí una tarea</div>`}
      </div>
    </section>`).join("");
}

function setTaskStatus(taskId, status) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task || !["todo", "inprogress", "done"].includes(status)) return;
  const wasCompleted = task.completed;
  task.status = status;
  task.completed = status === "done";
  task.completedAt = task.completed ? (wasCompleted ? task.completedAt : new Date().toISOString()) : null;
  if (!task.completed) task.reminderSentAt = null;
  persistState();
  renderTasks();
  showToast(status === "done" ? "Tarea completada." : status === "inprogress" ? "Tarea en progreso." : "Tarea devuelta a pendientes.");
}

function renderTasks() {
  const query = (q("#taskSearch")?.value || "").trim().toLocaleLowerCase("es");
  const dateFilter = q("#taskDateFilter")?.value || "any";
  const today = localDateISO();
  const filtered = state.tasks.filter(task => {
    if (currentTaskFilter === "open" && task.completed) return false;
    if (currentTaskFilter === "done" && !task.completed) return false;
    if (query && !`${task.title} ${task.notes || ""} ${categoryLabel(task.category)}`.toLocaleLowerCase("es").includes(query)) return false;
    if (dateFilter === "today" && task.dueDate !== today && task.scheduledDate !== today) return false;
    if (dateFilter === "overdue" && (task.completed || !task.dueDate || task.dueDate >= today)) return false;
    if (dateFilter === "upcoming" && (task.completed || !((task.dueDate && task.dueDate > today) || (task.scheduledDate && task.scheduledDate > today)))) return false;
    if (dateFilter === "none" && (task.dueDate || task.scheduledDate)) return false;
    return true;
  }).sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    const aOverdue = !a.completed && a.dueDate && a.dueDate < today ? 0 : 1;
    const bOverdue = !b.completed && b.dueDate && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]);
  });

  q("#taskCountLabel").textContent = `${filtered.length} ${filtered.length === 1 ? "tarea" : "tareas"}`;
  q("#taskList").innerHTML = filtered.length
    ? filtered.map(task => taskRowHTML(task)).join("")
    : `<div class="empty-state empty-state-action"><span class="empty-state-symbol">✓</span><strong>${query || dateFilter !== "any" ? "No encontramos coincidencias." : currentTaskFilter === "done" ? "Aún no has completado tareas." : currentTaskFilter === "open" ? "No tienes tareas pendientes." : "Tu lista está despejada."}</strong><small>${query || dateFilter !== "any" ? "Prueba con otro término o cambia los filtros." : "Añade un pendiente cuando quieras organizar tu día."}</small>${query || dateFilter !== "any" || currentTaskFilter === "done" ? "" : `<button type="button" class="empty-state-cta" data-focus-task-input>Crear mi primera tarea <span>→</span></button>`}</div>`;
  q("#taskBoard").innerHTML = renderKanbanBoard(filtered);
  q("#taskListPanel").hidden = currentTaskView !== "list";
  q("#taskBoard").hidden = currentTaskView !== "board";
  qa("[data-task-view]").forEach(button => {
    const active = button.dataset.taskView === currentTaskView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  qa(".filter-tab").forEach(button => {
    const active = button.dataset.filter === currentTaskFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderDashboard();
  renderFocusTaskOptions();
  renderCalendar();
  updateCounters();
}

function addTask(title, priority = "medium", options = {}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return null;
  const dueDate = isValidISODate(options.dueDate) ? options.dueDate : "";
  const dueTime = isValidTime(options.dueTime) ? options.dueTime : "";
  const scheduledDate = isValidISODate(options.scheduledDate) ? options.scheduledDate : "";
  const scheduledTime = isValidTime(options.scheduledTime) ? options.scheduledTime : "";
  const estimatedMinutes = Math.max(5, Math.min(480, Number(options.estimatedMinutes) || 25));
  const validationMessage = taskDateValidationMessage(dueDate, dueTime, scheduledDate, scheduledTime, estimatedMinutes);
  if (validationMessage) { showToast(validationMessage); return null; }
  const task = {
    id: uid(),
    title: cleanTitle.slice(0, 120),
    priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
    category: options.category || "personal",
    dueDate,
    dueTime,
    scheduledDate,
    scheduledTime,
    reminderSentKeys: [],
    estimatedMinutes,
    notes: options.notes || "",
    status: options.status === "inprogress" ? "inprogress" : "todo",
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString()
  };
  state.tasks.unshift(task);
  persistState();
  renderTasks();
  showToast("Tarea añadida a tu lista.");
  return task;
}

function openTaskEditor(taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  q("#editTaskId").value = task.id;
  q("#editTaskTitle").value = task.title;
  q("#editTaskPriority").value = task.priority || "medium";
  q("#editTaskCategory").value = task.category || "personal";
  q("#editTaskDueDate").value = task.dueDate || "";
  if (q("#editTaskDueTime")) q("#editTaskDueTime").value = task.dueTime || "";
  if (q("#editTaskScheduleDate")) q("#editTaskScheduleDate").value = task.scheduledDate || "";
  if (q("#editTaskScheduleTime")) q("#editTaskScheduleTime").value = task.scheduledTime || "";
  q("#editTaskEstimate").value = String(task.estimatedMinutes || 25);
  q("#editTaskNotes").value = task.notes || "";
  q("#taskDialog").showModal();
  window.setTimeout(() => q("#editTaskTitle").focus(), 40);
}

function handleTaskAction(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const row = actionButton.closest("[data-task-id]");
  if (!row) return;
  const task = state.tasks.find(item => item.id === row.dataset.taskId);
  if (!task) return;

  if (actionButton.dataset.action === "toggle-task") {
    task.completed = !task.completed;
    task.status = task.completed ? "done" : "todo";
    task.completedAt = task.completed ? new Date().toISOString() : null;
    showToast(task.completed ? "Un pendiente menos." : "Tarea devuelta a pendientes.");
  } else if (actionButton.dataset.action === "delete-task") {
    if (!window.confirm(`Eliminar la tarea "${task.title}"?`)) return;
    state.tasks = state.tasks.filter(item => item.id !== task.id);
    showToast("Tarea eliminada.");
  } else if (actionButton.dataset.action === "edit-task") {
    openTaskEditor(task.id);
    return;
  }
  persistState();
  renderTasks();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateIdeas(formData) {
  lastIdeaFormValues = Object.fromEntries(formData.entries());
  const category = formData.get("category");
  const availableTime = Number(formData.get("time"));
  const budget = Number(formData.get("budget"));
  const context = String(formData.get("context") || "").trim();
  const pool = (ideaCatalog[category] || []).filter(idea => idea.time <= availableTime && idea.cost <= budget);
  const selected = shuffle(pool).slice(0, 3);
  generatedIdeas = selected.map(idea => ({ ...idea, id: uid(), category, context }));
  renderGeneratedIdeas();
  q("#regenerateIdeasBtn").disabled = pool.length < 2;
}

function renderGeneratedIdeas() {
  const titleMap = {
    organizacion: "Ideas para organizarte mejor", estudio: "Ideas para aprender con intención",
    trabajo: "Ideas para impulsar tus proyectos", bienestar: "Ideas para cuidar tu bienestar",
    tiempo: "Ideas para disfrutar tu tiempo", comidas: "Ideas para resolver tus comidas",
    regalos: "Ideas para sorprender"
  };
  const category = q("#ideaCategory").value;
  q("#ideaResultsTitle").textContent = titleMap[category] || "Ideas para ti";
  q("#ideaResultsCount").textContent = generatedIdeas.length;
  q("#ideaResults").innerHTML = generatedIdeas.length ? generatedIdeas.map(idea => {
    const saved = state.ideas.some(item => item.title === idea.title);
    const contextText = idea.context ? ` Ten en cuenta: ${escapeHTML(idea.context)}` : "";
    return `
      <article class="idea-card idea-card-${escapeHTML(idea.category || "general")}">
        <div class="idea-card-top"><span class="idea-card-icon">${escapeHTML(idea.icon)}</span><span class="idea-meta"><span>◷ ${idea.time} min</span><span>•</span><span>${idea.cost === 0 ? "Gratis" : "Bajo costo"}</span></span></div>
        <h4>${escapeHTML(idea.title)}</h4>
        <p>${escapeHTML(idea.description)}${contextText}</p>
        <div class="idea-card-footer"><span class="idea-tag">${escapeHTML(idea.tag)}</span><div class="idea-card-actions"><button class="idea-detail-btn" type="button" data-open-generated-idea="${escapeHTML(idea.id)}">Detalle</button><button class="save-idea-btn" type="button" data-save-idea="${escapeHTML(idea.id)}" ${saved ? "disabled" : ""}>${saved ? "Guardada" : "Guardar"}</button><button class="idea-task-btn" type="button" data-idea-task="${escapeHTML(idea.id)}" title="Convertir en tarea">A mi día +</button></div></div>
      </article>`;
  }).join("") : `<div class="empty-ideas"><strong>No encontramos ideas con esos límites.</strong><p>Amplía el tiempo o el presupuesto para descubrir más alternativas. No mostraremos opciones que no cumplan lo que indicaste.</p></div>`;
}

function saveIdea(ideaId) {
  const idea = generatedIdeas.find(item => item.id === ideaId);
  if (!idea || state.ideas.some(item => item.title === idea.title)) return;
  state.ideas.unshift({ ...idea, favorite: false, savedAt: new Date().toISOString() });
  persistState();
  renderGeneratedIdeas();
  renderSavedIdeas();
  renderDashboard();
  showToast("Idea guardada en tu colección.");
}

function renderSavedIdeas() {
  const query = savedIdeasQuery.trim().toLocaleLowerCase("es");
  const filtered = state.ideas.filter(idea => {
    const matchesQuery = !query || `${idea.title} ${idea.description} ${idea.tag || ""}`.toLocaleLowerCase("es").includes(query);
    const matchesFilter = savedIdeasFilter === "all" || (savedIdeasFilter === "favorites" ? Boolean(idea.favorite) : idea.category === savedIdeasFilter);
    return matchesQuery && matchesFilter;
  });
  qa("[data-idea-filter]").forEach(button => {
    const active = button.dataset.ideaFilter === savedIdeasFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  q("#savedIdeas").innerHTML = filtered.length
    ? filtered.map((idea, index) => `
      <article class="saved-idea-card saved-idea-${escapeHTML(idea.category || "general")}">
        <div class="saved-idea-top"><span class="saved-idea-category">${escapeHTML(idea.tag || "Idea")}</span><button class="idea-favorite-button ${idea.favorite ? "is-favorite" : ""}" type="button" data-toggle-favorite="${escapeHTML(idea.id)}" aria-label="${idea.favorite ? "Quitar de favoritas" : "Marcar como favorita"}" aria-pressed="${Boolean(idea.favorite)}">${idea.favorite ? "★" : "☆"}</button></div>
        <strong>${escapeHTML(idea.title)}</strong>
        <p>${escapeHTML(idea.description)}</p>
        <div class="saved-idea-meta"><span>◷ ${Number(idea.time) || 15} min</span><span>${Number(idea.cost) === 0 ? "Gratis" : "Con presupuesto"}</span></div>
        <div class="saved-idea-actions"><button type="button" data-open-saved-idea="${escapeHTML(idea.id)}">Ver detalle</button><button type="button" data-saved-idea-task="${escapeHTML(idea.id)}">A mi día +</button><button type="button" data-remove-idea="${escapeHTML(idea.id)}">Quitar</button></div>
      </article>`).join("")
    : `<div class="empty-saved"><span>✦</span><strong>${state.ideas.length ? "No hay ideas para este filtro." : "Tu colección está esperando inspiración."}</strong><small>${state.ideas.length ? "Prueba otra categoría o cambia tu búsqueda." : "Guarda una propuesta del generador y aparecerá aquí."}</small></div>`;
}

function parseLines(value) {
  return value.split(/\n|,/).map(item => item.trim()).filter(Boolean).slice(0, 6);
}

function buildDecisionMatrix(title, options, criteria) {
  currentDecision = { id: uid(), title, options, criteria };
  q("#decisionResult").classList.add("hidden");
  const wrapper = q("#decisionMatrix");
  wrapper.innerHTML = `
    <div class="matrix-table" style="--criteria-count:${criteria.length}">
      <div class="matrix-header">
        <div class="matrix-cell">ALTERNATIVA</div>
        ${criteria.map((criterion, index) => `<div class="matrix-cell"><span>${escapeHTML(criterion)}</span><label class="sr-only" for="weight-${index}">Importancia de ${escapeHTML(criterion)}</label><select id="weight-${index}" data-weight="${index}"><option value="1">Peso bajo</option><option value="2" selected>Peso medio</option><option value="3">Peso alto</option></select></div>`).join("")}
      </div>
      ${options.map((option, optionIndex) => `
        <div class="matrix-row">
          <div class="matrix-option">${escapeHTML(option)}</div>
          ${criteria.map((criterion, criterionIndex) => `
            <div class="matrix-cell"><label class="sr-only" for="score-${optionIndex}-${criterionIndex}">Puntuación de ${escapeHTML(option)} en ${escapeHTML(criterion)}</label>
              <select id="score-${optionIndex}-${criterionIndex}" data-score-option="${optionIndex}" data-score-criterion="${criterionIndex}">
                <option value="1">1 · Bajo</option><option value="2">2</option><option value="3" selected>3 · Medio</option><option value="4">4</option><option value="5">5 · Alto</option>
              </select>
            </div>`).join("")}
        </div>`).join("")}
    </div>`;
  q("#decisionMatrixPanel").classList.remove("hidden");
  q("#decisionMatrixPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function calculateDecision() {
  if (!currentDecision) return;
  const weights = currentDecision.criteria.map((_, index) => Number(q(`[data-weight="${index}"]`).value));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const ranking = currentDecision.options.map((option, optionIndex) => {
    const weightedTotal = currentDecision.criteria.reduce((sum, _, criterionIndex) => {
      const score = Number(q(`[data-score-option="${optionIndex}"][data-score-criterion="${criterionIndex}"]`).value);
      return sum + score * weights[criterionIndex];
    }, 0);
    return { option, score: weightedTotal / totalWeight };
  }).sort((a, b) => b.score - a.score);

  const top = ranking[0];
  const tied = ranking.filter(item => Math.abs(item.score - top.score) < 0.0001);
  const isTie = tied.length > 1;
  const winnerLabel = isTie ? tied.map(item => item.option).join(" / ") : top.option;
  const record = {
    id: currentDecision.id,
    title: currentDecision.title,
    winner: winnerLabel,
    tie: isTie,
    score: Number(top.score.toFixed(2)),
    options: ranking,
    createdAt: new Date().toISOString()
  };
  state.decisions = [record, ...state.decisions.filter(item => item.id !== record.id)].slice(0, 12);
  persistState();
  q("#decisionResult").innerHTML = `
    <h4>${isTie ? `Hay un empate entre: ${escapeHTML(winnerLabel)}` : `Tu alternativa mejor valorada es: ${escapeHTML(top.option)}`}</h4>
    <p>${isTie ? "Las alternativas obtuvieron la misma puntuación ponderada. Revisa qué criterio cualitativo puede ayudarte a desempatar." : "Según las puntuaciones y la importancia que asignaste a cada criterio. Tómalo como una guía para reflexionar, no como una respuesta automática."}</p>
    <div class="result-ranking">
      ${ranking.map((item, index) => `<div class="result-rank-row"><div class="result-rank-line"><em>${index + 1}.</em><strong>${escapeHTML(item.option)}</strong><span>${item.score.toFixed(2)} / 5</span></div><div class="result-rank-track"><i style="width:${Math.max(0, Math.min(100, item.score * 20))}%"></i></div></div>`).join("")}
    </div>`;
  q("#decisionResult").classList.remove("hidden");
  renderDecisionHistory();
  showToast("Comparación lista. Revisa el resultado con calma.");
}

function renderDecisionHistory() {
  q("#decisionHistory").innerHTML = state.decisions.length
    ? state.decisions.slice(0, 4).map(item => `
      <div class="history-item">
        <span class="history-icon">◎</span>
        <div class="history-copy"><strong>${escapeHTML(item.title)}</strong><span>Mejor valorada: ${escapeHTML(item.winner)}</span></div>
        <span class="history-score">${Number(item.score).toFixed(1)}</span>
      </div>`).join("")
    : `<div class="empty-state">Tus comparaciones aparecerán aquí cuando analices una decisión.</div>`;
}

function inferGoalType(goal) {
  const normalized = String(goal || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rules = [
    { key: "study", label: "Estudio y aprendizaje", words: ["estudi", "examen", "aprender", "curso", "ingles", "idioma", "leer", "certificacion", "universidad"] },
    { key: "work", label: "Trabajo y proyectos", words: ["proyecto", "trabajo", "negocio", "emprend", "vender", "cliente", "marca", "informe", "empresa"] },
    { key: "wellbeing", label: "Bienestar y hábitos", words: ["salud", "ejercicio", "entren", "dormir", "bienestar", "hábito", "caminar", "medit", "correr"] },
    { key: "finance", label: "Finanzas personales", words: ["ahorrar", "dinero", "presupuesto", "deuda", "finanzas", "gastar", "inversion"] },
    { key: "home", label: "Hogar y organizacion", words: ["ordenar", "limpiar", "organizar", "casa", "habitacion", "mudanza", "espacio"] }
  ];
  return rules.find(rule => rule.words.some(word => normalized.includes(word))) || { key: "general", label: "Objetivo personal" };
}

function createPlan(goal, durationDays, dailyMinutes) {
  const goalType = inferGoalType(goal);
  const templates = {
    study: [
      ["Define el tema y el resultado", "Especifica que contenidos necesitas dominar y como comprobaras que los aprendiste."],
      ["Divide el contenido en bloques", "Organiza los temas en sesiones cortas y asigna tiempo a cada uno."],
      ["Estudia de forma activa", "Usa preguntas, ejercicios, explicaciones en voz alta y ejemplos."],
      ["Haz una practica de comprobacion", "Resuelve preguntas sin consultar apuntes e identifica tus vacios."],
      ["Refuerza y repasa", "Dedica el tiempo restante a los temas que mas dificultad te generaron."]
    ],
    work: [
      ["Define el resultado entregable", "Describe que debe quedar terminado y como sabras que cumple su objetivo."],
      ["Divide el proyecto en entregables", "Convierte el resultado en tareas pequenas, observables y ordenadas."],
      ["Reune recursos y dependencias", "Identifica herramientas, informacion y personas que necesitas."],
      ["Construye una primera version", "Completa el entregable mas importante y solicita una revision temprana."],
      ["Evalua y ajusta", "Revisa resultados, pendientes y siguientes decisiones antes de cerrar."]
    ],
    wellbeing: [
      ["Elige un cambio pequeno y medible", "Define una accion realista que puedas repetir sin exigirte de mas."],
      ["Asocia la acción a un momento", "Elige una hora o actividad cotidiana que te ayude a recordar el nuevo hábito."],
      ["Prepara el entorno", "Deja listos los elementos que facilitan empezar y reduce las barreras."],
      ["Practica con constancia flexible", "Cumple una versión pequeña de la accion y adapta la intensidad a tu día."],
      ["Revisa como te sientes", "Observa que funciono, que fue dificil y que ajuste necesitas para continuar."]
    ],
    finance: [
      ["Haz una fotografia de tu situacion", "Registra ingresos, gastos fijos, gastos variables y compromisos actuales."],
      ["Define una meta concreta", "Establece un valor, una fecha y una razon para alcanzar tu objetivo."],
      ["Organiza un presupuesto sencillo", "Asigna límites realistas y prioriza los gastos esenciales."],
      ["Aplica un primer ajuste", "Elige un gasto que puedas optimizar o una cantidad pequena que puedas reservar."],
      ["Revisa tus numeros", "Compara lo planeado con lo real y ajusta el siguiente periodo."]
    ],
    home: [
      ["Elige un espacio y un resultado", "Define una zona concreta y como quieres que quede al terminar."],
      ["Clasifica lo que tienes", "Separa lo que conservas, reubicas, donas o descartas."],
      ["Prepara herramientas y lugares", "Asigna un sitio claro a cada cosa y deja a mano lo que usas mas."],
      ["Completa una zona a la vez", "Trabaja por secciones pequenas para evitar desordenar todo al mismo tiempo."],
      ["Crea una rutina de mantenimiento", "Reserva unos minutos para conservar el orden que conseguiste."]
    ],
    general: [
      ["Aclara el resultado que buscas", "Describe como sabras que has conseguido tu objetivo."],
      ["Divide el objetivo en acciones", "Identifica tareas concretas y ordenalas por importancia."],
      ["Prepara tu espacio y recursos", "Reune lo que necesitas y reserva un momento realista para avanzar."],
      ["Da el primer paso", "Completa una accion pequena y registra lo que aprendiste."],
      ["Revisa y ajusta el camino", "Evalua tu avance, reconoce lo que funciono y modifica lo que haga falta."]
    ]
  };
  const stepTemplates = templates[goalType.key] || templates.general;
  const steps = stepTemplates.map((template, index) => ({
    id: uid(),
    title: template[0],
    description: template[1],
    dueDay: Math.max(1, Math.round(durationDays * (index + 1) / stepTemplates.length)),
    completed: false
  }));
  return {
    id: uid(),
    goal,
    goalType: goalType.key,
    goalTypeLabel: goalType.label,
    durationDays,
    dailyMinutes,
    steps,
    createdAt: new Date().toISOString()
  };
}

function renderPlans() {
  const activeCount = state.plans.filter(plan => !plan.steps.every(step => step.completed)).length;
  q("#planTotal").textContent = `${state.plans.length} ${state.plans.length === 1 ? "plan" : "planes"}`;
  q("#plansList").innerHTML = state.plans.length
    ? state.plans.map(plan => {
      const done = plan.steps.filter(step => step.completed).length;
      const total = Math.max(1, plan.steps.length);
      const percent = Math.round(done / total * 100);
      const finished = percent === 100;
      return `
        <article class="plan-card" data-plan-id="${escapeHTML(plan.id)}">
          <div class="plan-card-top"><h4>${escapeHTML(plan.goal)}</h4><div class="plan-card-actions"><span class="plan-status">${finished ? "Completado" : "En marcha"}</span><button type="button" class="plan-delete" data-delete-plan="${escapeHTML(plan.id)}" aria-label="Eliminar plan" title="Eliminar plan">&times;</button></div></div>
          <div class="plan-meta"><span class="plan-type">${escapeHTML(plan.goalTypeLabel || "Objetivo personal")}</span><span>&#9711; ${plan.durationDays} días estimados</span><span>&#8984; ${plan.dailyMinutes} min al día</span><span>&#10022; ${done}/${plan.steps.length} pasos</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="progress-caption"><span>Progreso</span><span>${percent}%</span></div>
          <div class="plan-steps plan-timeline">
            ${plan.steps.map((step, index) => `
              <div class="plan-step ${step.completed ? "completed" : ""}" data-plan-step="${escapeHTML(step.id)}">
                <button class="timeline-step-number step-toggle ${step.completed ? "checked" : ""}" type="button" data-step-toggle="${escapeHTML(step.id)}" aria-label="${step.completed ? "Desmarcar paso" : "Completar paso"}" aria-pressed="${step.completed}">${String(index + 1).padStart(2, "0")}</button>
                <div class="plan-step-copy"><strong>${escapeHTML(step.title)}</strong><span>${escapeHTML(step.description)}</span><small>Hito · Día ${step.dueDay}</small></div>
                ${!step.completed ? `<button class="plan-step-action" type="button" data-add-step-task="${escapeHTML(step.id)}">Crear tarea +</button>` : `<span class="timeline-complete-mark">✓</span>`}
              </div>`).join("")}
          </div>
          <div class="plan-adapt">
            <label>Nuevo tiempo diario <input type="number" min="5" max="480" step="5" value="${plan.dailyMinutes}" data-adapt-input="${escapeHTML(plan.id)}" aria-label="Nuevo tiempo disponible en minutos" /> min</label>
            <button type="button" data-adapt-plan="${escapeHTML(plan.id)}">Adaptar plan &#8599;</button>
          </div>
        </article>`;
    }).join("")
    : `<div class="plan-empty">Todavía no tienes planes activos.<br />Crea tu primera ruta arriba y convierte tu objetivo en acciones concretas.</div>`;
  q("#plansStat").textContent = activeCount;
  q("#navPlanCount").textContent = activeCount;
  renderDashboardPlans();
}

function adaptPlan(planId) {
  const plan = state.plans.find(item => item.id === planId);
  const input = q(`[data-adapt-input="${planId}"]`);
  if (!plan || !input) return;
  const newMinutes = Number(input.value);
  if (!Number.isFinite(newMinutes) || newMinutes < 5 || newMinutes > 480) {
    showToast("Escribe un tiempo entre 5 y 480 minutos.");
    return;
  }
  const oldDuration = plan.durationDays;
  const newDuration = Math.max(1, Math.ceil(oldDuration * plan.dailyMinutes / newMinutes));
  plan.steps.forEach(step => {
    step.dueDay = Math.max(1, Math.ceil(step.dueDay / oldDuration * newDuration));
  });
  plan.durationDays = newDuration;
  plan.dailyMinutes = newMinutes;
  persistState();
  renderPlans();
  showToast(`Plan adaptado a ${newMinutes} minutos diarios.`);
}

function addPlanStepAsTask(stepId, planId) {
  const plan = state.plans.find(item => item.id === planId);
  const step = plan?.steps.find(item => item.id === stepId);
  if (!plan || !step) return;

  // The step day is relative to the plan start date, not the day it is added to Mi día.
  const planStart = plan.createdAt ? new Date(plan.createdAt) : new Date();
  const due = new Date(planStart.getFullYear(), planStart.getMonth(), planStart.getDate());
  due.setDate(due.getDate() + Math.max(0, step.dueDay - 1));
  const categoryByGoal = {
    study: "study", work: "work", finance: "work", home: "home", wellbeing: "wellbeing"
  };
  const task = addTask(`${step.title} - ${plan.goal}`, "medium", {
    category: categoryByGoal[plan.goalType] || "personal",
    dueDate: localDateISO(due),
    estimatedMinutes: Math.min(120, plan.dailyMinutes)
  });
  if (task) showView("tasks");
}

function renderFocusTaskOptions() {
  const select = q("#focusTaskSelect");
  if (!select) return;
  const selected = select.value;
  const pending = state.tasks.filter(task => !task.completed);
  select.innerHTML = `<option value="">Sesion libre</option>` + pending.map(task => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.title)}</option>`).join("");
  if (pending.some(task => task.id === selected)) select.value = selected;
}

function updateFocusClock() {
  const minutes = Math.floor(focusSecondsRemaining / 60).toString().padStart(2, "0");
  const seconds = (focusSecondsRemaining % 60).toString().padStart(2, "0");
  q("#focusClock").textContent = `${minutes}:${seconds}`;
  q("#focusProgress").style.width = `${Math.max(0, Math.min(100, (1 - focusSecondsRemaining / focusTotalSeconds) * 100))}%`;
  q("#focusStartBtn").textContent = focusRunning ? "Pausar" : focusSecondsRemaining === 0 ? "Iniciar de nuevo" : "Iniciar";
  q("#focusModeLabel").textContent = focusMode === "focus" ? "Enfoque · 25 min" : "Descanso · 5 min";
}

function completeFocusBlock() {
  const finishedMode = focusMode;
  const selectedTask = state.tasks.find(task => task.id === q("#focusTaskSelect").value);
  if (finishedMode === "focus") {
    if (focusSessionDate !== localDateISO()) {
      focusSessionDate = localDateISO();
      focusSessionsToday = 0;
    }
    focusSessionsToday += 1;
    safeStorageSet("desenreda-focus-date", focusSessionDate);
    safeStorageSet("desenreda-focus-sessions", String(focusSessionsToday));
    q("#focusSessionsToday").textContent = String(focusSessionsToday);
  }
  stopFocusTimer();
  focusMode = finishedMode === "focus" ? "break" : "focus";
  focusTotalSeconds = focusMode === "focus" ? 25 * 60 : 5 * 60;
  focusSecondsRemaining = focusTotalSeconds;
  q("#focusModeBtn").textContent = focusMode === "focus" ? "Cambiar a descanso" : "Volver a enfoque";
  updateFocusClock();
  showToast(finishedMode === "focus" ? `Bloque terminado${selectedTask ? `: ${selectedTask.title}` : ""}. Tu descanso de 5 minutos está listo.` : "Descanso terminado. Ya puedes iniciar otro bloque de enfoque.");
}

function refreshFocusTimer() {
  if (!focusRunning || !focusEndAt) return;
  focusSecondsRemaining = Math.max(0, Math.ceil((focusEndAt - Date.now()) / 1000));
  if (focusSecondsRemaining <= 0) {
    completeFocusBlock();
    return;
  }
  updateFocusClock();
}

function stopFocusTimer() {
  if (focusTimerInterval) window.clearInterval(focusTimerInterval);
  focusTimerInterval = null;
  focusEndAt = null;
  focusRunning = false;
  updateFocusClock();
}

function startFocusTimer() {
  if (focusRunning) {
    // Recalculate before pausing so background-tab throttling does not add time.
    refreshFocusTimer();
    if (!focusRunning) return;
    stopFocusTimer();
    return;
  }
  if (focusSecondsRemaining <= 0) focusSecondsRemaining = focusTotalSeconds;
  focusRunning = true;
  focusEndAt = Date.now() + focusSecondsRemaining * 1000;
  updateFocusClock();
  focusTimerInterval = window.setInterval(refreshFocusTimer, 1000);
}

function resetFocusTimer() {
  stopFocusTimer();
  focusSecondsRemaining = focusTotalSeconds;
  updateFocusClock();
}

function toggleFocusMode() {
  stopFocusTimer();
  focusMode = focusMode === "focus" ? "break" : "focus";
  focusTotalSeconds = focusMode === "focus" ? 25 * 60 : 5 * 60;
  focusSecondsRemaining = focusTotalSeconds;
  q("#focusModeBtn").textContent = focusMode === "focus" ? "Cambiar a descanso" : "Volver a enfoque";
  updateFocusClock();
}

async function toggleFocusFullscreen() {
  const target = q("#view-focus");
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (target.requestFullscreen) await target.requestFullscreen();
    else target.classList.toggle("focus-immersive-fallback");
  } catch (error) {
    target.classList.toggle("focus-immersive-fallback");
    showToast("Se activó el modo inmersivo dentro de la página.");
  }
  updateFocusFullscreenButton();
}

function updateFocusFullscreenButton() {
  const button = q("#focusFullscreenBtn");
  if (!button) return;
  const active = Boolean(document.fullscreenElement) || q("#view-focus").classList.contains("focus-immersive-fallback");
  button.innerHTML = active ? "<span>⤢</span> Salir de pantalla completa" : "<span>⛶</span> Pantalla completa";
  button.setAttribute("aria-pressed", String(active));
}

function toggleTheme() {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = next;
  safeStorageSet("desenreda-theme", next);
  q("#themeToggle").setAttribute("aria-label", next === "dark" ? "Activar tema claro" : "Activar tema oscuro");
  q("#themeToggle").title = next === "dark" ? "Activar tema claro" : "Activar tema oscuro";
}

function openSearch() {
  const settingsDialog = q("#settingsDialog");
  if (settingsDialog?.open) settingsDialog.close();
  const dialog = q("#searchDialog");
  if (!dialog.open) dialog.showModal();
  q("#globalSearchInput").value = "";
  renderGlobalSearch();
  window.setTimeout(() => q("#globalSearchInput").focus(), 50);
}

function renderGlobalSearch() {
  const query = q("#globalSearchInput").value.trim().toLocaleLowerCase("es");
  const results = q("#globalSearchResults");
  if (query.length < 2) {
    results.innerHTML = `<p class="empty-state">Escribe al menos dos caracteres para buscar.</p>`;
    return;
  }
  const matches = [];
  state.tasks.forEach(task => {
    if (`${task.title} ${task.notes || ""}`.toLocaleLowerCase("es").includes(query)) matches.push({ type: "task", id: task.id, title: task.title, detail: `Tarea · ${task.completed ? "Completada" : "Pendiente"}`, view: "tasks" });
  });
  state.ideas.forEach(idea => {
    if (`${idea.title} ${idea.description || ""}`.toLocaleLowerCase("es").includes(query)) matches.push({ type: "idea", id: idea.id, title: idea.title, detail: "Idea guardada", view: "ideas" });
  });
  state.plans.forEach(plan => {
    if (`${plan.goal} ${plan.steps.map(step => step.title).join(" ")}`.toLocaleLowerCase("es").includes(query)) matches.push({ type: "plan", id: plan.id, title: plan.goal, detail: "Plan personal", view: "plans" });
  });
  state.decisions.forEach(decision => {
    if (`${decision.title} ${decision.winner}`.toLocaleLowerCase("es").includes(query)) matches.push({ type: "decision", id: decision.id, title: decision.title, detail: `Decision · ${decision.winner}`, view: "decisions" });
  });
  results.innerHTML = matches.length ? matches.slice(0, 10).map(item => `
    <button class="global-search-result" type="button" data-search-view="${item.view}" data-search-type="${item.type}" data-search-id="${escapeHTML(item.id)}">
      <span class="search-result-icon">${item.type === "task" ? "&#10003;" : item.type === "idea" ? "&#10022;" : item.type === "plan" ? "&#8599;" : "&#9678;"}</span>
      <span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></span><span class="search-result-arrow">&#8599;</span>
    </button>`).join("") : `<p class="empty-state">No encontramos resultados para "${escapeHTML(query)}".</p>`;
}

function openSearchResult(button) {
  const { searchView, searchType, searchId } = button.dataset;
  q("#searchDialog").close();
  showView(searchView);
  if (searchType === "task") {
    const task = state.tasks.find(item => item.id === searchId);
    if (task) openTaskEditor(searchId);
  } else if (searchType === "plan") {
    window.setTimeout(() => q(`[data-plan-id="${CSS.escape(searchId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  } else if (searchType === "idea") {
    window.setTimeout(() => q(".saved-ideas-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  } else if (searchType === "decision") {
    window.setTimeout(() => q(".decision-history")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function exportBackup() {
  const payload = {
    app: "DESENREDA", version: 4, exportedAt: new Date().toISOString(), data: state,
    assistantMessages: assistantMessages.slice(-40),
    preferences: {
      theme: safeStorageGet("desenreda-theme") || "light",
      taskView: safeStorageGet("desenreda-task-view") || "list",
      focusDate: safeStorageGet("desenreda-focus-date") || localDateISO(),
      focusSessions: safeStorageGet("desenreda-focus-sessions") || "0",
      notificationsEnabled: safeStorageGet("desenreda-notifications-enabled") === "true"
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `desenreda-respaldo-${localDateISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast("Respaldo descargado correctamente.");
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast("El archivo supera el límite de 2 MB.");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const rawData = parsed.data || parsed;
    const hasCollections = ["tasks", "ideas", "plans", "decisions"].some(key => Array.isArray(rawData?.[key]));
    if (!hasCollections) throw new Error("Invalid backup structure");
    const imported = sanitizeState(rawData);
    const itemCount = imported.tasks.length + imported.ideas.length + imported.plans.length + imported.decisions.length;
    if (!itemCount && !window.confirm("El respaldo está vacío. ¿Quieres reemplazar tus datos actuales?")) return;
    if (!window.confirm("Importar este respaldo reemplazará los datos guardados en este dispositivo. ¿Deseas continuar?")) return;
    state = imported;
    if (Array.isArray(parsed.assistantMessages)) {
      assistantMessages = parsed.assistantMessages.filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-40).map(item => ({
        role: item.role, content: item.content.slice(0, 5000), createdAt: item.createdAt || null,
        actions: Array.isArray(item.actions) ? item.actions.slice(0, 3) : [],
        followUps: Array.isArray(item.followUps) ? item.followUps.slice(0, 2) : []
      }));
      saveAssistantMessages();
    }
    const preferences = parsed.preferences && typeof parsed.preferences === "object" ? parsed.preferences : {};
    if (["light", "dark"].includes(preferences.theme)) {
      safeStorageSet("desenreda-theme", preferences.theme);
      document.body.dataset.theme = preferences.theme;
      if (q("#themeToggle")) {
        q("#themeToggle").setAttribute("aria-label", preferences.theme === "dark" ? "Activar tema claro" : "Activar tema oscuro");
        q("#themeToggle").title = preferences.theme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
      }
    }
    if (["list", "board"].includes(preferences.taskView)) {
      currentTaskView = preferences.taskView;
      safeStorageSet("desenreda-task-view", currentTaskView);
    }
    if (isValidISODate(preferences.focusDate)) {
      focusSessionDate = preferences.focusDate;
      safeStorageSet("desenreda-focus-date", preferences.focusDate);
    }
    if (/^\d+$/.test(String(preferences.focusSessions || ""))) {
      focusSessionsToday = Math.min(9999, Number(preferences.focusSessions));
      safeStorageSet("desenreda-focus-sessions", String(focusSessionsToday));
      q("#focusSessionsToday").textContent = String(focusSessionsToday);
    }
    safeStorageSet("desenreda-notifications-enabled", preferences.notificationsEnabled === true ? "true" : "false");
    persistState();
    renderAll();
    renderAssistant();
    updateNotificationPermissionUI();
    showToast("Respaldo importado con datos, conversación y preferencias locales.");
  } catch (error) {
    console.warn("No se pudo importar el respaldo", error);
    showToast("El archivo no es un respaldo válido de DESENREDA.");
  }
}

function ideaCategoryLabel(category) {
  return ({ organizacion: "Organización", estudio: "Estudio", trabajo: "Trabajo", bienestar: "Bienestar", tiempo: "Tiempo libre", comidas: "Comidas", regalos: "Regalos" })[category] || "Idea personal";
}

function openIdeaDetail(ideaId, saved = false) {
  const source = saved ? state.ideas : generatedIdeas;
  const idea = source.find(item => item.id === ideaId);
  if (!idea) return;
  const alreadySaved = state.ideas.some(item => item.title === idea.title);
  q("#ideaDetailContent").innerHTML = `
    <div class="dialog-heading"><div><span class="panel-kicker">DETALLE DE LA IDEA</span><h2 id="ideaDetailTitle">${escapeHTML(idea.title)}</h2></div><button class="dialog-close" type="button" data-close-dialog="ideaDetailDialog" aria-label="Cerrar">&times;</button></div>
    <div class="idea-detail-hero idea-card-${escapeHTML(idea.category || "general")}"><span class="idea-detail-symbol">${escapeHTML(idea.icon || "✦")}</span><div><span>${escapeHTML(ideaCategoryLabel(idea.category))}</span><strong>${escapeHTML(idea.tag || "Posibilidad para explorar")}</strong></div></div>
    <p class="idea-detail-description">${escapeHTML(idea.description)}</p>
    ${idea.context ? `<div class="idea-detail-context"><strong>Lo que quieres tener en cuenta</strong><p>${escapeHTML(idea.context)}</p></div>` : ""}
    <div class="idea-detail-metrics"><span><small>Tiempo estimado</small><strong>◷ ${Number(idea.time) || 15} min</strong></span><span><small>Presupuesto</small><strong>${Number(idea.cost) === 0 ? "Gratis" : Number(idea.cost) === 1 ? "Bajo costo" : "Flexible"}</strong></span></div>
    <div class="dialog-actions"><button class="button button-ghost" type="button" data-close-dialog="ideaDetailDialog">Cerrar</button><button class="button button-ghost" type="button" data-detail-save="${escapeHTML(idea.id)}" data-detail-source="${saved ? "saved" : "generated"}" ${alreadySaved ? "disabled" : ""}>${alreadySaved ? "Ya está guardada" : "Guardar idea"}</button><button class="button button-primary" type="button" data-detail-task="${escapeHTML(idea.id)}" data-detail-source="${saved ? "saved" : "generated"}">Convertir en tarea +</button></div>`;
  q("#ideaDetailDialog").showModal();
}

function addIdeaAsTask(ideaId, saved = false) {
  const source = saved ? state.ideas : generatedIdeas;
  const idea = source.find(item => item.id === ideaId);
  if (!idea) return;
  const taskCategory = ({ organizacion: "personal", estudio: "study", trabajo: "work", bienestar: "wellbeing", tiempo: "personal", comidas: "home", regalos: "personal" })[idea.category] || "personal";
  addTask(idea.title, "medium", { category: taskCategory, notes: idea.description || "", estimatedMinutes: idea.time || 25 });
  showView("tasks");
}

function saveTaskEdit() {
  const task = state.tasks.find(item => item.id === q("#editTaskId").value);
  if (!task) return;
  const title = q("#editTaskTitle").value.trim();
  if (!title) {
    showToast("Escribe un nombre para la tarea.");
    return;
  }
  const dueDate = isValidISODate(q("#editTaskDueDate").value) ? q("#editTaskDueDate").value : "";
  const dueTime = isValidTime(q("#editTaskDueTime")?.value || "") ? q("#editTaskDueTime").value : "";
  const scheduledDate = isValidISODate(q("#editTaskScheduleDate")?.value || "") ? q("#editTaskScheduleDate").value : "";
  const scheduledTime = isValidTime(q("#editTaskScheduleTime")?.value || "") ? q("#editTaskScheduleTime").value : "";
  const estimatedMinutes = Math.max(5, Math.min(480, Number(q("#editTaskEstimate").value) || 25));
  const validationMessage = taskDateValidationMessage(dueDate, dueTime, scheduledDate, scheduledTime, estimatedMinutes);
  if (validationMessage) { showToast(validationMessage); return; }
  task.title = title;
  task.priority = q("#editTaskPriority").value;
  task.category = q("#editTaskCategory").value;
  task.dueDate = dueDate;
  task.dueTime = dueTime;
  task.scheduledDate = scheduledDate;
  task.scheduledTime = scheduledTime;
  task.reminderSentAt = null;
  task.reminderSentKeys = [];
  task.estimatedMinutes = estimatedMinutes;
  task.notes = q("#editTaskNotes").value.trim();
  persistState();
  q("#taskDialog").close();
  renderTasks();
  showToast("Cambios guardados.");
}

function closeNotificationPopover() {
  const panel = q("#notificationPopover");
  const button = q("#notificationBtn");
  if (!panel || !button) return;
  panel.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

function loadAssistantMessages() {
  try {
    const raw = safeStorageGet("desenreda-assistant-history-v1");
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
      .slice(-40).map(item => ({
        role: item.role, content: item.content.slice(0, 5000),
        createdAt: item.createdAt || null,
        actions: Array.isArray(item.actions) ? item.actions.slice(0, 3).filter(action => action && ["view", "task"].includes(action.type)).map(action => ({
          type: action.type, view: String(action.view || "").slice(0, 32), title: String(action.title || "").slice(0, 120),
          label: String(action.label || "").slice(0, 80), used: Boolean(action.used)
        })) : [],
        followUps: Array.isArray(item.followUps) ? item.followUps.slice(0, 2).map(f => ({ label: String(f.label || "").slice(0, 60), prompt: String(f.prompt || "").slice(0, 240) })) : []
      }));
  } catch { return []; }
}

function saveAssistantMessages() {
  safeStorageSet("desenreda-assistant-history-v1", JSON.stringify(assistantMessages.slice(-40)));
}

function renderAssistant() {
  const container = q("#assistantMessages");
  if (!container) return;
  if (!assistantMessages.length) {
    container.innerHTML = `<div class="assistant-welcome-message">
      <span class="assistant-welcome-spark">✦</span>
      <span class="assistant-demo-label">TU ESPACIO PARA PENSAR</span>
      <strong>Hola, ¿qué te gustaría desenredar hoy?</strong>
      <p>Describe una situación o utiliza una sugerencia. Te responderé con consejos programados para tareas, estudio, ideas, decisiones y objetivos.</p>
      <div class="assistant-welcome-chips"><span>✦ Sin internet</span><span>✦ Sin claves</span><span>✦ Disponible siempre</span></div>
    </div>`;
  } else {
    container.innerHTML = assistantMessages.map((message, index) => {
      const actions = message.role === "assistant" && message.actions?.length ? `<div class="assistant-message-actions">${message.actions.map((action, actionIndex) => `<button type="button" data-assistant-action="${escapeHTML(action.type)}" data-assistant-message-index="${index}" data-assistant-action-index="${actionIndex}" ${action.used ? "disabled" : ""}>${escapeHTML(action.used ? "✓ Añadida" : action.label)}</button>`).join("")}</div>` : "";
      const chips = message.role === "assistant" && message.followUps?.length ? `<div class="assistant-reply-chips">${message.followUps.map(f => `<button type="button" data-assistant-prompt="${escapeHTML(f.prompt)}">${escapeHTML(f.label)} <span aria-hidden="true">↗</span></button>`).join("")}</div>` : "";
      return `<article class="assistant-message ${message.role === "user" ? "from-user" : "from-assistant"}">
        <span class="assistant-message-avatar">${message.role === "user" ? "Tú" : "✦"}</span>
        <div class="assistant-message-content"><span class="assistant-message-role">${message.role === "user" ? "TÚ" : "DESENREDA · DEMO"}</span>
        <p>${escapeHTML(message.content)}</p>${actions}${chips}</div></article>`;
    }).join("");
  }
  if (assistantRequestActive) {
    container.insertAdjacentHTML("beforeend", `<div class="assistant-typing" role="status" aria-label="DESENREDA está preparando una respuesta"><span class="assistant-message-avatar">✦</span><span class="typing-bubble"><i></i><i></i><i></i></span></div>`);
  }
  container.scrollTop = container.scrollHeight;
}

function getAssistantContext() {
  // Data is read locally and NEVER transmitted. Off by default for privacy.
  if (!q("#assistantContextToggle")?.checked) return null;
  return {
    pendingTasks: state.tasks.filter(task => !task.completed).slice(0, 30).map(task => ({
      title: task.title, priority: task.priority, category: task.category,
      dueDate: task.dueDate || null, dueTime: task.dueTime || null, scheduledDate: task.scheduledDate || null, scheduledTime: task.scheduledTime || null,
      estimatedMinutes: task.estimatedMinutes || 25, status: task.status
    })),
    activePlans: state.plans.filter(plan => !plan.steps.every(step => step.completed)).slice(0, 12).map(plan => ({
      goal: plan.goal, durationDays: plan.durationDays, dailyMinutes: plan.dailyMinutes,
      steps: plan.steps.map(step => ({ title: step.title, completed: step.completed, dueDay: step.dueDay }))
    })),
    savedIdeas: state.ideas.slice(0, 10).map(idea => ({ title: idea.title, category: idea.category }))
  };
}

function setAssistantStatus(label = "Simulación local · respuestas programadas") {
  const status = q("#assistantStatusText");
  const dot = q("#assistantStatusDot");
  if (status) status.textContent = label;
  if (dot) {
    dot.classList.remove("is-connected");
    dot.classList.add("is-simulated");
  }
}

function appendAssistantMessage(role, content, meta = {}) {
  assistantMessages.push({ role, content: String(content || "").slice(0, 5000),
    actions: Array.isArray(meta.actions) ? meta.actions.slice(0, 3) : [],
    followUps: Array.isArray(meta.followUps) ? meta.followUps.slice(0, 2) : [],
    createdAt: new Date().toISOString() });
  assistantMessages = assistantMessages.slice(-40);
  saveAssistantMessages();
  renderAssistant();
}

async function sendAssistantMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || assistantRequestActive) return;
  const simulator = window.DESENREDA_SIMULATOR;
  if (!simulator?.respond) {
    showToast("No se cargaron las respuestas programadas. Actualiza la aplicación.");
    return;
  }
  const history = assistantMessages.map(item => ({ role: item.role, content: item.content }));
  const context = getAssistantContext();
  const epoch = assistantConversationEpoch;
  appendAssistantMessage("user", message);
  assistantRequestActive = true;
  const sendButton = q("#assistantSendBtn");
  const input = q("#assistantInput");
  input.value = "";
  sendButton.disabled = true;
  sendButton.innerHTML = '<span>Respondiendo</span><b>✦</b>';
  renderAssistant();
  try {
    // Tiny deliberate pause for a comfortable conversational transition.
    await new Promise(resolve => window.setTimeout(resolve, 380));
    if (epoch !== assistantConversationEpoch) return;
    const reply = simulator.respond(message, context, history);
    assistantRequestActive = false;
    appendAssistantMessage("assistant", reply.reply, reply);
    setAssistantStatus();
  } catch (error) {
    assistantRequestActive = false;
    console.error("Error al generar una respuesta local:", error);
    appendAssistantMessage("assistant", "No pude preparar esa respuesta. Prueba con una pregunta sobre tareas, ideas, planes o decisiones.");
  } finally {
    assistantRequestActive = false;
    sendButton.disabled = false;
    sendButton.innerHTML = "<span>Enviar</span><b>↑</b>";
    renderAssistant();
    if (document.body.dataset.view === "assistant") input.focus();
  }
}

function handleAssistantMessageClick(event) {
  const chip = event.target.closest("[data-assistant-prompt]");
  if (chip) { sendAssistantMessage(chip.dataset.assistantPrompt); return; }
  const button = event.target.closest("[data-assistant-action]");
  if (!button) return;
  const index = Number(button.dataset.assistantMessageIndex);
  const actionIndex = Number(button.dataset.assistantActionIndex);
  const action = assistantMessages[index]?.actions?.[actionIndex];
  if (!action || action.used) return;
  if (action.type === "view") {
    if (viewCopy[action.view]) showView(action.view);
  } else if (action.type === "task" && action.title) {
    const task = addTask(action.title);
    if (task) { action.used = true; saveAssistantMessages(); renderAssistant(); }
  }
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function findAvailableSlot(dayTasks, duration, dateISO, latestFinish = "") {
  const slots = ["08:30", "09:30", "10:30", "11:30", "14:00", "15:00", "16:00", "17:00"];
  for (const slot of slots) {
    const start = Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3));
    if (dateISO === localDateISO() && start < (new Date().getHours() * 60 + new Date().getMinutes() + 10)) continue;
    const end = start + duration;
    if (end > 19 * 60) continue;
    const conflict = dayTasks.some(task => {
      const taskTime = task.scheduledTime || "";
      if (!task.scheduledDate || !taskTime) return false;
      const taskStart = Number(taskTime.slice(0, 2)) * 60 + Number(taskTime.slice(3));
      const taskEnd = taskStart + (Number(task.estimatedMinutes) || 25);
      return intervalsOverlap(start, end, taskStart, taskEnd);
    });
    if (!conflict) return slot;
  }
  return "";
}

function organizeWeek() {
  const dailyCapacity = Number(q("#smartDailyMinutes").value) || 120;
  const includeWeekends = q("#smartIncludeWeekends").checked;
  const pending = state.tasks.filter(task => !task.completed && (!task.scheduledDate || !task.scheduledTime)).sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priority[a.priority] - priority[b.priority];
    if (priorityDiff) return priorityDiff;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);
  });
  if (!pending.length) {
    q("#smartPlanResult").hidden = false;
    q("#smartPlanResult").innerHTML = `<strong>Tu lista ya está organizada.</strong><p>No encontramos tareas pendientes sin horario programado. Si quieres mover alguna, edítala desde Mi día.</p>`;
    return;
  }
  const start = new Date();
  const dailyLoad = new Map();
  state.tasks.filter(task => !task.completed && task.scheduledDate && task.scheduledTime).forEach(task => {
    const dayKey = task.scheduledDate;
    dailyLoad.set(dayKey, (dailyLoad.get(dayKey) || 0) + (Number(task.estimatedMinutes) || 25));
  });
  let scheduled = 0;
  const scheduledTasks = [];
  const unassigned = [];
  for (const task of pending) {
    const duration = Math.max(5, Math.min(480, Number(task.estimatedMinutes) || 25));
    let placed = false;
    const candidateDates = task.scheduledDate
      ? [new Date(`${task.scheduledDate}T12:00:00`)]
      : Array.from({ length: 21 }, (_, offset) => addCalendarDays(start, offset));
    for (const date of candidateDates) {
      const day = date.getDay();
      if (!includeWeekends && (day === 0 || day === 6)) continue;
      const iso = localDateISO(date);
      // Never schedule an item after its original deadline.
      if (task.dueDate && iso > task.dueDate) continue;
      const used = dailyLoad.get(iso) || 0;
      if (used + duration > dailyCapacity) continue;
      const dayTasks = state.tasks.filter(item => !item.completed && item.id !== task.id && item.scheduledDate === iso && item.scheduledTime);
      const latestFinish = task.dueDate === iso ? task.dueTime : "";
      const time = findAvailableSlot(dayTasks, duration, iso, latestFinish);
      if (!time) continue;
      task.scheduledDate = iso;
      task.scheduledTime = time;
      task.scheduledByAssistant = true;
      task.reminderSentAt = null;
      dailyLoad.set(iso, used + duration);
      scheduled++;
      scheduledTasks.push(task);
      placed = true;
      break;
    }
    if (!placed) unassigned.push(task.title);
  }
  persistState();
  renderAll();
  renderAssistantPlanResult(scheduledTasks, unassigned, dailyCapacity);
  showToast(`${scheduled} ${scheduled === 1 ? "tarea organizada" : "tareas organizadas"}.`);
}

function renderAssistantPlanResult(scheduledTasks, unassigned, dailyCapacity) {
  const result = q("#smartPlanResult");
  result.hidden = false;
  const tasks = scheduledTasks;
  const scheduled = tasks.length;
  result.innerHTML = `<div class="smart-result-heading"><strong>${scheduled} ${scheduled === 1 ? "tarea organizada" : "tareas organizadas"}</strong><span>${dailyCapacity} min/día</span></div>${tasks.map(task => `<div class="smart-result-row"><span>${escapeHTML(task.scheduledTime || "")}</span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(calendarDateLabel(new Date(`${task.scheduledDate}T12:00:00`), { weekday: "short", day: "numeric", month: "short" }))}</small></div>`).join("")}${unassigned.length ? `<p class="smart-result-warning">${unassigned.length} ${unassigned.length === 1 ? "tarea quedó" : "tareas quedaron"} sin programar porque no encontró un espacio que respete la capacidad diaria, los horarios y las fechas límite. Puedes ampliar tu disponibilidad o revisar sus vencimientos.</p>` : `<p class="smart-result-success">Se conservaron las fechas límite y los horarios existentes; solo se asignó un horario nuevo a tareas sin programación.</p>`}<button type="button" class="smart-result-link" data-go-view="calendar">Ver en mi agenda →</button>`;
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    q("#notificationPermissionStatus").textContent = "Este navegador no admite notificaciones del sistema.";
    return;
  }
  if (!window.isSecureContext) {
    q("#notificationPermissionStatus").textContent = "Abre DESENREDA mediante HTTPS o localhost para activar notificaciones.";
    return;
  }
  let permission;
  try { permission = await Notification.requestPermission(); }
  catch (error) {
    q("#notificationPermissionStatus").textContent = "No fue posible solicitar el permiso. Revisa la configuración del navegador.";
    console.warn("No se pudo solicitar permiso de notificaciones:", error);
    return;
  }
  safeStorageSet("desenreda-notifications-enabled", permission === "granted" ? "true" : "false");
  updateNotificationPermissionUI();
  if (permission === "granted") {
    showToast("Notificaciones activadas para esta sesión de uso.");
    checkDueNotifications();
  } else {
    showToast("No se concedió permiso para notificaciones.");
  }
}

function updateNotificationPermissionUI() {
  const button = q("#enableNotificationsBtn");
  const status = q("#notificationPermissionStatus");
  if (!button || !status) return;
  const supported = "Notification" in window;
  const granted = supported && Notification.permission === "granted" && safeStorageGet("desenreda-notifications-enabled") === "true";
  button.textContent = granted ? "Notificaciones activadas" : "Activar notificaciones";
  button.disabled = granted || !supported;
  status.textContent = !supported ? "Este navegador no admite notificaciones." : granted ? ("serviceWorker" in navigator ? "Los avisos usan el servicio de notificaciones del navegador; el planificador local se ejecuta mientras DESENREDA está abierto." : "Recibirás avisos mientras DESENREDA esté abierto.") : "Los avisos se muestran mientras DESENREDA esté abierto y tenga permiso.";
}

async function checkDueNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted" || safeStorageGet("desenreda-notifications-enabled") !== "true") return;
  const now = Date.now();
  let changed = false;
  let serviceWorkerRegistration = null;
  if ("serviceWorker" in navigator && window.isSecureContext) {
    try { serviceWorkerRegistration = await navigator.serviceWorker.ready; } catch { serviceWorkerRegistration = null; }
  }
  for (const entry of getUpcomingReminderEntries(7)) {
    if (!entry.time) continue;
    const task = entry.task;
    const sentKeys = Array.isArray(task.reminderSentKeys) ? task.reminderSentKeys : [];
    if (sentKeys.includes(entry.key)) continue;
    const due = Date.parse(`${entry.date}T${entry.time}:00`);
    const delta = due - now;
    if (!Number.isFinite(due) || delta > 5 * 60 * 1000 || delta < -60 * 1000) continue;
    try {
      const kindTitle = entry.kind === "scheduled" ? "Actividad próxima" : "Fecha límite próxima";
      const title = `DESENREDA · ${kindTitle}`;
      const options = {
        body: `${task.title} · ${entry.time}`,
        icon: "./assets/favicon.svg",
        badge: "./assets/favicon.svg",
        tag: `task-${task.id}-${entry.kind}-${entry.date}-${entry.time}`,
        data: { taskId: task.id, view: "tasks", reminderKind: entry.kind }
      };
      if (serviceWorkerRegistration?.showNotification) {
        await serviceWorkerRegistration.showNotification(title, options);
      } else {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          showView("tasks");
          openTaskEditor(task.id);
        };
      }
      task.reminderSentKeys = [...sentKeys, entry.key].slice(-20);
      task.reminderSentAt = new Date().toISOString();
      changed = true;
    } catch (error) {
      console.warn("No se pudo mostrar la notificación:", error);
    }
  }
  if (changed) persistState();
}

function handleNotificationNavigation(taskId = "", view = "tasks") {
  if (viewCopy[view]) showView(view);
  if (taskId) window.setTimeout(() => openTaskEditor(taskId), 180);
}

function bindEvents() {
  q("#assistantForm").addEventListener("submit", event => {
    event.preventDefault();
    const message = q("#assistantInput").value;
    sendAssistantMessage(message);
  });
  q("#assistantInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      q("#assistantForm").requestSubmit();
    }
  });
  q("#assistantPrompts").addEventListener("click", event => {
    const button = event.target.closest("[data-assistant-prompt]");
    if (button) sendAssistantMessage(button.dataset.assistantPrompt);
  });
  q("#assistantMessages").addEventListener("click", handleAssistantMessageClick);
  q("#assistantContextToggle").addEventListener("change", () => {
    showToast(q("#assistantContextToggle").checked ? "Contexto local activado solo para este chat." : "Contexto local desactivado.");
  });
  q("#assistantClearBtn").addEventListener("click", () => {
    assistantConversationEpoch += 1;
    assistantMessages = [];
    assistantRequestActive = false;
    saveAssistantMessages();
    renderAssistant();
    showToast("Conversación reiniciada.");
  });
  q("#smartPlanBtn").addEventListener("click", organizeWeek);
  q("#enableNotificationsBtn").addEventListener("click", enableBrowserNotifications);
  q("#mobileMoreAutoPlanBtn").addEventListener("click", () => {
    mobileMoreDialog.close();
    showView("assistant");
    window.setTimeout(() => q("#smartPlanBtn").focus(), 100);
  });
  qa(".nav-link, .mobile-nav-link[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  const mobileMoreDialog = q("#mobileMoreDialog");
  q("#mobileMoreBtn").addEventListener("click", () => {
    if (!mobileMoreDialog.open) mobileMoreDialog.showModal();
    q("#mobileMoreBtn").setAttribute("aria-expanded", "true");
  });
  q("#mobileMoreCloseBtn").addEventListener("click", () => mobileMoreDialog.close());
  mobileMoreDialog.addEventListener("click", event => {
    if (event.target === mobileMoreDialog) mobileMoreDialog.close();
    if (event.target.closest("[data-go-view]")) mobileMoreDialog.close();
  });
  mobileMoreDialog.addEventListener("close", () => q("#mobileMoreBtn").setAttribute("aria-expanded", "false"));
  document.addEventListener("click", event => {
    if (event.target.closest("[data-focus-task-input]")) {
      q("#taskInput").focus();
      return;
    }
    const button = event.target.closest("[data-go-view]");
    if (!button) return;
    event.preventDefault();
    showView(button.dataset.goView);
  });

  const openTaskComposer = () => {
    showView("tasks");
    window.setTimeout(() => q("#taskInput").focus(), 120);
  };
  q("#quickAddBtn").addEventListener("click", openTaskComposer);
  q("#dashboardAddTaskBtn").addEventListener("click", openTaskComposer);
  q("#dashboardTaskFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-dashboard-filter]");
    if (!button) return;
    currentTaskFilter = button.dataset.dashboardFilter;
    renderDashboard();
    renderTasks();
  });
  q("#dashboardTaskList").addEventListener("click", handleTaskAction);
  q("#dashboardReminders").addEventListener("click", handleTaskAction);
  q("#dashboardAgendaList").addEventListener("click", handleTaskAction);
  q("#dashboardWeekStrip").addEventListener("click", event => {
    const button = event.target.closest("[data-dashboard-date]");
    if (!button) return;
    selectedWeekdayIndex = Number(button.dataset.weekdayIndex);
    renderDashboardAgenda();
  });
  q("#dashboardWeekPrevBtn").addEventListener("click", () => {
    calendarWeekOffset -= 1;
    renderDashboardAgenda();
  });
  q("#dashboardWeekNextBtn").addEventListener("click", () => {
    calendarWeekOffset += 1;
    renderDashboardAgenda();
  });
  q("#notificationBtn").addEventListener("click", () => {
    const panel = q("#notificationPopover");
    const willOpen = panel.hidden;
    renderNotificationPopover();
    panel.hidden = !willOpen;
    q("#notificationBtn").setAttribute("aria-expanded", String(willOpen));
    if (willOpen) q("#notificationCloseBtn").focus();
  });
  q("#notificationCloseBtn").addEventListener("click", closeNotificationPopover);
  q("#notificationPopoverList").addEventListener("click", event => {
    closeNotificationPopover();
    handleTaskAction(event);
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".notification-anchor")) closeNotificationPopover();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeNotificationPopover();
  });
  const openSettings = () => {
    const dialog = q("#settingsDialog");
    if (!dialog.open) dialog.showModal();
  };
  q("#settingsOpenBtn").addEventListener("click", openSettings);
  q("#settingsMobileBtn").addEventListener("click", openSettings);
  q("#mobileMoreSettingsBtn").addEventListener("click", () => { mobileMoreDialog.close(); openSettings(); });
  q("#mobileMoreAccountBtn").addEventListener("click", () => { mobileMoreDialog.close(); openAccountDialog(); });

  q("#taskForm").addEventListener("submit", event => {
    event.preventDefault();
    const createdTask = addTask(q("#taskInput").value, q("#taskPriority").value, {
      category: q("#taskCategory").value,
      dueDate: q("#taskDueDate").value,
      dueTime: q("#taskDueTime")?.value || "",
      scheduledDate: q("#taskScheduleDate")?.value || "",
      scheduledTime: q("#taskScheduleTime")?.value || "",
      estimatedMinutes: q("#taskEstimate").value
    });
    if (!createdTask) return;
    q("#taskInput").value = "";
    q("#taskPriority").value = "medium";
    q("#taskCategory").value = "personal";
    q("#taskDueDate").value = "";
    if (q("#taskDueTime")) q("#taskDueTime").value = "";
    if (q("#taskScheduleDate")) q("#taskScheduleDate").value = "";
    if (q("#taskScheduleTime")) q("#taskScheduleTime").value = "";
    q("#taskEstimate").value = "25";
    if (q("#taskAdvancedOptions")) q("#taskAdvancedOptions").open = false;
    q("#taskInput").focus();
  });

  q("#taskList").addEventListener("click", handleTaskAction);
  q("#taskBoard").addEventListener("click", handleTaskAction);
  q("#taskViewSwitch").addEventListener("click", event => {
    const button = event.target.closest("[data-task-view]");
    if (!button) return;
    currentTaskView = button.dataset.taskView;
    safeStorageSet("desenreda-task-view", currentTaskView);
    renderTasks();
  });
  q("#taskBoard").addEventListener("change", event => {
    const select = event.target.closest("[data-task-status]");
    if (select) setTaskStatus(select.dataset.taskStatus, select.value);
  });
  q("#taskBoard").addEventListener("dragstart", event => {
    const card = event.target.closest("[data-kanban-task]");
    if (!card) return;
    draggedKanbanTaskId = card.dataset.kanbanTask;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedKanbanTaskId);
    }
    card.classList.add("is-dragging");
  });
  q("#taskBoard").addEventListener("dragend", event => {
    event.target.closest("[data-kanban-task]")?.classList.remove("is-dragging");
    qa(".kanban-column").forEach(column => column.classList.remove("is-drop-target"));
  });
  q("#taskBoard").addEventListener("dragover", event => {
    const column = event.target.closest("[data-kanban-column]");
    if (!column) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    qa(".kanban-column").forEach(item => item.classList.toggle("is-drop-target", item === column));
  });
  q("#taskBoard").addEventListener("drop", event => {
    const column = event.target.closest("[data-kanban-column]");
    if (!column) return;
    event.preventDefault();
    const taskId = event.dataTransfer?.getData("text/plain") || draggedKanbanTaskId;
    draggedKanbanTaskId = null;
    if (taskId) setTaskStatus(taskId, column.dataset.kanbanColumn);
  });
  q("#calendarTaskList").addEventListener("click", handleTaskAction);
  q("#calendarWeekGrid").addEventListener("click", event => {
    const day = event.target.closest("[data-calendar-date]");
    if (day) selectCalendarDay(day.dataset.calendarDate);
  });
  q("#calendarPrevBtn").addEventListener("click", () => changeCalendarWeek(-1));
  q("#calendarNextBtn").addEventListener("click", () => changeCalendarWeek(1));
  q("#calendarViewSwitch").addEventListener("click", event => {
    const button = event.target.closest("[data-calendar-mode]");
    if (!button) return;
    currentCalendarMode = button.dataset.calendarMode;
    renderCalendar();
  });
  q("#calendarTodayBtn").addEventListener("click", () => {
    calendarWeekOffset = 0;
    calendarMonthOffset = 0;
    selectedWeekdayIndex = (new Date().getDay() + 6) % 7;
    selectedCalendarDate = localDateISO();
    renderCalendar();
  });
  q("#calendarAddTaskBtn").addEventListener("click", addTaskFromCalendar);
  qa(".filter-tab").forEach(button => button.addEventListener("click", () => {
    currentTaskFilter = button.dataset.filter;
    renderTasks();
  }));
  q("#taskSearch").addEventListener("input", renderTasks);
  q("#taskDateFilter").addEventListener("change", renderTasks);
  q("#editTaskForm").addEventListener("submit", event => {
    event.preventDefault();
    saveTaskEdit();
  });
  qa('[data-close-dialog]').forEach(button => button.addEventListener("click", () => q(`#${button.dataset.closeDialog}`).close()));

  q("#focusStartBtn").addEventListener("click", startFocusTimer);
  q("#focusResetBtn").addEventListener("click", resetFocusTimer);
  q("#focusModeBtn").addEventListener("click", toggleFocusMode);
  q("#focusFullscreenBtn").addEventListener("click", toggleFocusFullscreen);
  document.addEventListener("fullscreenchange", updateFocusFullscreenButton);

  q("#ideaForm").addEventListener("submit", event => {
    event.preventDefault();
    generateIdeas(new FormData(event.currentTarget));
  });
  q("#regenerateIdeasBtn").addEventListener("click", () => {
    if (!lastIdeaFormValues) return;
    generateIdeas(new FormData(q("#ideaForm")));
  });
  q("#ideaResults").addEventListener("click", event => {
    const saveButton = event.target.closest("[data-save-idea]");
    const taskButton = event.target.closest("[data-idea-task]");
    const detailButton = event.target.closest("[data-open-generated-idea]");
    if (saveButton) saveIdea(saveButton.dataset.saveIdea);
    if (taskButton) addIdeaAsTask(taskButton.dataset.ideaTask, false);
    if (detailButton) openIdeaDetail(detailButton.dataset.openGeneratedIdea, false);
  });
  q("#savedIdeaSearch").addEventListener("input", event => {
    savedIdeasQuery = event.target.value;
    renderSavedIdeas();
  });
  q("#ideaLibraryFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-idea-filter]");
    if (!button) return;
    savedIdeasFilter = button.dataset.ideaFilter;
    renderSavedIdeas();
  });
  q("#savedIdeas").addEventListener("click", event => {
    const favoriteButton = event.target.closest("[data-toggle-favorite]");
    const removeButton = event.target.closest("[data-remove-idea]");
    const taskButton = event.target.closest("[data-saved-idea-task]");
    const detailButton = event.target.closest("[data-open-saved-idea]");
    if (detailButton) openIdeaDetail(detailButton.dataset.openSavedIdea, true);
    if (favoriteButton) {
      const idea = state.ideas.find(item => item.id === favoriteButton.dataset.toggleFavorite);
      if (idea) {
        idea.favorite = !idea.favorite;
        persistState();
        renderSavedIdeas();
        showToast(idea.favorite ? "Idea añadida a favoritas." : "Idea retirada de favoritas.");
      }
    }
    if (removeButton) {
      state.ideas = state.ideas.filter(idea => idea.id !== removeButton.dataset.removeIdea);
      persistState();
      renderSavedIdeas();
      showToast("Idea retirada de tu coleccion.");
    }
    if (taskButton) addIdeaAsTask(taskButton.dataset.savedIdeaTask, true);
  });
  q("#ideaDetailDialog").addEventListener("click", event => {
    const closeButton = event.target.closest('[data-close-dialog="ideaDetailDialog"]');
    const saveButton = event.target.closest("[data-detail-save]");
    const taskButton = event.target.closest("[data-detail-task]");
    if (closeButton) q("#ideaDetailDialog").close();
    if (saveButton) {
      if (saveButton.dataset.detailSource === "saved") return;
      saveIdea(saveButton.dataset.detailSave);
      q("#ideaDetailDialog").close();
    }
    if (taskButton) {
      addIdeaAsTask(taskButton.dataset.detailTask, taskButton.dataset.detailSource === "saved");
      q("#ideaDetailDialog").close();
    }
  });

  q("#decisionForm").addEventListener("submit", event => {
    event.preventDefault();
    const title = q("#decisionTitle").value.trim();
    const options = parseLines(q("#decisionOptions").value);
    const criteria = parseLines(q("#decisionCriteria").value);
    if (options.length < 2) {
      showToast("Añade al menos dos alternativas para comparar.");
      return;
    }
    if (options.length > 6) {
      showToast("Compara como máximo seis alternativas a la vez.");
      return;
    }
    if (criteria.length < 1) {
      showToast("Añade al menos un criterio para evaluar.");
      return;
    }
    if (criteria.length > 4) {
      showToast("Para una comparación clara, utiliza como máximo cuatro criterios.");
      return;
    }
    buildDecisionMatrix(title, options, criteria);
  });
  q("#calculateDecisionBtn").addEventListener("click", calculateDecision);

  q("#planForm").addEventListener("submit", event => {
    event.preventDefault();
    const goal = q("#planGoal").value.trim();
    if (!goal) return;
    const plan = createPlan(goal, Number(q("#planDuration").value), Number(q("#planMinutes").value));
    state.plans.unshift(plan);
    persistState();
    renderPlans();
    q("#planGoal").value = "";
    showToast("Tu plan esta listo. Puedes ajustar sus pasos cuando quieras.");
  });

  q("#plansList").addEventListener("click", event => {
    const toggle = event.target.closest("[data-step-toggle]");
    if (toggle) {
      const card = toggle.closest("[data-plan-id]");
      const plan = state.plans.find(item => item.id === card?.dataset.planId);
      const step = plan?.steps.find(item => item.id === toggle.dataset.stepToggle);
      if (step) {
        step.completed = !step.completed;
        persistState();
        renderPlans();
        showToast(step.completed ? "Paso completado. Buen avance." : "Paso marcado como pendiente.");
      }
      return;
    }
    const adapt = event.target.closest("[data-adapt-plan]");
    if (adapt) {
      adaptPlan(adapt.dataset.adaptPlan);
      return;
    }
    const addStep = event.target.closest("[data-add-step-task]");
    if (addStep) {
      const card = addStep.closest("[data-plan-id]");
      addPlanStepAsTask(addStep.dataset.addStepTask, card?.dataset.planId);
      return;
    }
    const removePlan = event.target.closest("[data-delete-plan]");
    if (removePlan) {
      const plan = state.plans.find(item => item.id === removePlan.dataset.deletePlan);
      if (!plan || !window.confirm(`Eliminar el plan "${plan.goal}" y sus pasos?`)) return;
      state.plans = state.plans.filter(item => item.id !== plan.id);
      persistState();
      renderPlans();
      showToast("Plan eliminado.");
    }
  });

  q("#searchOpenBtn").addEventListener("click", openSearch);
  q("#accountBtn").addEventListener("click", openAccountDialog);
  q("#authForm").addEventListener("submit", handleAuthSubmit);
  q("#signOutBtn").addEventListener("click", handleSignOut);
  q("#resetPasswordBtn").addEventListener("click", handlePasswordReset);
  qa('[data-auth-mode]').forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  q("#globalSearchInput").addEventListener("input", renderGlobalSearch);
  q("#globalSearchResults").addEventListener("click", event => {
    const result = event.target.closest("[data-search-view]");
    if (result) openSearchResult(result);
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshFocusTimer();
  });

  q("#themeToggle").addEventListener("click", toggleTheme);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    q("#installBtn").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    q("#installBtn").hidden = true;
    showToast("DESENREDA se instalo correctamente.");
  });
  q("#installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === "accepted") showToast("Gracias por instalar DESENREDA.");
    deferredInstallPrompt = null;
    q("#installBtn").hidden = true;
  });
  q("#exportBtn").addEventListener("click", exportBackup);
  q("#importBtn").addEventListener("click", () => q("#importFileInput").click());
  q("#importFileInput").addEventListener("change", event => {
    importBackup(event.target.files?.[0]);
    event.target.value = "";
  });
}

function updateAccountUI() {
  const setupNotice = q("#firebaseSetupNotice");
  const signedOut = q("#accountSignedOut");
  const signedIn = q("#accountSignedIn");
  if (!setupNotice || !signedOut || !signedIn) return;
  setupNotice.classList.toggle("hidden", firebaseConfigured);
  signedOut.classList.toggle("hidden", !firebaseConfigured || Boolean(currentUser));
  signedIn.classList.toggle("hidden", !currentUser);
  if (currentUser) q("#accountEmailLabel").textContent = currentUser.email || "Cuenta conectada";
  const accountName = q("#accountNameLabel");
  const accountStatus = q("#accountStatusLabel");
  if (accountName) accountName.textContent = currentUser?.email ? currentUser.email.split("@")[0] : "Mi espacio";
  if (accountStatus) accountStatus.textContent = currentUser ? "Cuenta sincronizada" : "En este dispositivo";
  const accountDot = q(".account-online-dot");
  if (accountDot) {
    accountDot.classList.toggle("is-local", !currentUser);
    accountDot.title = currentUser ? "Cuenta conectada" : "Datos guardados localmente";
  }
}

function openAccountDialog() {
  updateAccountUI();
  const dialog = q("#accountDialog");
  if (!dialog.open) dialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  qa('[data-auth-mode]').forEach(button => button.classList.toggle("active", button.dataset.authMode === authMode));
  q("#authConfirmWrap").classList.toggle("hidden", authMode !== "register");
  q("#authPasswordConfirm").required = authMode === "register";
  q("#authPassword").autocomplete = authMode === "register" ? "new-password" : "current-password";
  q("#authSubmitBtn").textContent = authMode === "register" ? "Crear mi cuenta" : "Iniciar sesión";
  q("#resetPasswordBtn").classList.toggle("hidden", authMode !== "login");
  q("#authFeedback").textContent = authMode === "register"
    ? "Al crear tu cuenta, los datos de este dispositivo se asociarán a tu nuevo usuario."
    : "Inicia sesión para recuperar tus datos y sincronizarlos entre dispositivos.";
}

function friendlyFirebaseError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "Este correo ya tiene una cuenta. Inicia sesión.",
    "auth/invalid-email": "El correo electrónico no tiene un formato válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/too-many-requests": "Hubo demasiados intentos. Espera un momento y vuelve a intentarlo.",
    "auth/network-request-failed": "No hay conexión. Revisa tu internet e inténtalo de nuevo."
  };
  return messages[code] || "No pudimos completar la operación. Revisa la configuración de Firebase e inténtalo otra vez.";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!firebaseConfigured || !firebaseAuth || !firebaseSdk) {
    q("#authFeedback").textContent = "Configura Firebase antes de crear una cuenta.";
    return;
  }
  const email = q("#authEmail").value.trim();
  const password = q("#authPassword").value;
  if (authMode === "register" && password !== q("#authPasswordConfirm").value) {
    q("#authFeedback").textContent = "Las contraseñas no coinciden.";
    return;
  }
  const submit = q("#authSubmitBtn");
  submit.disabled = true;
  submit.textContent = authMode === "register" ? "Creando cuenta..." : "Ingresando...";
  try {
    if (authMode === "register") {
      await firebaseSdk.createUserWithEmailAndPassword(firebaseAuth, email, password);
    } else {
      await firebaseSdk.signInWithEmailAndPassword(firebaseAuth, email, password);
    }
    q("#authFeedback").textContent = "Acceso correcto. Preparando tu espacio...";
    q("#accountDialog").close();
    showToast(authMode === "register" ? "Tu cuenta fue creada." : "Has iniciado sesión.");
  } catch (error) {
    console.warn("Firebase Authentication:", error);
    q("#authFeedback").textContent = friendlyFirebaseError(error);
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === "register" ? "Crear mi cuenta" : "Iniciar sesión";
  }
}

async function handlePasswordReset() {
  if (!firebaseSdk || !firebaseAuth) return;
  const email = q("#authEmail").value.trim();
  if (!email) {
    q("#authFeedback").textContent = "Escribe tu correo para enviarte el enlace de recuperación.";
    q("#authEmail").focus();
    return;
  }
  try {
    await firebaseSdk.sendPasswordResetEmail(firebaseAuth, email);
    q("#authFeedback").textContent = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";
  } catch (error) {
    q("#authFeedback").textContent = friendlyFirebaseError(error);
  }
}

async function handleSignOut() {
  if (!firebaseAuth || !firebaseSdk) return;
  try {
    await firebaseSdk.signOut(firebaseAuth);
    q("#accountDialog").close();
    showToast("Sesión cerrada. Tus datos locales se conservan en este navegador.");
  } catch (error) {
    showToast("No pudimos cerrar la sesión. Inténtalo de nuevo.");
  }
}

async function loadCloudForUser(user) {
  if (!firebaseSdk || !firebaseDb || !user) return;
  cloudReady = false;
  if (cloudUnsubscribe) cloudUnsubscribe();
  clearTimeout(cloudSaveTimer);
  setSyncStatus("Conectando tu espacio...", true);
  const ownerMatches = localOwnerUid === "local" || localOwnerUid === user.uid;
  const userDocument = firebaseSdk.doc(firebaseDb, "users", user.uid, "appData", "desenreda");
  cloudDocument = userDocument;
  try {
    const localState = ownerMatches ? sanitizeState(state) : sanitizeState(defaultState);
    const mergedInitial = await firebaseSdk.runTransaction(firebaseDb, async transaction => {
      const snapshot = await transaction.get(userDocument);
      const remoteState = snapshot.exists() ? sanitizeState(snapshot.data()) : sanitizeState(defaultState);
      const merged = snapshot.exists() ? mergeStates(localState, remoteState) : localState;
      transaction.set(userDocument, merged);
      return merged;
    });
    if (firebaseAuth.currentUser?.uid !== user.uid) return;
    const latestLocal = ownerMatches ? sanitizeState(state) : sanitizeState(defaultState);
    state = mergeStates(latestLocal, sanitizeState(mergedInitial));
    state.updatedAt = state.updatedAt || new Date().toISOString();
    localOwnerUid = user.uid;
    safeStorageSet("desenreda-owner-uid", localOwnerUid);
    safeStorageSet(STORAGE_KEY, JSON.stringify(state));
    lastPersistedState = JSON.parse(JSON.stringify(state));
    cloudReady = true;
    renderAll();
    setSyncStatus("Sincronizado con Firebase", true);
    if (JSON.stringify(state) !== JSON.stringify(mergedInitial)) persistState();

    cloudUnsubscribe = firebaseSdk.onSnapshot(userDocument, cloudSnapshot => {
      if (firebaseAuth.currentUser?.uid !== user.uid || !cloudSnapshot.exists()) return;
      const remoteState = sanitizeState(cloudSnapshot.data());
      const merged = mergeStates(state, remoteState);
      if (JSON.stringify(merged) !== JSON.stringify(state)) {
        state = merged;
        safeStorageSet(STORAGE_KEY, JSON.stringify(state));
        lastPersistedState = JSON.parse(JSON.stringify(state));
        renderAll();
        if (state.updatedAt !== remoteState.updatedAt) persistState();
      }
      setSyncStatus("Sincronizado con Firebase", true);
    }, error => {
      console.warn("Firestore listener:", error);
      setSyncStatus("Sincronización interrumpida; datos locales disponibles", false);
    });
  } catch (error) {
    console.warn("No fue posible cargar el espacio en la nube:", error);
    cloudReady = false;
    cloudDocument = null;
    setSyncStatus("Datos locales disponibles; revisa Firebase", false);
  }
}

async function setupFirebase() {
  firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY" &&
    firebaseConfig.projectId && firebaseConfig.projectId !== "TU_PROJECT_ID" &&
    firebaseConfig.appId && firebaseConfig.appId !== "TU_APP_ID");

  if (!firebaseConfigured) {
    setSyncStatus("Guardado en este dispositivo", false);
    updateAccountUI();
    return;
  }

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    const app = appModule.initializeApp(firebaseConfig);
    firebaseAuth = authModule.getAuth(app);
    firebaseDb = firestoreModule.getFirestore(app);
    firebaseSdk = {
      ...authModule,
      ...firestoreModule
    };
    authModule.onAuthStateChanged(firebaseAuth, user => {
      currentUser = user;
      updateAccountUI();
      if (user) {
        loadCloudForUser(user);
      } else {
        if (cloudUnsubscribe) cloudUnsubscribe();
        cloudUnsubscribe = null;
        cloudReady = false;
        cloudDocument = null;
        clearTimeout(cloudSaveTimer);
        setSyncStatus("Guardado en este dispositivo", false);
      }
    });
  } catch (error) {
    console.warn("Firebase no está disponible. Se mantiene el almacenamiento local.", error);
    firebaseConfigured = false;
    firebaseAuth = null;
    firebaseDb = null;
    firebaseSdk = null;
    setSyncStatus("Guardado en este dispositivo", false);
    updateAccountUI();
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    registration.update().catch(error => console.warn("No se pudo comprobar una actualización PWA:", error));
  } catch (error) {
    // Local file previews and restricted browsers can disable service workers.
    console.info("PWA no disponible en este origen; la aplicación continúa en modo web.", error);
  }
}

function init() {
  q("#dateLabel").textContent = formatDate();
  document.body.dataset.view = "dashboard";
  q("#pageTitle").innerHTML = dashboardGreeting();
  q("#todayNumber").textContent = new Date().getDate();
  q("#todayMonth").textContent = new Intl.DateTimeFormat("es-CO", { month: "short" }).format(new Date()).replace(".", "").toUpperCase();
  const storedTheme = safeStorageGet("desenreda-theme");
  const savedTheme = ["light", "dark"].includes(storedTheme) ? storedTheme : "light";
  document.body.dataset.theme = savedTheme;
  q("#themeToggle").setAttribute("aria-label", savedTheme === "dark" ? "Activar tema claro" : "Activar tema oscuro");
  q("#themeToggle").title = savedTheme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
  bindEvents();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type === "DESENREDA_OPEN_TASK") handleNotificationNavigation(event.data.taskId, "tasks");
    });
  }
  qa(".nav-link").forEach(link => { if (!link.title) link.title = link.textContent.trim(); });
  q("#focusSessionsToday").textContent = String(focusSessionsToday);
  q("#taskListPanel").hidden = currentTaskView !== "list";
  q("#taskBoard").hidden = currentTaskView !== "board";
  setAuthMode("login");
  renderAll();
  renderFocusTaskOptions();
  updateFocusClock();
  setupFirebase();
  registerServiceWorker();
  setAssistantStatus();
  updateNotificationPermissionUI();
  const launchParams = new URLSearchParams(window.location.search);
  const launchView = launchParams.get("view");
  const launchTask = launchParams.get("task");
  if (launchView && viewCopy[launchView]) handleNotificationNavigation(launchTask || "", launchView);
  else if (launchTask) handleNotificationNavigation(launchTask, "tasks");
  checkDueNotifications();
  if (!reminderInterval) reminderInterval = window.setInterval(checkDueNotifications, 30000);
}

try {
  init();
  window.__DESENREDA_BOOTED = true;
} catch (error) {
  window.__DESENREDA_BOOT_ERROR = error?.message || String(error);
  console.error("DESENREDA no pudo iniciar:", error);
}

})();
