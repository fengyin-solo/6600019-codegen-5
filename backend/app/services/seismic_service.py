"""Seismic waveform processing service."""
import numpy as np
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any


_waveform_cache: Dict[str, Dict[str, Any]] = {}


def generate_mock_waveform(duration: int = 60, sr: int = 100, seed: int = 42) -> Dict[str, Any]:
    """Generate synthetic seismic waveform with P and S arrivals."""
    rng = np.random.RandomState(seed)
    n = sr * duration
    t = np.linspace(0, duration, n)

    bhz = rng.normal(0, 0.01, n)
    bhn = rng.normal(0, 0.01, n)
    bhe = rng.normal(0, 0.01, n)

    p_shift = rng.uniform(5, 15)
    p_mask = (t > p_shift) & (t < p_shift + 8)
    p_amp = 0.8 * rng.uniform(0.6, 1.2) * np.exp(-((t[p_mask] - p_shift - 2) ** 2) / 8)
    bhz[p_mask] += p_amp * np.sin(2 * np.pi * 8 * t[p_mask])
    bhn[p_mask] += p_amp * 0.3 * np.sin(2 * np.pi * 8 * t[p_mask] + 0.5)
    bhe[p_mask] += p_amp * 0.3 * np.sin(2 * np.pi * 8 * t[p_mask] + 1.0)

    s_shift = p_shift + rng.uniform(10, 15)
    s_mask = (t > s_shift) & (t < s_shift + 18)
    s_amp = 1.5 * rng.uniform(0.7, 1.3) * np.exp(-((t[s_mask] - s_shift - 6) ** 2) / 30)
    bhz[s_mask] += s_amp * 0.4 * np.sin(2 * np.pi * 4 * t[s_mask])
    bhn[s_mask] += s_amp * np.sin(2 * np.pi * 4 * t[s_mask] + 0.3)
    bhe[s_mask] += s_amp * np.sin(2 * np.pi * 4 * t[s_mask] + 0.8)

    return {
        "time": t.tolist(),
        "bhz": bhz.tolist(),
        "bhn": bhn.tolist(),
        "bhe": bhe.tolist(),
        "samplingRate": sr,
    }


def sta_lta_pick(data: List[float], sr: int,
                 sta_sec: float = 1.0, lta_sec: float = 10.0,
                 threshold: float = 3.5) -> List[Dict[str, Any]]:
    """STA/LTA automatic phase picker."""
    arr = np.array(data)
    sta_len = int(sta_sec * sr)
    lta_len = int(lta_sec * sr)

    sq = arr ** 2
    sta = np.convolve(sq, np.ones(sta_len) / sta_len, mode='valid')
    lta = np.convolve(sq, np.ones(lta_len) / lta_len, mode='valid')

    min_len = min(len(sta), len(lta))
    sta = sta[:min_len]
    lta = lta[:min_len]

    ratio = np.where(lta > 0, sta / lta, 0)
    picks = []
    last_pick = -999

    for i in range(len(ratio)):
        if ratio[i] > threshold and (i / sr - last_pick) > 2:
            t = (i + lta_len) / sr
            picks.append({
                "id": f"pick_{i}_{uuid.uuid4().hex[:8]}",
                "type": "P" if not picks else "S",
                "time": round(t, 2),
                "confidence": round(min(1.0, ratio[i] / 10), 2),
                "method": "STA/LTA",
            })
            last_pick = t

    return picks


def _generate_event_meta(event_id: str, filename: str, seed: int) -> Dict[str, Any]:
    rng = np.random.RandomState(seed)
    locations = ["四川雅安", "云南大理", "台湾花莲", "新疆和田", "青海玉树", "甘肃定西"]
    magnitude = round(rng.uniform(3.0, 6.0), 1)
    depth = round(rng.uniform(5, 35), 1)
    origin_time = datetime.utcnow() - timedelta(hours=rng.randint(1, 72))
    location = locations[seed % len(locations)]
    return {
        "id": event_id,
        "magnitude": magnitude,
        "depth": depth,
        "originTime": origin_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "location": location,
        "filename": filename,
    }


def process_waveform(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Process uploaded waveform file.
    In production, use ObsPy to read SAC/miniSEED:
        from obspy import read
        st = read(BytesIO(file_bytes))
    """
    waveform = generate_mock_waveform()
    picks = sta_lta_pick(waveform["bhz"], waveform["samplingRate"])
    return {"waveform": waveform, "picks": picks}


def process_batch_waveform(files: List[tuple]) -> List[Dict[str, Any]]:
    """
    Process multiple waveform files and return event list.
    Each file becomes a seismic event.
    """
    events = []
    for idx, (file_bytes, filename) in enumerate(files):
        event_id = f"evt_{uuid.uuid4().hex[:8]}"
        seed = hash(filename + str(idx)) % 10000
        waveform = generate_mock_waveform(seed=seed)
        picks = sta_lta_pick(waveform["bhz"], waveform["samplingRate"])
        event_meta = _generate_event_meta(event_id, filename, seed)
        result = {
            **event_meta,
            "waveform": waveform,
            "picks": picks,
        }
        _waveform_cache[event_id] = result
        events.append({
            "id": event_id,
            "magnitude": event_meta["magnitude"],
            "depth": event_meta["depth"],
            "originTime": event_meta["originTime"],
            "location": event_meta["location"],
            "filename": filename,
            "pickCount": len(picks),
        })
    return events


def get_event_detail(event_id: str) -> Dict[str, Any] | None:
    """Get waveform and picks for a specific event."""
    return _waveform_cache.get(event_id)


def generate_mock_events(count: int = 5) -> List[Dict[str, Any]]:
    """Generate mock events for testing."""
    events = []
    for i in range(count):
        event_id = f"evt_mock_{i}_{uuid.uuid4().hex[:6]}"
        seed = i * 100 + 7
        waveform = generate_mock_waveform(seed=seed)
        picks = sta_lta_pick(waveform["bhz"], waveform["samplingRate"])
        event_meta = _generate_event_meta(event_id, f"mock_{i}.sac", seed)
        result = {
            **event_meta,
            "waveform": waveform,
            "picks": picks,
        }
        _waveform_cache[event_id] = result
        events.append({
            "id": event_id,
            "magnitude": event_meta["magnitude"],
            "depth": event_meta["depth"],
            "originTime": event_meta["originTime"],
            "location": event_meta["location"],
            "filename": f"mock_{i}.sac",
            "pickCount": len(picks),
        })
    return events
