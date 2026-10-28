"""
Makes the battlefield's world sounds into src/audio/sfx: fires, houses falling
in, smoke rounds, wind and birds are synthesised here; the anti-tank gun and
the distant guns are made from the game's own recorded clips. Needs numpy and
ffmpeg (with libvorbis) on the path.

    python tools/make-sounds.py
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX = os.path.join(ROOT, 'src', 'audio', 'sfx')
rng = np.random.default_rng(1944)


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def lowpass(x, cutoff):
    """One-pole low-pass, run twice for a softer slope."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        x = y
    return x


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def fast_lowpass(x, cutoff):
    """Low-pass in the frequency domain (for long noise beds)."""
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    f *= 1 / (1 + (freqs / cutoff) ** 4)
    return np.fft.irfft(f, len(x))


def band(x, lo, hi):
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    f *= 1 / (1 + (lo / np.maximum(freqs, 1)) ** 4) / (1 + (freqs / hi) ** 4)
    return np.fft.irfft(f, len(x))


def normalize(x, peak=0.9):
    return x * (peak / max(1e-9, np.max(np.abs(x))))


def loopable(x, fade=0.5):
    """Crossfade the tail into the head so the clip loops without a click."""
    n = int(fade * SR)
    head, tail = x[:n], x[-n:]
    k = np.linspace(0, 1, n)
    x = x[:-n].copy()
    x[:n] = head * k + tail * (1 - k)
    return x


def write_ogg(name, x):
    tmp = os.path.join(tempfile.gettempdir(), f'tk_{name}.wav')
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    ffmpeg('-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1', os.path.join(SFX, f'{name}.ogg'))
    os.remove(tmp)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)


def crackle(n, rate, seconds):
    """Sharp pops of burning wood: short bright clicks at random."""
    out = np.zeros(int(seconds * SR))
    for _ in range(int(rate * seconds)):
        at = rng.integers(0, len(out) - 2000)
        size = int(rng.uniform(40, 400))
        pop = rng.normal(0, 1, size) * np.exp(-np.linspace(0, 6, size)) * rng.uniform(0.2, 1) ** 2
        out[at:at + size] += pop
    return highpass(out, 1500) if n else out


def fire_loop():
    s = 6
    roar = fast_lowpass(rng.normal(0, 1, int(s * SR)), 220)
    # The roar breathes as the flames gust.
    t = t_axis(s)
    roar *= 0.7 + 0.3 * np.sin(2 * np.pi * t / 2) * np.sin(2 * np.pi * t / 3.1 + 1)
    hiss = band(rng.normal(0, 1, int(s * SR)), 2000, 7000) * 0.08
    x = normalize(roar) * 0.55 + normalize(crackle(1, 26, s)) * 0.5 + hiss
    return normalize(loopable(x), 0.8)


def collapse():
    s = 3.2
    t = t_axis(s)
    # The first crack of beams giving way.
    crack = band(rng.normal(0, 1, len(t)), 300, 5000) * np.exp(-t * 18)
    # The roar of the walls coming down, rolling on.
    rumble = fast_lowpass(rng.normal(0, 1, len(t)), 140) * np.minimum(1, t * 6) * np.exp(-t * 1.3)
    # Bricks, tiles and timber clattering down, thinning out.
    clatter = np.zeros(len(t))
    for _ in range(140):
        at = 0.08 + rng.exponential(0.55)
        if at > s - 0.3:
            continue
        i = int(at * SR)
        f = rng.uniform(250, 2400)
        size = int(rng.uniform(0.02, 0.09) * SR)
        tt = np.arange(size) / SR
        hit = np.sin(2 * np.pi * f * tt) * np.exp(-tt * rng.uniform(40, 120)) + rng.normal(0, 0.4, size) * np.exp(-tt * 80)
        clatter[i:i + size] += hit * rng.uniform(0.2, 1) * np.exp(-at * 0.9)
    x = normalize(crack) * 0.6 + normalize(rumble) * 0.9 + normalize(clatter) * 0.45
    return normalize(x)


