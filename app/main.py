from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .route_utils import load_route

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Load route data once at startup
route_geojson, route_meta = load_route(DATA_DIR)


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
