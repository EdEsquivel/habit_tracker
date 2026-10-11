/**
 * Habit Tracker
 * ------------------------------------------------------------------
 * A small app that stores completed habits in the browser (localStorage)
 * and shows the consecutive days that have at least one logged habit,
 * plus how much time was spent on each habit during the current week.
 * Summaries are always calculated from the saved logs when the page is
 * drawn; nothing extra is ever written to storage.
 *
 * Data model: one "log" is a plain object:
 *   {
 *     id: 'abc123',                 // unique id
 *     createdAt: 1699999999999,     // when the log was added (sorting tie-break)
 *     date: '2026-10-02',           // the DAY of the habit, in local time
 *     habit: 'Read 20 mins',        // required text
 *     note: 'Chapter 4',            // optional text ('' when empty)
 *     minutes: 25                   // optional number (missing when not recorded)
 *   }
 */

/* ========================= 1. Constants & state ========================= */

// Key used to store our logs inside localStorage.
const STORAGE_KEY = 'habitTracker.logs';

// Settings live in their OWN key so changing them can never touch the logs.
const SETTINGS_KEY = 'habitTracker.settings';

// Dark is the starting look; English is the canonical language.
const DEFAULT_SETTINGS = { theme: 'dark', language: 'en' };

// The single source of truth: an array of logs.
let logs = loadLogs();

// The chosen theme ('dark' | 'light') and language ('en' | 'es').
let settings = loadSettings();

/* ========================= 2. Date helpers =========================
 * Always build dates from the user's LOCAL clock.
 * `toISOString()` is NOT used on purpose: it converts to UTC, which makes
 * the day "jump" for people whose timezone is ahead or behind GMT.
 */

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-11
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // -> 'YYYY-MM-DD'
}

function getTodayString() {
  return toLocalDateString(new Date());
}

function getYesterdayString() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1); // handles month/year rollovers
  return toLocalDateString(yesterday);
}

// Turns a 'YYYY-MM-DD' string back into a local Date for pretty printing.
function parseLocalDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Dates follow the chosen language, so Spanish shows "lun, 5 oct 2026".
function formatDateForDisplay(dateString) {
  return parseLocalDateString(dateString).toLocaleDateString(settings.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Only the month and year, so the monthly card reads "October 2026".
function formatMonthForDisplay(dateString) {
  return parseLocalDateString(dateString).toLocaleDateString(settings.language, {
    month: 'long',
    year: 'numeric',
  });
}

/* ========================= 3. Storage helpers ========================= */

function loadLogs() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    // Keep only entries that look valid, so bad data can never break the app.
    return parsed.filter(
      (log) => log && typeof log.habit === 'string' && typeof log.date === 'string'
    );
  } catch (error) {
    console.warn('Could not read saved logs:', error);
    return [];
  }
}

function saveLogs() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    return true;
  } catch (error) {
    // Happens when the browser blocks storage (e.g. private mode on some setups).
    console.warn('Could not save logs:', error);
    return false;
  }
}

// Unknown values fall back to the defaults, so a bad save can never break the app.
function loadSettings() {
  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }; // e.g. "null"

    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      language: parsed.language === 'es' ? 'es' : 'en',
    };
  } catch (error) {
    console.warn('Could not read saved settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Same private-mode case as the logs: the app still works for this visit.
    console.warn('Could not save settings:', error);
  }
}

/* ========================= 4. Streak logic ========================= */

/**
 * Counts consecutive days with at least one logged habit, ending today.
 *
 * Rules:
 *  - A day counts if it has one or more logs.
 *  - If today has a log, the streak is measured backwards from today.
 *  - If today has no log yet, the streak still counts from yesterday
 *    (the day is not over, so the streak is not broken yet).
 *  - Otherwise the streak is 0.
 */