def smoke_pop():
    s = 1.6
    t = t_axis(s)
    thump = np.sin(2 * np.pi * (70 + 40 * np.exp(-t * 30)) * t) * np.exp(-t * 14)
    hiss = band(rng.normal(0, 1, len(t)), 900, 6000) * np.minimum(1, t * 12) * np.exp(-t * 2.2)
    return normalize(normalize(thump) * 0.8 + normalize(hiss) * 0.45, 0.8)


def wind_loop():
    s = 10
    t = t_axis(s)
    gust = 0.55 + 0.45 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 5 + 0.4) * np.sin(2 * np.pi * t / 3.3))
    low = fast_lowpass(rng.normal(0, 1, len(t)), 380) * gust
    whistle = band(rng.normal(0, 1, len(t)), 500, 1400) * gust ** 2 * 0.25
    return normalize(loopable(normalize(low) + whistle, 1.5), 0.7)


def chirp(f0, f1, dur, harm=0.25, vib=0.0):
    t = t_axis(dur)
    f = f0 + (f1 - f0) * (t / dur) + vib * np.sin(2 * np.pi * 28 * t) * f0
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * t / dur) ** 1.5
    return (np.sin(ph) + harm * np.sin(2 * ph)) * env


def birds(kind):
    s = 3.0
    out = np.zeros(int(s * SR))

    def put(at, x, g=1.0):
        i = int(at * SR)
        out[i:i + len(x)] += x[: len(out) - i] * g

    if kind == 1:
        # A two-note call, rising, repeated and growing urgent.
        at = 0.1
        for k in range(3):
            put(at, chirp(1150 + k * 60, 1300 + k * 60, 0.22), 0.7)
            put(at + 0.28, chirp(1500 + k * 80, 1750 + k * 80, 0.32), 0.8)
            at += 0.85 - k * 0.1
    elif kind == 2:
        # A quick bubbling warble.
        at = 0.15
        for k in range(9):
            f = 2200 + rng.uniform(-300, 400)
            put(at, chirp(f, f + rng.uniform(-500, 500), rng.uniform(0.06, 0.11), 0.15, 0.03), 0.6)
            at += rng.uniform(0.09, 0.16)
    else:
        # Far-off answering whistles.
        for at, f in [(0.2, 2600), (0.55, 2450), (1.6, 2700), (1.95, 2500)]:
            put(at, chirp(f, f - 500, 0.25, 0.1), 0.45)
    return normalize(out, 0.7)


def derive():
    src = lambda n: os.path.join(SFX, n)
    # The anti-tank gun: a sharp, high-velocity crack with a ringing echo off the ground.
    for i in (1, 2, 3):
        ffmpeg('-i', src(f'tankgun_{i}.ogg'), '-af',
               'asetrate=44100*1.22,aresample=44100,highpass=f=110,treble=g=5:f=3000,aecho=0.8:0.55:55|160:0.38|0.2,volume=1.3,alimiter=limit=0.95',
               '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1', src(f'atgun_{i}.ogg'))
    # Guns far away: dull thumps rolling over the hills.
    for i in (1, 2, 3):
        ffmpeg('-i', src(f'explode_big_{i}.ogg'), '-af',
               'asetrate=44100*0.82,aresample=44100,lowpass=f=260,lowpass=f=260,aecho=0.8:0.7:400|900:0.4|0.25,volume=1.6,alimiter=limit=0.9',
               '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1', src(f'distant_boom_{i}.ogg'))


if __name__ == '__main__':
    write_ogg('fire_loop', fire_loop())
    write_ogg('collapse_1', collapse())
    write_ogg('collapse_2', collapse())
    write_ogg('smoke_pop_1', smoke_pop())
    write_ogg('smoke_pop_2', smoke_pop())
    write_ogg('wind_loop', wind_loop())
    for k in (1, 2, 3):
        write_ogg(f'birds_{k}', birds(k))
    derive()
    print('done')
