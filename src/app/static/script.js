// 1. Check that map container initialized correctly
const map = L.map("map").setView([42.5987, -5.5671], 7);
console.log("Map initialized:", map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Reload the map when configuration changes so the tracker position updates
window.addEventListener("storage", (e) => {
  if (e.key === "trackerConfigUpdated") {
    console.log("Storage event caught — reloading map");
    location.reload();
  }
});

let routeData;
let meta;
let movingMarker;
let searchMarker;
let cumulative = [];
let coords = [];
let totalLength = 0;
let countdownTimer;

function setupAnimation() {
  console.log("Setting up animation...");
  // One immediate position update on load
  updateMarker();

  const start = Date.parse(meta.start_time);
  const now   = Date.now();
  const delay = Math.max(start - now, 0);
  console.log("Animation will start in (ms):", delay);

  // At start_time, do one update and then every 5 seconds
  setTimeout(() => {
    console.log("Animation started – first update at start_time");
    updateMarker();
    setInterval(() => {
      console.log("Periodic updateMarker call (every 5 s)");
      updateMarker();
    }, 5000);  // ← here’s the 5 second interval
  }, delay);
}

Promise.all([fetch("/api/meta"), fetch("/api/route")])
  .then((responses) => Promise.all(responses.map((r) => r.json())))
  .then(([m, r]) => {
    meta = m;
    routeData = r;
    console.log("Fetched meta:", meta);
    console.log("Fetched routeData:", routeData);
    addRoute();
    setupCountdown();
    setupAnimation();
  })
  .catch((err) => console.error("Error fetching meta/route:", err));

function addRoute() {
  // draw the line
  L.geoJSON(routeData, {
    style: (feature) => ({ color: feature.properties.color, weight: 5 }),
  }).addTo(map);

  // extract lat/lng pairs
  coords = routeData.features.flatMap(f =>
    f.geometry.coordinates.map(c => [c[1], c[0]])
  );
  console.log("Raw coords:", coords);

  // 1) find index of easternmost point (max longitude)
  const eastIndex = coords.reduce((bestIdx, pt, idx, arr) =>
    pt[1] > arr[bestIdx][1] ? idx : bestIdx
  , 0);
  console.log("Easternmost at idx", eastIndex, ":", coords[eastIndex]);

  // 2) rotate so that easternmost is at front
  coords = [
    ...coords.slice(eastIndex),
    ...coords.slice(0, eastIndex)
  ];
  console.log("Rotated so start=easternmost:", coords[0]);

  // 3) if second point is actually east of the first, reverse the rest so we head west
  if (coords.length > 1 && coords[1][1] > coords[0][1]) {
    const startPt = coords[0];
    const tailReversed = coords.slice(1).reverse();
    coords = [startPt, ...tailReversed];
    console.log("Reversed tail for westward traversal; new second pt:", coords[1]);
  }

  // build cumulative distance array
  cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  totalLength = cumulative[cumulative.length - 1];
  console.log("Total route length (m):", totalLength);

  // place your tracker (radius in pixels)
  if (movingMarker) map.removeLayer(movingMarker);
  movingMarker = L.circleMarker(coords[0], {
    radius: 10,           // try a visible pixel radius
    color: "#ff0000",
    weight: 2,
    fillColor: "#ff0000",
    fillOpacity: 1,
  }).addTo(map);
  console.log("Tracker anchored at (easternmost):", coords[0]);
}


function setupCountdown() {
  const el = document.getElementById("countdown");
  const start = Date.parse(meta.start_time);
  function update() {
    const now = Date.now();
    const diff = start - now;
    if (diff <= 0) {
      el.textContent = "";
      clearInterval(countdownTimer);
      console.log("Countdown complete");
      return;
    }
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    el.textContent = `Starts in ${d}d ${h}h ${m}m ${s}s`;
  }
  update();
  countdownTimer = setInterval(update, 1000);
}

function updateMarker() {
  if (!movingMarker) {
    console.warn("updateMarker called but movingMarker is undefined");
    return;
  }
  const now = Date.now();
  const start = Date.parse(meta.start_time);
  const end = Date.parse(meta.end_time);
  const progress = Math.min(Math.max((now - start) / (end - start), 0), 1);
  const distance = progress * totalLength;
  const pos = coordAtDistance(distance);

  console.log("Computed progress:", progress, "distance:", distance, "pos:", pos);

  if (pos) {
    movingMarker.setLatLng(pos);
    console.log("Marker moved to:", pos);
  } else {
    console.warn("coordAtDistance returned null for distance:", distance);
  }
}

function coordAtDistance(d) {
  for (let i = 1; i < cumulative.length; i++) {
    if (d <= cumulative[i]) {
      const ratio = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
      const a = coords[i - 1];
      const b = coords[i];
      const interp = [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
      console.log(`Interpolated between index ${i-1} and ${i}:`, interp);
      return interp;
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
  console.log("Search button clicked");
  const q = document.getElementById("searchBox").value;
  console.log("Search query:", q);
  if (!q) return;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`
  );
  const data = await res.json();
  console.log("Search results:", data);
  if (data.length === 0) {
    console.warn("No search results found");
    return;
  }
  const { lat, lon, display_name } = data[0];
  if (searchMarker) {
    console.log("Removing existing searchMarker");
    map.removeLayer(searchMarker);
  }
  searchMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 13);
  const dist = haversine([lat, lon], movingMarker.getLatLng()) / 1000;
  console.log("Distance from tracker (km):", dist);
  searchMarker
    .bindPopup(`${display_name}<br>${dist.toFixed(1)} km from tracker`)
    .openPopup();
});
