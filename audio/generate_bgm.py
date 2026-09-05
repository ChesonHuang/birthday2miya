#!/usr/bin/env python3
"""Generate a looping music-box arrangement of Happy Birthday (public domain melody)."""
from pathlib import Path

import numpy as np

SR = 22050
BPM = 78
BEAT = 60.0 / BPM

PITCH = {
    "C3": 130.81,
    "G3": 196.00,
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "Bb4": 466.16,
    "C5": 523.25,
    "D5": 587.33,
    "E5": 659.25,
    "F5": 698.46,
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
    env = (1 - np.exp(-t * 90)) * np.exp(-t * 2.35)
    return fade_edges(wave * env * vel)


def pad_tone(freq: float, dur: float, vel: float = 0.04) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t)
    wave = np.sin(2 * np.pi * freq * t) * 0.7 + np.sin(2 * np.pi * freq * 0.5 * t) * 0.3
    attack = min(int(1.2 * SR), n // 3)
    release = min(int(1.8 * SR), n // 2)
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
    taps = [(0.16, 0.26), (0.29, 0.14), (0.44, 0.09), (0.68, 0.05), (0.98, 0.03)]
    for delay, gain in taps:
        d = int(delay * SR)
        out[d:] += x[:-d] * gain
    return out


def line_zhu_ni(offset: float, closing="E4"):
    """祝你生日快乐 — same rhythm as 'Happy birthday to you'."""
    third = "G4" if closing == "F4" else "F4"
    last = closing
    return [
        (offset + 0, "C4", 0.5, 0.17),
        (offset + 0.5, "C4", 0.5, 0.16),
        (offset + 1, "D4", 1.0, 0.20),
        (offset + 2, "C4", 1.0, 0.18),
        (offset + 3, third, 1.0, 0.21),
        (offset + 4, last, 2.0, 0.23),
    ]


def line_zhu_miya(offset: float):
    """祝米娅生日快乐 — 7 syllables on the 'dear Mia' phrase."""
    # 祝 米 娅 生 日 快 乐
    return [
        (offset + 0, "C4", 0.5, 0.20),
        (offset + 0.5, "C4", 0.5, 0.20),
        (offset + 1, "C5", 1.0, 0.28),   # 娅 — 高音点名
        (offset + 2, "A4", 1.0, 0.24),
        (offset + 3, "F4", 1.0, 0.22),
        (offset + 4, "E4", 1.0, 0.22),
        (offset + 5, "D4", 2.0, 0.23),
    ]


def line_close(offset: float):
    """末句 祝你生日快乐."""
    return [
        (offset + 0, "Bb4", 0.5, 0.18),
        (offset + 0.5, "Bb4", 0.5, 0.16),
        (offset + 1, "A4", 1.0, 0.20),
        (offset + 2, "F4", 1.0, 0.18),
        (offset + 3, "G4", 1.0, 0.21),
        (offset + 4, "F4", 3.0, 0.25),
    ]


def stanza(offset: float):
    """祝你生日快乐 ×2 → 祝米娅生日快乐 ×2 → 祝你生日快乐."""
    notes = []
    notes += line_zhu_ni(offset + 0, "E4")
    notes += line_zhu_ni(offset + 6, "F4")
    notes += line_zhu_miya(offset + 12)
    notes += line_zhu_miya(offset + 19)
    notes += line_close(offset + 26)
    return notes


def mix_and_loop() -> np.ndarray:
    # one stanza ~33 beats, play twice
    total_beats = 68
    track = np.zeros(int(total_beats * BEAT * SR) + int(2.5 * SR))

    melody = stanza(0) + stanza(34)
    for start, name, beats, vel in melody:
        place(track, music_box(PITCH[name], beats * BEAT + 0.35, vel), start)
        # 米娅（C5）加一点高八度铃音，让中间这句更清楚
        if name == "C5":
            place(track, music_box(PITCH["E5"], beats * BEAT + 0.25, vel * 0.35), start)

    bass = [
        (0, "C3", 6),
        (6, "C3", 6),
        (12, "F4", 7),
        (19, "F4", 7),
        (26, "C3", 8),
        (34, "C3", 6),
        (40, "C3", 6),
        (46, "F4", 7),
        (53, "F4", 7),
        (60, "C3", 8),
    ]
    for start, name, beats in bass:
        place(track, pad_tone(PITCH[name], beats * BEAT + 0.6, 0.038), start)
        place(track, pad_tone(PITCH["G3"], beats * BEAT + 0.6, 0.022), start + 0.04)

    loop_len = int(total_beats * BEAT * SR)
    wet = reverb(track[: loop_len + int(1.2 * SR)])
    loop = wet[:loop_len].copy()
    xfade = int(1.6 * SR)
    loop[-xfade:] *= np.linspace(1, 0, xfade)
    loop[-xfade:] += wet[:xfade] * np.linspace(0, 1, xfade)

    peak = np.max(np.abs(loop)) or 1
    loop = loop / peak * 0.74
    return np.clip(loop, -1, 1)


def write_wav(path: Path, samples: np.ndarray) -> None:
    pcm = (samples * 32767).astype(np.int16)
    header = bytearray()
    n = pcm.size * 2
    header.extend(b"RIFF")
    header.extend((36 + n).to_bytes(4, "little"))
    header.extend(b"WAVEfmt ")
    header.extend((16).to_bytes(4, "little"))
    header.extend((1).to_bytes(2, "little"))
    header.extend((1).to_bytes(2, "little"))
    header.extend(SR.to_bytes(4, "little"))
    header.extend((SR * 2).to_bytes(4, "little"))
    header.extend((2).to_bytes(2, "little"))
    header.extend((16).to_bytes(2, "little"))
    header.extend(b"data")
    header.extend(n.to_bytes(4, "little"))
    path.write_bytes(bytes(header) + pcm.tobytes())


if __name__ == "__main__":
    out = Path(__file__).with_name("happy-birthday.wav")
    write_wav(out, mix_and_loop())
    print(f"wrote {out} ({out.stat().st_size} bytes)")
