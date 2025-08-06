# Camino Tracker

A small web application that displays the Camino de Santiago route from León to Santiago de Compostela. The application merges individual KML route sections, computes the total distance, and animates a marker moving along the path from **00:00 10 August** to **00:00 20 August**. Each day's segment is color‑coded and users can search for towns or addresses to see them relative to the moving marker.

## Data

Place the Camino route `.kml` files in the `data/` directory at the project root. Files are combined in alphabetical order.

## Running locally

```bash
pip install -e .
python -m app.main
```

Then open <http://localhost:8000> in your browser.

## Docker

A `Dockerfile` is provided for deployment to platforms such as Fly.io.

```bash
docker build -t camino-tracker .
docker run -p 8000:8000 camino-tracker
```