function calculateStreak(allLogs) {
  const activeDays = new Set(allLogs.map((log) => log.date));
  const today = getTodayString();
  const yesterday = getYesterdayString();

  // Pick the last day the streak can be measured from.
  let cursor;
  if (activeDays.has(today)) {
    cursor = parseLocalDateString(today);
  } else if (activeDays.has(yesterday)) {
    cursor = parseLocalDateString(yesterday);
  } else {
    return 0;
  }

  // Walk backwards one day at a time while the day has a log.
  let streak = 0;
  while (activeDays.has(toLocalDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// True when `laterDateString` is the calendar day right after `earlierDateString`.
// We step a local Date forward instead of counting milliseconds: on days with a
// DST change a "day" is 23 or 25 hours long, which breaks millisecond maths.
function isNextDay(earlierDateString, laterDateString) {
  const nextDay = parseLocalDateString(earlierDateString);
  nextDay.setDate(nextDay.getDate() + 1);
  return toLocalDateString(nextDay) === laterDateString;
}

/**
 * Finds the longest run of consecutive days that ever had a logged habit.
 *
 * Rules:
 *  - Same as the current streak: one or more logs make a day active.
 *  - Days in the future are ignored (they cannot be part of a real streak).
 *  - A streak that is still running counts right away, because today and
 *    yesterday are part of the history we scan.
 */
function calculateBestStreak(allLogs) {
  const today = getTodayString();

  // A Set removes duplicate days, and 'YYYY-MM-DD' strings sort like dates.
  const activeDays = new Set(
    allLogs
      .map((log) => log.date)
      .filter((date) => date <= today)
      .sort()
  );

  let bestRun = 0;
  let currentRun = 0;
  let previousDay = null;

  for (const day of activeDays) {
    if (previousDay !== null && isNextDay(previousDay, day)) {
      currentRun += 1; // the day right after the previous one
    } else {
      currentRun = 1; // first day, or a gap: a new streak starts here
    }
    bestRun = Math.max(bestRun, currentRun);
    previousDay = day;
  }

  return bestRun;
}

// Newest day first; for the same day, the most recently added log first.
function sortLogsNewestFirst(allLogs) {
  return [...allLogs].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // strings sort like dates
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/* ========================= 5. Weekly and monthly totals ========================= */

/**
 * First day (Monday) of the current week, as a local 'YYYY-MM-DD' string.
 * getDay() is 0 for Sunday, so this converts it into "days since Monday".
 */
function getStartOfWeekString() {
  const daysSinceMonday = (new Date().getDay() + 6) % 7;
  const monday = new Date();
  monday.setDate(monday.getDate() - daysSinceMonday);
  return toLocalDateString(monday);
}

/**
 * Adds up the minutes logged for each habit during the current week.
 *
 * Rules:
 *  - The week runs from Monday through today, so last week's entries and
 *    future-dated entries are ignored (date strings sort like dates).
 *  - Entries without `minutes` are skipped: time cannot be invented for them.
 *  - The longest list first; habits with the same total fall back to A-Z.
 */
function getThisWeekTotals(allLogs) {
  const weekStart = getStartOfWeekString();
  const today = getTodayString();
  const minutesByHabit = new Map();

  for (const log of allLogs) {
    const isThisWeek = log.date >= weekStart && log.date <= today;
    if (!isThisWeek || !log.minutes) continue;

    minutesByHabit.set(log.habit, (minutesByHabit.get(log.habit) || 0) + log.minutes);
  }

  return [...minutesByHabit.entries()]
    .map(([habit, minutes]) => ({ habit: habit, minutes: minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.habit.localeCompare(b.habit));
}

// Writes totals as '45 min', '2 h' or '1 h 25 min' so long numbers stay readable.
function formatMinutes(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * First day of the current month, as a local 'YYYY-MM-DD' string.
 * `new Date(year, month, 1)` is local midnight on the 1st, so no date maths
 * is involved and daylight saving changes cannot shift it.
 */
function getStartOfMonthString() {
  const today = new Date();
  return toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
}

/**
 * Counts how many different days each habit was logged on during this month.
 *
 * Rules:
 *  - The month runs from the 1st through today, so last month's entries and
 *    future-dated entries are ignored (date strings sort like dates).
 *  - Two entries on the same day count once: a Set of day strings is kept, so
 *    the result is a count of DAYS, never a difference between two dates.
 *  - Unlike the weekly minutes, an entry without `minutes` still counts: this
 *    measures how often you did the habit, not for how long.
 *  - Most days first; habits with the same count fall back to A-Z.
 */
function getThisMonthDayCounts(allLogs) {
  const monthStart = getStartOfMonthString();
  const today = getTodayString();
  const daysByHabit = new Map();

  for (const log of allLogs) {
    const isThisMonth = log.date >= monthStart && log.date <= today;
    if (!isThisMonth) continue;

    if (!daysByHabit.has(log.habit)) daysByHabit.set(log.habit, new Set());
    daysByHabit.get(log.habit).add(log.date);
  }

  return [...daysByHabit.entries()]
    .map(([habit, days]) => ({ habit: habit, days: days.size }))
    .sort((a, b) => b.days - a.days || a.habit.localeCompare(b.habit));
}

/* ========================= 6. Translations =========================
 * Every user-facing string lives here. English is the canonical version;
 * Spanish mirrors it key for key. `index.html` marks its own copy with
 * data-i18n / data-i18n-placeholder, and the {placeholders} below are
 * filled in by fill().
 */

const TRANSLATIONS = {
  en: {
    documentTitle: 'Habit Tracker',
    appSubtitle: 'Log what you completed and keep the streak alive.',

    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    languageLabel: 'Language',

    streaks: 'Streaks',
    currentStreak: 'Current streak',
    bestStreak: 'Best streak',
    thisWeek: 'This Week',

    logAHabit: 'Log a Habit',
    date: 'Date',
    habit: 'Habit',
    categoryOrNote: 'Category / note',
    timeSpent: 'Time spent',
    required: '(required)',
    optional: '(optional)',
    habitPlaceholder: 'Read 20 mins, Workout, Drink 2L water',
    notePlaceholder: 'Health, Chapter 4, No sugar',
    minutesPlaceholder: 'Minutes, e.g. 25',
    addHabit: 'Add habit',

    completedLogs: 'Completed Logs',
    noLogsYet: 'Nothing logged yet. Your completed habits will appear here.',
    noTimeThisWeek: 'No time logged yet this week.',
    thisMonth: 'This Month',
    noDaysThisMonth: 'No days logged yet this month.',
    storageWarning:
      'Storage is not available in this browser, so logs will disappear when you close the page.',
    today: 'Today',

    // Singular and plural are separate keys: no plural rules needed.
    logSingular: '1 log',
    logPlural: '{count} logs',
    daySingular: '1 day',
    dayPlural: '{days} days',

    startFirstStreak: 'Log your first habit to start a streak.',
    habitRequired: 'Please write the habit you completed.',
    noStreak: 'No streak right now — log a habit today to start a new one.',
    streakOne: '1 consecutive day with at least one habit. {tail}',
    streakMany: '{days} consecutive days with at least one habit. {tail}',
    tailDone: 'Great job keeping it going today.',
    tailOpen: 'Today is still open — log a habit to extend it.',
  },

  es: {
    documentTitle: 'Rastreador de Hábitos',
    appSubtitle: 'Registra lo que completaste y mantén la racha viva.',

    themeLabel: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    languageLabel: 'Idioma',

    streaks: 'Rachas',
    currentStreak: 'Racha actual',
    bestStreak: 'Mejor racha',
    thisWeek: 'Esta semana',

    logAHabit: 'Registrar un hábito',
    date: 'Fecha',
    habit: 'Hábito',
    categoryOrNote: 'Categoría / nota',
    timeSpent: 'Tiempo invertido',
    required: '(obligatorio)',
    optional: '(opcional)',
    habitPlaceholder: 'Leer 20 min, Entrenar, Beber 2 L de agua',
    notePlaceholder: 'Salud, Capítulo 4, Sin azúcar',
    minutesPlaceholder: 'Minutos, p. ej. 25',
    addHabit: 'Agregar hábito',

    completedLogs: 'Hábitos completados',
    noLogsYet: 'Aún no hay registros. Tus hábitos completados aparecerán aquí.',
    noTimeThisWeek: 'Aún no has registrado tiempo esta semana.',
    thisMonth: 'Este mes',
    noDaysThisMonth: 'Aún no has registrado días este mes.',
    storageWarning:
      'El almacenamiento no está disponible en este navegador, por lo que los registros se perderán al cerrar la página.',
    today: 'Hoy',

    logSingular: '1 registro',
    logPlural: '{count} registros',
    daySingular: '1 día',
    dayPlural: '{days} días',

    startFirstStreak: 'Registra tu primer hábito para empezar una racha.',
    habitRequired: 'Por favor, escribe el hábito que completaste.',
    noStreak: 'No hay racha ahora: registra un hábito hoy para empezar una nueva.',
    streakOne: '1 día consecutivo con al menos un hábito. {tail}',
    streakMany: '{days} días consecutivos con al menos un hábito. {tail}',
    tailDone: 'Buen trabajo manteniéndola hoy.',
    tailOpen: 'El día de hoy sigue disponible: registra un hábito para ampliarla.',
  },
};

// Replaces {name} placeholders. `{days: 3}` fills in a named value.
function fill(template, values) {
  let result = template;
  for (const [name, value] of Object.entries(values)) {
    result = result.replace(`{${name}}`, value);
  }
  return result;
}

// Shorthand for a single string in the active language.
function t(key) {
  return TRANSLATIONS[settings.language][key];
}

/* ========================= 7. DOM references ========================= */

const form = document.getElementById('habit-form');
const dateInput = document.getElementById('date-input');
const habitInput = document.getElementById('habit-input');
const noteInput = document.getElementById('note-input');
const minutesInput = document.getElementById('minutes-input');
const streakCount = document.getElementById('streak-count');
const bestStreakCount = document.getElementById('best-streak-count');
const streakMessage = document.getElementById('streak-message');
const weeklyRange = document.getElementById('weekly-range');
const weeklyList = document.getElementById('weekly-list');
const weeklyEmpty = document.getElementById('weekly-empty');
const monthLabel = document.getElementById('month-label');
const monthList = document.getElementById('month-list');
const monthEmpty = document.getElementById('month-empty');
const logList = document.getElementById('log-list');
const logCount = document.getElementById('log-count');
const emptyState = document.getElementById('empty-state');
const storageWarning = document.getElementById('storage-warning');
const themeButtons = document.querySelectorAll('[data-theme-option]');
const languageButtons = document.querySelectorAll('[data-language-option]');

/* ========================= 8. Rendering ========================= */

// Puts the chosen theme on <html>, where the CSS reads it.
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;

  for (const button of themeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === settings.theme));
  }
}

// Rewrites every marked string, then redraws the generated ones.
function applyLanguage() {
  document.documentElement.lang = settings.language;
  document.title = t('documentTitle');

  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.languageOption === settings.language));
  }

  renderAll();
}

// Draws both streak numbers and the message under them.
function renderStreaks() {
  const streak = calculateStreak(logs);
  streakCount.textContent = String(streak);
  bestStreakCount.textContent = String(calculateBestStreak(logs));

  if (logs.length === 0) {
    streakMessage.textContent = t('startFirstStreak');
    return;
  }

  if (streak === 0) {
    streakMessage.textContent = t('noStreak');
    return;
  }

  const loggedToday = logs.some((log) => log.date === getTodayString());
  const tail = t(loggedToday ? 'tailDone' : 'tailOpen');
  streakMessage.textContent = fill(streak === 1 ? t('streakOne') : t('streakMany'), {
    days: streak,
    tail: tail,
  });
}

function renderLogs() {
  const sortedLogs = sortLogsNewestFirst(logs);

  logList.textContent = ''; // clear the list before drawing it again
  logCount.textContent = fill(logs.length === 1 ? t('logSingular') : t('logPlural'), {
    count: logs.length,
  });
  emptyState.hidden = logs.length > 0;

  const today = getTodayString();

  for (const log of sortedLogs) {
    const item = document.createElement('li');
    item.className = 'log-item';

    const habit = document.createElement('p');
    habit.className = 'log-habit';
    habit.textContent = log.habit; // textContent keeps user text safe

    // Time spent is optional, so older logs simply have no `minutes`.
    if (log.minutes) {
      const time = document.createElement('span');
      time.className = 'log-time';
      time.textContent = ` · ${log.minutes} min`;
      habit.appendChild(time);
    }

    const date = document.createElement('p');
    date.className = 'log-date';
    if (log.date === today) {
      const todayTag = document.createElement('span');
      todayTag.className = 'log-today';
      todayTag.textContent = t('today');
      date.appendChild(todayTag);
      date.appendChild(document.createTextNode(' · '));
    }
    date.appendChild(document.createTextNode(formatDateForDisplay(log.date)));

    item.appendChild(habit);

    if (log.note) {
      const note = document.createElement('p');
      note.className = 'log-note';
      note.textContent = log.note;
      item.appendChild(note);
    }

    item.appendChild(date);
    logList.appendChild(item);
  }
}

// Draws one row per habit with the time logged for it this week.
function renderWeeklyTotals() {
  const totals = getThisWeekTotals(logs);

  weeklyRange.textContent =
    `${formatDateForDisplay(getStartOfWeekString())} – ${formatDateForDisplay(getTodayString())}`;
  weeklyList.textContent = ''; // clear the list before drawing it again
  weeklyEmpty.hidden = totals.length > 0;

  for (const total of totals) {
    const item = document.createElement('li');
    item.className = 'weekly-item';

    const habit = document.createElement('span');
    habit.className = 'weekly-habit';
    habit.textContent = total.habit;

    const time = document.createElement('span');
    time.className = 'weekly-time';
    time.textContent = formatMinutes(total.minutes);

    item.appendChild(habit);
    item.appendChild(time);
    weeklyList.appendChild(item);
  }
}

// Draws one row per habit with how many days it was logged on this month.
function renderMonthlyDayCounts() {
  const counts = getThisMonthDayCounts(logs);

  monthLabel.textContent = formatMonthForDisplay(getStartOfMonthString());
  monthList.textContent = ''; // clear the list before drawing it again
  monthEmpty.hidden = counts.length > 0;

  for (const count of counts) {
    const item = document.createElement('li');
    item.className = 'month-item';

    const habit = document.createElement('span');
    habit.className = 'month-habit';
    habit.textContent = count.habit;

    const days = document.createElement('span');
    days.className = 'month-days';
    days.textContent = fill(count.days === 1 ? t('daySingular') : t('dayPlural'), {
      days: count.days,
    });

    item.appendChild(habit);
    item.appendChild(days);
    monthList.appendChild(item);
  }
}

function renderAll() {
  renderStreaks();
  renderWeeklyTotals();
  renderMonthlyDayCounts();
  renderLogs();
}

/* ========================= 9. Events ========================= */

form.addEventListener('submit', function (event) {
  event.preventDefault(); // we do not want to reload the page

  const habit = habitInput.value.trim();
  const note = noteInput.value.trim();

  // Time spent is optional. Blank (or zero) means "not recorded".
  const minutesTyped = Number.parseInt(minutesInput.value.trim(), 10);
  const minutes = Number.isFinite(minutesTyped) && minutesTyped > 0 ? minutesTyped : null;

  // `required` stops empty fields, but a value of spaces still passes it.
  if (habit === '') {
    habitInput.setCustomValidity(t('habitRequired'));
    habitInput.reportValidity();
    habitInput.focus();
    return;
  }
  habitInput.setCustomValidity('');

  // Fall back to today if the date field is somehow empty.
  const date = dateInput.value || getTodayString();

  const newLog = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    date: date,
    habit: habit,
    note: note,
  };

  // `minutes` is only written when there is a value, so logs saved before
  // this field existed stay exactly as they are.
  if (minutes !== null) {
    newLog.minutes = minutes;
  }

  logs.push(newLog);

  const saved = saveLogs();

  // Keep the chosen date so several habits can be logged for the same day.
  habitInput.value = '';
  noteInput.value = '';
  minutesInput.value = '';
  habitInput.focus();

  renderAll();

  if (!saved) {
    storageWarning.hidden = false;
  }
});

// Clear the custom error as soon as the user types again.
habitInput.addEventListener('input', function () {
  habitInput.setCustomValidity('');
});

for (const button of themeButtons) {
  button.addEventListener('click', function () {
    settings.theme = button.dataset.themeOption;
    saveSettings();
    applyTheme();
  });
}

for (const button of languageButtons) {
  button.addEventListener('click', function () {
    settings.language = button.dataset.languageOption;
    saveSettings();
    applyLanguage();
  });
}

/* ========================= 10. Start the app ========================= */

// Default the date field to today (local time).
dateInput.value = getTodayString();
dateInput.max = getTodayString(); // the diary is for today and the past

applyTheme();
applyLanguage(); // this also calls renderAll()