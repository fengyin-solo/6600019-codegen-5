from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
from app.services.seismic_service import process_waveform, process_batch_waveform, get_event_detail, generate_mock_events

router = APIRouter()


@router.post("/waveform/upload")
async def upload_waveform(file: UploadFile = File(...)):
    """Upload SAC/miniSEED file and run analysis."""
    content = await file.read()
    result = process_waveform(content, file.filename or "unknown")
    return result


@router.post("/waveform/batch-upload")
async def batch_upload_waveform(files: List[UploadFile] = File(...)):
    """Upload multiple SAC/miniSEED files and return event list."""
    file_list = []
    for f in files:
        content = await f.read()
        file_list.append((content, f.filename or "unknown"))
    events = process_batch_waveform(file_list)
    return {"events": events, "count": len(events)}


@router.get("/waveform/event/{event_id}")
def get_event(event_id: str):
    """Get waveform and picks for a specific event."""
    detail = get_event_detail(event_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Event not found")
    return detail


@router.post("/waveform/mock-events")
def create_mock_events(count: int = 5):
    """Generate mock events for testing."""
    events = generate_mock_events(count)
    return {"events": events, "count": len(events)}


@router.get("/waveform/stations")
def get_stations():
    """Get station list."""
    return [
        {"id": "STA01", "name": "BJI", "latitude": 39.9, "longitude": 116.4, "elevation": 45},
        {"id": "STA02", "name": "SSE", "latitude": 31.2, "longitude": 121.5, "elevation": 10},
        {"id": "STA03", "name": "KMI", "latitude": 25.0, "longitude": 102.7, "elevation": 1890},
        {"id": "STA04", "name": "HIA", "latitude": 49.3, "longitude": 119.7, "elevation": 610},
    ]


@router.get("/waveform/events")
def get_events():
    """Get seismic event catalog."""
    return [
        {"id": "1", "magnitude": 4.2, "depth": 12.5, "location": "四川雅安", "originTime": "2025-01-15T08:23:41Z"},
        {"id": "2", "magnitude": 3.8, "depth": 8.3, "location": "云南大理", "originTime": "2025-01-14T14:12:05Z"},
    ]
