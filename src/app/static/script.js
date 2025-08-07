// script.js
window.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize map
  const map = L.map("map").setView([42.5987, -5.5671], 7);
  console.log("Map initialized:", map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // 2. Reload on config change
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
  let coords = [];
  let cumulative = [];
  let totalLength = 0;
  let countdownTimer;
  // optional override for animation start (e.g., testing)
  let animationStart;

  // 3. Kick off fetching, then setup everything
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

  // 4. Draw route, compute distances, enforce east→west ordering, and place initial marker
  function addRoute() {
    // draw the polyline
    L.geoJSON(routeData, {
      style: (f) => ({ color: f.properties.color, weight: 5 }),
    }).addTo(map);

    // extract [lat, lng]
    coords = routeData.features.flatMap((f) =>
      f.geometry.coordinates.map((c) => [c[1], c[0]])
    );
    console.log("Raw coords:", coords);

    // find index of easternmost point
    const eastIndex = coords.reduce(
      (best, pt, i, arr) => (pt[1] > arr[best][1] ? i : best),
      0
    );
    console.log("Easternmost at idx", eastIndex, ":", coords[eastIndex]);

    // rebuild coords so we start at eastIndex and move backward (→west)
    const ordered = [];
    for (let i = 0; i < coords.length; i++) {
      const idx = (eastIndex - i + coords.length) % coords.length;
      ordered.push(coords[idx]);
    }
    coords = ordered;
    console.log("Reordered coords (east→west): first 5:", coords.slice(0, 5));

    // build cumulative distances (meters)
    cumulative = [0];
    for (let i = 1; i < coords.length; i++) {
      cumulative.push(
        cumulative[i - 1] + haversine(coords[i - 1], coords[i])
      );
    }
    totalLength = cumulative[cumulative.length - 1];
    console.log("Total route length (m):", totalLength);

    // place marker at the very first point (easternmost)
    if (movingMarker) map.removeLayer(movingMarker);
    movingMarker = L.circleMarker(coords[0], {
      radius: 10,
      color: "#ff0000",
      weight: 2,
      fillColor: "#ff0000",
      fillOpacity: 1,
    }).addTo(map);
    console.log("Marker anchored at start (east):", coords[0]);
  }

  // 5. Countdown until start_time
  function setupCountdown() {
    const el = document.getElementById("countdown");
    const start = Date.parse(meta.start_time);

    function update() {
      const diff = start - Date.now();
      if (diff <= 0) {
        // Show elapsed time since official start so testing with a past
        // date still renders a meaningful message.
        const elapsed = Math.abs(diff);
        const d = Math.floor(elapsed / (1000 * 60 * 60 * 24));
        const h = Math.floor((elapsed / (1000 * 60 * 60)) % 24);
        const m = Math.floor((elapsed / (1000 * 60)) % 60);
        const s = Math.floor((elapsed / 1000) % 60);
        el.textContent = `Started ${d}d ${h}h ${m}m ${s}s ago`;
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

  // 6. Animate marker: initial + at start + every 5s
  function setupAnimation() {
    console.log("Setting up animation...");

    // Allow an optional begin date to be supplied via query string for
    // testing, e.g. /?begin=2024-07-01T00:00:00Z
    const params = new URLSearchParams(window.location.search);
    const override = params.get("begin");
    animationStart = override
      ? Date.parse(override)
      : Date.parse(meta.start_time);

    updateMarker();

    const delay = Math.max(animationStart - Date.now(), 0);
    console.log("Animation will start in (ms):", delay);

    setTimeout(() => {
      console.log("Animation started – first update at start_time");
      updateMarker();
      setInterval(() => {
        console.log("Periodic updateMarker call (every 5 s)");
        updateMarker();
      }, 5000);
    }, delay);
  }

  // 7. Compute & move marker
  function updateMarker() {
    if (!movingMarker) return;

    const now = Date.now();
    const start = animationStart;
    const end = Date.parse(meta.end_time);
    const progress = Math.min(Math.max((now - start) / (end - start), 0), 1);
    const distance = progress * totalLength;
    const pos = coordAtDistance(distance);

    console.log("Progress", progress, "distance", distance, "pos", pos);
    if (pos) movingMarker.setLatLng(pos);
  }

  // 8. Linear interpolation along cumulative distances
  function coordAtDistance(d) {
    for (let i = 1; i < cumulative.length; i++) {
      if (d <= cumulative[i]) {
        const ratio = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
        const [lat1, lng1] = coords[i - 1];
        const [lat2, lng2] = coords[i];
        return [lat1 + (lat2 - lat1) * ratio, lng1 + (lng2 - lng1) * ratio];
      }
    }
    return null;
  }

  // 9. Haversine formula (meters)
  function haversine(a, b) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // 10. Search box handler (unchanged)
  document.getElementById("searchBtn").addEventListener("click", async () => {
    const q = document.getElementById("searchBox").value.trim();
    if (!q) return;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`
    );
    const data = await res.json();
    if (!data.length) return;

    const { lat, lon, display_name } = data[0];
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 13);

    const distKm = haversine([lat, lon], movingMarker.getLatLng()) / 1000;
    searchMarker
      .bindPopup(`${display_name}<br>${distKm.toFixed(1)} km from tracker`)
      .openPopup();
  });
});
