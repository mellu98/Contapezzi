const CONFIG = {
  storageKey: "contapezzi-state-v2",
  piecesPerHour: 600,
  shiftHours: 8,
};

const HOUR_MS = 60 * 60 * 1000;
const SECOND_MS = 1000;
const SHIFT_MS = CONFIG.shiftHours * HOUR_MS;
const MAX_TARGET = CONFIG.piecesPerHour * CONFIG.shiftHours;
const PIECES_PER_MINUTE = CONFIG.piecesPerHour / 60;

const defaultState = () => ({
  shiftStartedAt: null,
  stopStartedAt: null,
  accumulatedStopMs: 0,
  completed: false,
  actualPieces: 0,
  actualCounterTouched: false,
});

const elements = {
  timerDisplay: document.querySelector("#timerDisplay"),
  timerNote: document.querySelector("#timerNote"),
  sessionStatus: document.querySelector("#sessionStatus"),
  startButton: document.querySelector("#startButton"),
  stopButton: document.querySelector("#stopButton"),
  resetButton: document.querySelector("#resetButton"),
  expectedPieces: document.querySelector("#expectedPieces"),
  expectedPiecesNote: document.querySelector("#expectedPiecesNote"),
  shiftProgress: document.querySelector("#shiftProgress"),
  shiftProgressNote: document.querySelector("#shiftProgressNote"),
  justifiedPieces: document.querySelector("#justifiedPieces"),
  justifiedPiecesNote: document.querySelector("#justifiedPiecesNote"),
  downtimeTotal: document.querySelector("#downtimeTotal"),
  downtimeTotalNote: document.querySelector("#downtimeTotalNote"),
  remainingTime: document.querySelector("#remainingTime"),
  remainingTimeNote: document.querySelector("#remainingTimeNote"),
  shiftTarget: document.querySelector("#shiftTarget"),
  shiftTargetNote: document.querySelector("#shiftTargetNote"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  progressCaption: document.querySelector("#progressCaption"),
  actualPiecesInput: document.querySelector("#actualPiecesInput"),
  deltaCard: document.querySelector("#deltaCard"),
  deltaValue: document.querySelector("#deltaValue"),
  deltaHint: document.querySelector("#deltaHint"),
  counterResetButton: document.querySelector("#counterResetButton"),
  installButton: document.querySelector("#installButton"),
  adjustButtons: document.querySelectorAll("[data-adjust]"),
};

let state = loadState();
let deferredInstallPrompt = null;
let lastRenderedSecond = -1;

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);

    if (!raw) {
      return defaultState();
    }

    return sanitizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function sanitizeState(candidate) {
  const clean = defaultState();

  clean.shiftStartedAt = isValidTimestamp(candidate.shiftStartedAt) ? candidate.shiftStartedAt : null;
  clean.stopStartedAt = isValidTimestamp(candidate.stopStartedAt) ? candidate.stopStartedAt : null;
  clean.accumulatedStopMs = clampNumber(candidate.accumulatedStopMs, 0, SHIFT_MS);
  clean.completed = Boolean(candidate.completed);
  clean.actualPieces = Math.max(0, Math.floor(Number(candidate.actualPieces) || 0));
  clean.actualCounterTouched = Boolean(candidate.actualCounterTouched);

  if (!clean.shiftStartedAt) {
    return defaultState();
  }

  if (clean.completed) {
    clean.stopStartedAt = null;
  }

  return clean;
}

function saveState() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
}

function clampNumber(value, min, max) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.min(Math.max(numeric, min), max);
}

function isValidTimestamp(value) {
  return Number.isFinite(value) && value > 0;
}

function hasStarted() {
  return Boolean(state.shiftStartedAt);
}

function isStopped() {
  return Boolean(state.stopStartedAt);
}

function getShiftElapsedMs(now = Date.now()) {
  if (!hasStarted()) {
    return 0;
  }

  return Math.min(Math.max(now - state.shiftStartedAt, 0), SHIFT_MS);
}

function getDowntimeMs(now = Date.now()) {
  if (!hasStarted()) {
    return 0;
  }

  const liveDowntime = state.accumulatedStopMs + (isStopped() ? now - state.stopStartedAt : 0);
  return Math.min(Math.max(liveDowntime, 0), getShiftElapsedMs(now));
}

function getProductiveMs(now = Date.now()) {
  return Math.max(getShiftElapsedMs(now) - getDowntimeMs(now), 0);
}

function getExpectedPiecesRaw(now = Date.now()) {
  return Math.min((getProductiveMs(now) / HOUR_MS) * CONFIG.piecesPerHour, MAX_TARGET);
}

function getJustifiedPiecesRaw(now = Date.now()) {
  return Math.min((getDowntimeMs(now) / HOUR_MS) * CONFIG.piecesPerHour, MAX_TARGET);
}

