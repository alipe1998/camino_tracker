"""Main application entry point."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Use an absolute import so the module works whether executed as a script or a
# package. This avoids import errors when the code is relocated.
from app.route_utils import load_route

# Repository root (two levels above this file: src/app/main.py -> project root)
BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Load route data once at startup. If the data directory is missing or empty,
# fall back to empty dictionaries so the application can still start.
try:
    route_geojson, route_meta = load_route(DATA_DIR)
except FileNotFoundError:
    route_geojson, route_meta = {}, {}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/route")
def api_route() -> dict:
    return route_geojson


@app.get("/api/meta")
def api_meta() -> dict:
    return route_meta


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
