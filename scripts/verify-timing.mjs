import { readFileSync } from "node:fs";

const inhaleSeconds = 90 / 17;
const exhaleSeconds = 110 / 17;
const cycleSeconds = inhaleSeconds + exhaleSeconds;
const breathsPerMinute = 60 / cycleSeconds;

const checks = [
  ["public/app.js", "const inhaleSeconds = 90 / 17;"],
  ["public/app.js", "const exhaleSeconds = 110 / 17;"],
  ["scripts/render_audio_assets.py", "INHALE_SECONDS = 90 / 17"],
  ["scripts/render_audio_assets.py", "EXHALE_SECONDS = 110 / 17"],
  ["public/index.html", "5,3s in · 6,5s uit"],
  ["public/index.html", "app.js?v=timing-5-1-v1"],
  ["public/app.js", "const assetVersion = \"timing-5-1-v1\";"],
  ["public/service-worker.js", "const CACHE_NAME = \"ademritme-v8\";"],
  ["public/service-worker.js", "request.mode === \"navigate\" || request.destination === \"script\""],
  ["public/service-worker.js", "audio/hrv-breath-8min.mp3?v=timing-5-1-v1"],
];

for (const [file, needle] of checks) {
  const contents = readFileSync(file, "utf8");
  if (!contents.includes(needle)) {
    throw new Error(`${file} is missing expected timing marker: ${needle}`);
  }
}

if (Math.abs(breathsPerMinute - 5.1) > 0.000001) {
  throw new Error(`breathsPerMinute ${breathsPerMinute}, expected 5.1`);
}

console.log(`timing-ok: ${inhaleSeconds.toFixed(3)}s in, ${exhaleSeconds.toFixed(3)}s uit, ${breathsPerMinute.toFixed(1)}/min`);