function getDynamicTargetRaw(now = Date.now()) {
  return Math.max(MAX_TARGET - getJustifiedPiecesRaw(now), 0);
}

function completeShift(now = Date.now()) {
  state.accumulatedStopMs = getDowntimeMs(now);
  state.stopStartedAt = null;
  state.completed = true;
  saveState();
  render(now, true);
}

function maybeCompleteShift(now = Date.now()) {
  if (!hasStarted() || state.completed) {
    return;
  }

  if (getShiftElapsedMs(now) >= SHIFT_MS) {
    completeShift(now);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND_MS));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function setStatus(label, className) {
  elements.sessionStatus.textContent = label;
  elements.sessionStatus.classList.remove(
    "status-idle",
    "status-running",
    "status-paused",
    "status-stop",
    "status-done"
  );
  elements.sessionStatus.classList.add(className);
}

function updateButtons() {
  if (state.completed) {
    elements.startButton.textContent = "Turno chiuso";
    elements.startButton.disabled = true;
    elements.stopButton.disabled = true;
    return;
  }

  if (!hasStarted()) {
    elements.startButton.textContent = "Avvia turno";
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    return;
  }

  if (isStopped()) {
    elements.startButton.textContent = "Riprendi linea";
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    return;
  }

  elements.startButton.textContent = "Linea attiva";
  elements.startButton.disabled = true;
  elements.stopButton.disabled = false;
}

function updateActualCounter(expectedWholePieces) {
  elements.actualPiecesInput.value = String(state.actualPieces);
  elements.deltaCard.classList.remove("delta-ahead", "delta-behind", "delta-neutral");

  if (!state.actualCounterTouched) {
    elements.deltaValue.textContent = "--";
    elements.deltaHint.textContent = "Inserisci i pezzi reali per confrontarli con il passo teorico.";
    return;
  }

  const delta = state.actualPieces - expectedWholePieces;

  if (delta > 0) {
    elements.deltaCard.classList.add("delta-ahead");
    elements.deltaValue.textContent = `+${formatInteger(delta)}`;
    elements.deltaHint.textContent = "Sei avanti rispetto ai pezzi teorici di questo momento.";
    return;
  }

  if (delta < 0) {
    elements.deltaCard.classList.add("delta-behind");
    elements.deltaValue.textContent = formatInteger(delta);
    elements.deltaHint.textContent = "Sei indietro rispetto ai pezzi teorici di questo momento.";
    return;
  }

  elements.deltaCard.classList.add("delta-neutral");
  elements.deltaValue.textContent = "0";
  elements.deltaHint.textContent = "Sei perfettamente allineato ai pezzi teorici.";
}

