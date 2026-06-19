const sessions = {
  5: {
    minutes: 5,
    duration: 300,
    src: "audio/hrv-breath-5min.mp3",
  },
  8: {
    minutes: 8,
    duration: 480,
    src: "audio/hrv-breath-8min.mp3",
  },
  12: {
    minutes: 12,
    duration: 720,
    src: "audio/hrv-breath-12min.mp3",
  },
};

const inhaleSeconds = 90 / 17;
const exhaleSeconds = 110 / 17;
const cycleSeconds = inhaleSeconds + exhaleSeconds;
const ringLength = 578.05;

const audio = document.querySelector("#audio");
const playButton = document.querySelector("#play-button");
const playLabel = document.querySelector("#play-label");
const phaseLabel = document.querySelector("#phase-label");
const phaseTime = document.querySelector("#phase-time");
const elapsedTime = document.querySelector("#elapsed-time");
const remainingTime = document.querySelector("#remaining-time");
const sessionTitle = document.querySelector("#session-title");
const sessionDetail = document.querySelector("#session-detail");
const seek = document.querySelector("#seek");
const statusDot = document.querySelector("#status-dot");
const ratio = document.querySelector("#ratio");
const ring = document.querySelector(".ring-progress");
const durationCards = Array.from(document.querySelectorAll(".duration-card"));

let selected = "8";
let wakeLock = null;
let rafId = null;
let isSeeking = false;

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function comma(value) {
  return value.toFixed(2).replace(".", ",");
}

function commaOne(value) {
  return value.toFixed(1).replace(".", ",");
}

function setSession(next) {
  const wasPlaying = !audio.paused;
  selected = next;
  const session = sessions[selected];
  audio.pause();
  audio.src = session.src;
  audio.load();
  seek.max = String(session.duration);
  seek.value = "0";
  sessionTitle.textContent = `${session.minutes} minuten`;
  sessionDetail.textContent = `${formatTime(session.duration)} op jouw ademritme`;
  remainingTime.textContent = `-${formatTime(session.duration)}`;
  durationCards.forEach((card) => {
    const active = card.dataset.duration === selected;
    card.classList.toggle("selected", active);
    card.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateProgress(0);
  if (wasPlaying) {
    playAudio();
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch {
    // Ignore browsers that revoke locks during visibility changes.
  }
  wakeLock = null;
}

function setPlayingState(playing) {
  playButton.classList.toggle("playing", playing);
  playButton.setAttribute("aria-label", playing ? "Pauzeer sessie" : "Start sessie");
  playLabel.textContent = playing ? "Pauze" : audio.currentTime > 0 ? "Verder" : "Start";
}

async function playAudio() {
  try {
    await audio.play();
    setPlayingState(true);
    requestWakeLock();
    startAnimation();
  } catch {
    statusDot.textContent = "tik nogmaals";
  }
}

function pauseAudio() {
  audio.pause();
  setPlayingState(false);
  releaseWakeLock();
  stopAnimation();
}

function updateProgress(current) {
  const session = sessions[selected];
  const clamped = Math.min(current, session.duration);
  const cyclePosition = clamped % cycleSeconds;
  const isInhale = cyclePosition < inhaleSeconds;
  const phaseDuration = isInhale ? inhaleSeconds : exhaleSeconds;
  const phasePosition = isInhale ? cyclePosition : cyclePosition - inhaleSeconds;
  const phaseRemaining = Math.max(0, phaseDuration - phasePosition);
  const phaseProgress = phasePosition / phaseDuration;
  const sessionProgress = session.duration ? clamped / session.duration : 0;

  phaseLabel.textContent = isInhale ? "Adem in" : "Adem uit";
  phaseTime.textContent = comma(phaseRemaining);
  elapsedTime.textContent = formatTime(clamped);
  remainingTime.textContent = `-${formatTime(session.duration - clamped)}`;
  seek.value = String(clamped);
  seek.style.setProperty("--seek-percent", `${sessionProgress * 100}%`);
  ring.style.strokeDashoffset = String(ringLength * (1 - phaseProgress));
}

function animationFrame() {
  if (!isSeeking) {
    updateProgress(audio.currentTime);
  }
  rafId = requestAnimationFrame(animationFrame);
}

function startAnimation() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(animationFrame);
}

function stopAnimation() {
  if (rafId === null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
  updateProgress(audio.currentTime);
}

playButton.addEventListener("click", () => {
  if (audio.paused) {
    playAudio();
  } else {
    pauseAudio();
  }
});

durationCards.forEach((card) => {
  card.addEventListener("click", () => {
    setSession(card.dataset.duration);
  });
});

seek.addEventListener("pointerdown", () => {
  isSeeking = true;
});

seek.addEventListener("input", () => {
  updateProgress(Number(seek.value));
});

seek.addEventListener("change", () => {
  audio.currentTime = Number(seek.value);
  isSeeking = false;
  updateProgress(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  updateProgress(audio.currentTime);
});

audio.addEventListener("ended", () => {
  audio.currentTime = 0;
  setPlayingState(false);
  releaseWakeLock();
  stopAnimation();
  updateProgress(0);
});

audio.addEventListener("pause", () => {
  setPlayingState(false);
});

audio.addEventListener("play", () => {
  setPlayingState(true);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !audio.paused) {
    requestWakeLock();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => {
      statusDot.textContent = "offline-ready";
    })
    .catch(() => {
      statusDot.textContent = "online";
    });
}

ratio.textContent = `${commaOne(inhaleSeconds)}s in · ${commaOne(exhaleSeconds)}s uit`;
setSession(selected);
