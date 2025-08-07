# Camino Tracker

A small web application that displays the Camino de Santiago route from León to Santiago de Compostela. The application merges individual KML route sections, computes the total distance, and animates a marker moving along the path from **00:00 10 August** to **00:00 20 August**. Each day's segment is color‑coded and users can search for towns or addresses to see them relative to the moving marker.

## Data

Place the Camino route `.kml` files in the `data/` directory at the project root. Files are combined in alphabetical order.

## Running locally

```bash
# Install dependencies and run the application using uv
uv run python -m app.main
```

Then open <http://localhost:8000> in your browser.

### Authentication

The application now exposes a simple sign‑in page. Set the desired
credentials in a `.env` file at the project root:

```
APP_USERNAME=your_username
APP_PASSWORD=your_password
SECRET_KEY=change_me
```

Visit <http://localhost:8000/login> and sign in with the above username
and password. Upon successful authentication you will be redirected to
the main map page.

### Testing the animation early

To preview the marker's movement before the real event begins, supply a
`begin` query parameter with an ISO timestamp when loading the page:

```
http://localhost:8000/?begin=2024-07-01T00:00:00Z
```

The countdown still references the official start date, but the marker's
progress will be calculated from the overridden `begin` time. This makes
it easy to verify that the route and animation behave correctly prior to
the actual start.

## Docker

A `Dockerfile` is provided for deployment to platforms such as Fly.io.

```bash
docker build -t camino-tracker .
docker run -p 8000:8000 camino-tracker
```