function render(now = Date.now(), force = false) {
  maybeCompleteShift(now);

  const elapsedShiftMs = getShiftElapsedMs(now);
  const roundedSecond = Math.floor(elapsedShiftMs / SECOND_MS);

  if (!force && roundedSecond === lastRenderedSecond) {
    return;
  }

  lastRenderedSecond = roundedSecond;

  const downtimeMs = getDowntimeMs(now);
  const productiveMs = getProductiveMs(now);
  const remainingMs = Math.max(SHIFT_MS - elapsedShiftMs, 0);
  const expectedRaw = getExpectedPiecesRaw(now);
  const justifiedRaw = getJustifiedPiecesRaw(now);
  const dynamicTargetRaw = getDynamicTargetRaw(now);
  const expectedWholePieces = Math.floor(expectedRaw);
  const justifiedWholePieces = Math.floor(justifiedRaw);
  const dynamicTargetWhole = Math.floor(dynamicTargetRaw);
  const progressPercent = hasStarted() ? Math.min((elapsedShiftMs / SHIFT_MS) * 100, 100) : 0;

  elements.timerDisplay.textContent = formatDuration(elapsedShiftMs);
  elements.expectedPieces.textContent = formatInteger(expectedWholePieces);
  elements.expectedPiecesNote.textContent =
    `Tempo produttivo utile: ${formatDuration(productiveMs)}.`;
  elements.shiftProgress.textContent = `${formatDecimal(progressPercent)}%`;
  elements.shiftProgressNote.textContent =
    hasStarted()
      ? `Turno reale trascorso: ${formatDuration(elapsedShiftMs)} su ${formatDuration(SHIFT_MS)}.`
      : "Nessun turno attivo.";
  elements.justifiedPieces.textContent = formatInteger(justifiedWholePieces);
  elements.justifiedPiecesNote.textContent =
    justifiedWholePieces > 0
      ? `Il fermo ha gia tolto ${formatDecimal(justifiedRaw)} pezzi dal massimo turno.`
      : "Aumentano solo quando attivi il fermo macchina.";
  elements.downtimeTotal.textContent = formatDuration(downtimeMs);
  elements.downtimeTotalNote.textContent =
    downtimeMs > 0
      ? `Ogni minuto di fermo riduce il target di ${formatInteger(PIECES_PER_MINUTE)} pezzi.`
      : "Nessun fermo registrato.";
  elements.remainingTime.textContent = formatDuration(remainingMs);
  elements.remainingTimeNote.textContent =
    hasStarted() && remainingMs > 0
      ? `Restano ${formatDuration(remainingMs)} di turno reale.`
      : hasStarted()
        ? "Turno reale da 8 ore completato."
        : "Mancano tutte le 8 ore.";
  elements.shiftTarget.textContent = formatInteger(dynamicTargetWhole);
  elements.shiftTargetNote.textContent =
    dynamicTargetWhole < MAX_TARGET
      ? `Massimo raggiungibile adesso: ${formatInteger(dynamicTargetWhole)} pezzi.`
      : "Se non ci sono fermi resta al massimo di 4.800 pezzi.";
  elements.progressPercent.textContent = `${formatDecimal(progressPercent)}%`;
  elements.progressFill.style.width = `${progressPercent}%`;

  if (state.completed) {
    setStatus("Turno completato", "status-done");
    elements.timerNote.textContent = "Turno da 8 ore reali completato.";
    elements.progressCaption.textContent =
      `Chiusura turno: target finale ${formatInteger(dynamicTargetWhole)} pezzi, giustificati ${formatInteger(justifiedWholePieces)}.`;
  } else if (isStopped()) {
    setStatus("Macchina ferma", "status-stop");
    elements.timerNote.textContent = "Fermo attivo: il target turno si riduce in tempo reale.";
    elements.progressCaption.textContent =
      `Fermo in corso: il massimo cala di ${formatInteger(PIECES_PER_MINUTE)} pezzi al minuto.`;
  } else if (hasStarted()) {
    setStatus("In produzione", "status-running");
    elements.timerNote.textContent = "Turno reale attivo. Premi Fermo se la macchina si blocca.";
    elements.progressCaption.textContent =
      `Adesso dovresti stare a ${formatInteger(expectedWholePieces)} pezzi teorici su un massimo aggiornato di ${formatInteger(dynamicTargetWhole)}.`;
  } else {
    setStatus("Non avviato", "status-idle");
    elements.timerNote.textContent = "Avvia il turno quando inizi a lavorare.";
    elements.progressCaption.textContent =
      "Avvia il turno per vedere quanti pezzi dovresti avere e come cambia il target in caso di fermo.";
  }

  updateButtons();
  updateActualCounter(expectedWholePieces);
}

function startShift() {
  if (state.completed) {
    return;
  }

  const now = Date.now();

  if (!hasStarted()) {
    state.shiftStartedAt = now;
    state.stopStartedAt = null;
    state.accumulatedStopMs = 0;
    saveState();
    render(now, true);
    return;
  }

  if (!isStopped()) {
    return;
  }

  state.accumulatedStopMs = getDowntimeMs(now);
  state.stopStartedAt = null;
  saveState();
  render(now, true);
}

function startStop() {
  if (!hasStarted() || state.completed || isStopped()) {
    return;
  }

  state.stopStartedAt = Date.now();
  saveState();
  render(undefined, true);
}

function resetShift() {
  const shouldReset = window.confirm("Azzero turno, fermi e contatore pezzi reali?");

  if (!shouldReset) {
    return;
  }

  state = defaultState();
  saveState();
  render(undefined, true);
}

function setActualPieces(nextValue, touched = true) {
  state.actualPieces = Math.max(0, Math.floor(Number(nextValue) || 0));
  state.actualCounterTouched = touched;
  saveState();
  render(undefined, true);
}

function resetActualPieces() {
  state.actualPieces = 0;
  state.actualCounterTouched = false;
  saveState();
  render(undefined, true);
}

function registerEvents() {
  elements.startButton.addEventListener("click", startShift);
  elements.stopButton.addEventListener("click", startStop);
  elements.resetButton.addEventListener("click", resetShift);
  elements.counterResetButton.addEventListener("click", resetActualPieces);

  elements.actualPiecesInput.addEventListener("input", (event) => {
    setActualPieces(event.target.value, true);
  });

  for (const button of elements.adjustButtons) {
    button.addEventListener("click", () => {
      const adjustment = Number(button.dataset.adjust);
      setActualPieces(state.actualPieces + adjustment, true);
    });
  }

  document.addEventListener("visibilitychange", () => {
    render(undefined, true);
  });

  window.addEventListener("focus", () => {
    render(undefined, true);
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // Keep the page usable even if service worker registration fails.
  }
}

function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

function bootstrap() {
  registerEvents();
  registerInstallPrompt();
  registerServiceWorker();
  render(undefined, true);
  window.setInterval(() => render(), 250);
}

bootstrap();
