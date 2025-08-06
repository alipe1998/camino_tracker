const map = L.map("map").setView([42.5987, -5.5671], 7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let routeData;
let meta;
let movingMarker;
let searchMarker;
let cumulative = [];
let coords = [];
let totalLength = 0;

Promise.all([fetch("/api/meta"), fetch("/api/route")])
  .then((responses) => Promise.all(responses.map((r) => r.json())))
  .then(([m, r]) => {
    meta = m;
    routeData = r;
    addRoute();
    setupAnimation();
  });

function addRoute() {
  L.geoJSON(routeData, {
    style: (feature) => ({ color: feature.properties.color, weight: 5 }),
  }).addTo(map);
  coords = routeData.features.flatMap((f) =>
    f.geometry.coordinates.map((c) => [c[1], c[0]])
  );
  cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    cumulative.push(cumulative[cumulative.length - 1] + d);
  }
  totalLength = cumulative[cumulative.length - 1];
  movingMarker = L.marker(coords[0]).addTo(map);
}

function setupAnimation() {
  updateMarker();
  setInterval(updateMarker, 10000);
}

function updateMarker() {
  const now = Date.now();
  const start = Date.parse(meta.start_time);
  const end = Date.parse(meta.end_time);
  const progress = Math.min(Math.max((now - start) / (end - start), 0), 1);
  const distance = progress * totalLength;
  const pos = coordAtDistance(distance);
  if (pos) {
    movingMarker.setLatLng(pos);
  }
}

function coordAtDistance(d) {
  for (let i = 1; i < cumulative.length; i++) {
    if (d <= cumulative[i]) {
      const ratio = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
      const a = coords[i - 1];
      const b = coords[i];
      return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
    }
  }
  return null;
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

document.getElementById("searchBtn").addEventListener("click", async () => {
  const q = document.getElementById("searchBox").value;
  if (!q) return;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      q
    )}`
  );
  const data = await res.json();
  if (data.length === 0) return;
  const { lat, lon, display_name } = data[0];
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 13);
  const dist = haversine([lat, lon], movingMarker.getLatLng()) / 1000;
  searchMarker
    .bindPopup(`${display_name}<br>${dist.toFixed(1)} km from tracker`)
    .openPopup();
});
