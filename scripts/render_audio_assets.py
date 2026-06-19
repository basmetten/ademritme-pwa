#!/usr/bin/env python3
"""Render the selected HRV breath-guide audio in 5, 8, and 12 minute versions."""

from __future__ import annotations

import math
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SOURCE = Path("/Users/basmetten/Downloads/sample voorbeeld beter.m4a")
PUBLIC_AUDIO = Path("/Users/basmetten/hrv-breath-pwa/public/audio")
SAMPLE_RATE = 48_000
INHALE_SECONDS = 90 / 17
EXHALE_SECONDS = 110 / 17
TARGET_MEAN_DB = -40.5
TARGET_PEAK_DB = -20.4


@dataclass(frozen=True)
class Segment:
    label: str
    start: float
    end: float


INHALE_SEGMENT = Segment("sample_00.00-05.49", 0.00, 5.49)
EXHALE_SEGMENT = Segment("sample_05.49-10.97", 5.49, 10.97)
DURATIONS = {
    "5": 5 * 60,
    "8": 8 * 60,
    "12": 12 * 60,
}


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        frames = wav.readframes(wav.getnframes())
    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio.astype(np.float32)


def write_wav(audio: np.ndarray, path: Path) -> None:
    pcm = (np.clip(audio, -0.98, 0.98) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())


def decode_source(tmp: Path) -> np.ndarray:
    wav_path = tmp / "source.wav"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(SOURCE), "-ar", str(SAMPLE_RATE), "-ac", "1",
        str(wav_path),
    ])
    audio = read_wav(wav_path)
    return audio - float(np.mean(audio))


def cut(source: np.ndarray, segment: Segment) -> np.ndarray:
    start = int(round(segment.start * SAMPLE_RATE))
    end = int(round(segment.end * SAMPLE_RATE))
    piece = source[start:end].astype(np.float32)
    return piece - float(np.mean(piece))


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def fade_edges(audio: np.ndarray, seconds: float) -> np.ndarray:
    audio = audio.copy()
    fade = min(int(seconds * SAMPLE_RATE), len(audio) // 2)
    if fade <= 0:
        return audio
    env = smoothstep(np.linspace(0.0, 1.0, fade, dtype=np.float32))
    audio[:fade] *= env
    audio[-fade:] *= env[::-1]
    return audio


def stretch(piece: np.ndarray, seconds: float, tmp: Path, name: str) -> np.ndarray:
    input_wav = tmp / f"{name}_input.wav"
    output_wav = tmp / f"{name}_output.wav"
    write_wav(piece, input_wav)
    run([
        "rubberband", "--fine", "--quiet", "--duration", f"{seconds:.9f}",
        str(input_wav), str(output_wav),
    ])
    audio = read_wav(output_wav)
    target = int(round(seconds * SAMPLE_RATE))
    if len(audio) < target:
        audio = np.pad(audio, (0, target - len(audio)))
    return fade_edges(audio[:target], 0.055)


def rms_db(audio: np.ndarray) -> float:
    return 20.0 * math.log10(float(np.sqrt(np.mean(audio * audio))) + 1e-12)


def level_match(audio: np.ndarray) -> np.ndarray:
    matched = audio * (10 ** ((TARGET_MEAN_DB - rms_db(audio)) / 20.0))
    max_peak = 10 ** (TARGET_PEAK_DB / 20.0)
    peak = max(float(np.max(np.abs(matched))), 1e-12)
    if peak > max_peak:
        matched *= max_peak / peak
    return matched.astype(np.float32)


def assemble(inhale: np.ndarray, exhale: np.ndarray, duration_seconds: int) -> np.ndarray:
    target = duration_seconds * SAMPLE_RATE
    cycle = np.concatenate([inhale, exhale])
    repeats = int(math.ceil(target / len(cycle)))
    audio = np.tile(cycle, repeats)[:target]
    return level_match(fade_edges(audio, 0.35))


def encode_mp3(wav_path: Path, mp3_path: Path) -> None:
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-codec:a", "libmp3lame", "-q:a", "1", str(mp3_path),
    ])


def main() -> None:
    PUBLIC_AUDIO.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        source = decode_source(tmp)
        inhale = stretch(cut(source, INHALE_SEGMENT), INHALE_SECONDS, tmp, "inhale")
        exhale = stretch(cut(source, EXHALE_SEGMENT), EXHALE_SECONDS, tmp, "exhale")
        for label, seconds in DURATIONS.items():
            wav_path = PUBLIC_AUDIO / f"hrv-breath-{label}min.wav"
            mp3_path = PUBLIC_AUDIO / f"hrv-breath-{label}min.mp3"
            audio = assemble(inhale, exhale, seconds)
            write_wav(audio, wav_path)
            encode_mp3(wav_path, mp3_path)
            wav_path.unlink()
            print(f"{mp3_path.name}: {seconds}s")


if __name__ == "__main__":
    main()
