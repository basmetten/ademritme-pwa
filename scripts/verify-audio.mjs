import { execFileSync } from "node:child_process";

const expected = {
  "public/audio/hrv-breath-5min.mp3": 300,
  "public/audio/hrv-breath-8min.mp3": 480,
  "public/audio/hrv-breath-12min.mp3": 720,
};

for (const [file, duration] of Object.entries(expected)) {
  const output = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ], { encoding: "utf8" });
  const actual = Number.parseFloat(output.trim());
  if (Math.abs(actual - duration) > 0.02) {
    throw new Error(`${file} duration ${actual}, expected ${duration}`);
  }
  console.log(`${file}: ${actual.toFixed(3)}s`);
}
