#!/usr/bin/env python3
"""Generate a seamless, original moonlight music-box loop."""
from pathlib import Path

import numpy as np

SR = 22050
BPM = 54
BEAT = 60.0 / BPM

PITCH = {
    "D3": 146.83,
    "G3": 196.00,
    "A3": 220.00,
    "B3": 246.94,
    "D4": 293.66,
    "E4": 329.63,
    "G4": 392.00,
    "A4": 440.00,
    "B4": 493.88,
    "D5": 587.33,
    "E5": 659.25,
    "G5": 783.99,
}


def fade_edges(samples: np.ndarray, ms: float = 12) -> np.ndarray:
    n = max(1, int(SR * ms / 1000))
    n = min(n, samples.size // 2)
    ramp = np.linspace(0, 1, n)
    samples[:n] *= ramp
    samples[-n:] *= ramp[::-1]
    return samples


def music_box(freq: float, dur: float, vel: float = 0.2) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    wave = (
        np.sin(2 * np.pi * freq * t) * 0.72
        + np.sin(2 * np.pi * freq * 2 * t) * 0.16
        + np.sin(2 * np.pi * freq * 3 * t) * 0.05
        + np.sin(2 * np.pi * freq * 4 * t) * 0.02
    )
    env = (1 - np.exp(-t * 90)) * np.exp(-t * 2.15)
    return fade_edges(wave * env * vel)


def pad_tone(freq: float, dur: float, vel: float = 0.04) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t)
    wave = np.sin(2 * np.pi * freq * t) * 0.7 + np.sin(2 * np.pi * freq * 0.5 * t) * 0.3
    attack = min(int(1.4 * SR), n // 3)
    release = min(int(2.2 * SR), n // 2)
    env = np.ones(n)
    env[:attack] = np.linspace(0, 1, attack)
    env[-release:] *= np.linspace(1, 0, release)
    return wave * env * vel * lfo


def place(track: np.ndarray, clip: np.ndarray, start_beat: float) -> None:
    start = int(start_beat * BEAT * SR)
    end = min(start + clip.size, track.size)
    if start >= track.size:
        return
    track[start:end] += clip[: end - start]


def reverb(x: np.ndarray) -> np.ndarray:
    out = x.copy()
    taps = [(0.18, 0.28), (0.31, 0.16), (0.47, 0.1), (0.72, 0.06), (1.05, 0.035)]
    for delay, gain in taps:
        d = int(delay * SR)
        out[d:] += x[:-d] * gain
    return out


def mix_and_loop() -> np.ndarray:
    # 32 beats ≈ 35.6s; pad holds a little extra for the loop join
    total_beats = 32
    track = np.zeros(int(total_beats * BEAT * SR) + int(2.5 * SR))

    melody = [
        (0, "G4", 2.0, 0.22),
        (2, "D5", 2.0, 0.20),
        (4, "B4", 1.5, 0.18),
        (5.5, "A4", 1.5, 0.16),
        (7, "G4", 1.0, 0.15),
        (10, "E5", 1.0, 0.18),
        (11, "D5", 2.0, 0.19),
        (13, "B4", 1.0, 0.16),
        (14, "A4", 2.0, 0.16),
        (16, "D5", 2.0, 0.20),
        (18, "E5", 1.0, 0.17),
        (19, "G5", 2.0, 0.15),
        (21, "E5", 1.0, 0.16),
        (22, "D5", 2.0, 0.18),
        (24, "B4", 2.0, 0.16),
        (26, "A4", 2.0, 0.15),
        (28, "G4", 3.5, 0.18),
    ]
    for start, name, beats, vel in melody:
        place(track, music_box(PITCH[name], beats * BEAT + 0.45, vel), start)

    bass = [
        (0, "G3", 4),
        (4, "D4", 4),
        (8, "E4", 4),
        (12, "D4", 4),
        (16, "G3", 4),
        (20, "A3", 4),
        (24, "B3", 4),
        (28, "D4", 4),
    ]
    for start, name, beats in bass:
        place(track, pad_tone(PITCH[name], beats * BEAT + 0.8, 0.045), start)
        fifth = {
            "G3": "D4",
            "D4": "A4",
            "E4": "B4",
            "A3": "E4",
            "B3": "D4",
        }[name]
        place(track, pad_tone(PITCH[fifth], beats * BEAT + 0.8, 0.028), start + 0.05)

    loop_len = int(total_beats * BEAT * SR)
    wet = reverb(track[: loop_len + int(1.2 * SR)])
    loop = wet[:loop_len].copy()
    xfade = int(2.0 * SR)
    loop[-xfade:] *= np.linspace(1, 0, xfade)
    loop[-xfade:] += wet[:xfade] * np.linspace(0, 1, xfade)

    peak = np.max(np.abs(loop)) or 1
    loop = loop / peak * 0.72
    return np.clip(loop, -1, 1)


def write_wav(path: Path, samples: np.ndarray) -> None:
    pcm = (samples * 32767).astype(np.int16)
    header = bytearray()
    n = pcm.size * 2
    header.extend(b"RIFF")
    header.extend((36 + n).to_bytes(4, "little"))
    header.extend(b"WAVEfmt ")
    header.extend((16).to_bytes(4, "little"))
    header.extend((1).to_bytes(2, "little"))  # PCM
    header.extend((1).to_bytes(2, "little"))  # mono
    header.extend(SR.to_bytes(4, "little"))
    header.extend((SR * 2).to_bytes(4, "little"))
    header.extend((2).to_bytes(2, "little"))
    header.extend((16).to_bytes(2, "little"))
    header.extend(b"data")
    header.extend(n.to_bytes(4, "little"))
    path.write_bytes(bytes(header) + pcm.tobytes())


if __name__ == "__main__":
    out = Path(__file__).with_name("moonlit.wav")
    write_wav(out, mix_and_loop())
    print(f"wrote {out} ({out.stat().st_size} bytes)")
