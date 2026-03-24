
const MAP_DEFAULT = { lat: 39.5, lon: -8.0, zoom: 7 };
const LISBON_DEFAULT = { lat: 38.7223, lon: -9.1393, zoom: 11 };

const ZONE_BY_DISTRICT = {
  "Viana do Castelo": "norte",
  "Braga": "norte",
  "Porto": "norte",
  "Vila Real": "norte",
  "Bragança": "norte",
  "Aveiro": "centro",
  "Viseu": "centro",
  "Guarda": "centro",
  "Coimbra": "centro",
  "Castelo Branco": "centro",
  "Leiria": "centro",
  "Lisboa": "lisboa-vt",
  "Santarém": "lisboa-vt",
  "Setúbal": "lisboa-vt",
  "Portalegre": "alentejo",
  "Évora": "alentejo",
  "Beja": "alentejo",
  "Faro": "algarve"
};

const state = {
  data: null,
  allStations: [],
  filteredStations: [],
  markers: [],
  userLatLng: null,
  searchCenter: null,
  searchLabel: "A localizar…"
};

const map = L.map("map", { zoomControl: true }).setView([MAP_DEFAULT.lat, MAP_DEFAULT.lon], MAP_DEFAULT.zoom);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap & CARTO",
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);

const stationLayer = L.layerGroup().addTo(map);
let userMarker = null;
let searchCircle = null;

const el = {
  generatedAt: document.getElementById("generatedAt"),
  sourceLabel: document.getElementById("sourceLabel"),
  locationSearch: document.getElementById("locationSearch"),
  searchBtn: document.getElementById("searchBtn"),
  clearBtn: document.getElementById("clearBtn"),
  refreshLocationBtn: document.getElementById("refreshLocationBtn"),
  zoneSelect: document.getElementById("zoneSelect"),
  districtSelect: document.getElementById("districtSelect"),
  brandSelect: document.getElementById("brandSelect"),
  radiusSelect: document.getElementById("radiusSelect"),
  sortSelect: document.getElementById("sortSelect"),
  visibleCount: document.getElementById("visibleCount"),
  cheapestCard: document.getElementById("cheapestCard"),
  searchCenterLabel: document.getElementById("searchCenterLabel"),
  results: document.getElementById("results"),
  cheapestBtn: document.getElementById("cheapestBtn")
};

async function init() {
  await loadStations();
  populateSelects();
  bindEvents();
  await tryAutoLocate();
  applyFiltersAndRender();
}

async function loadStations() {
  const response = await fetch("data/stations.json", { cache: "no-store" });
  const data = await response.json();
  state.data = data;
  state.allStations = Array.isArray(data.stations) ? data.stations.map(normalizeStation) : [];
  el.generatedAt.textContent = formatGeneratedAt(data.generatedAt);
  el.sourceLabel.textContent = data.sourceLabel || "glpautogas + myLPG";
}

function normalizeStation(station, idx) {
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  const district = station.district || guessDistrictFromLocality(station.locality || station.city || "");
  return {
    id: station.id || `st-${idx}-${(station.name || "").replace(/\W+/g, "-").toLowerCase()}`,
    name: station.name || "Posto GPL",
    brand: station.brand || "Sem marca",
    address: station.address || "",
    locality: station.locality || station.city || station.municipality || "",
    municipality: station.municipality || station.city || "",
    district,
    zone: station.zone || ZONE_BY_DISTRICT[district] || "all",
    lat,
    lon,
    price: station.price ? Number(station.price) : null,
    priceDate: station.priceDate || station.lastUpdated || "",
    source: station.source || "",
    sourceUrl: station.sourceUrl || "",
    updatedAt: station.updatedAt || station.priceDate || "",
    wazeLabel: station.name || "Posto GPL"
  };
}

function bindEvents() {
  el.searchBtn.addEventListener("click", handleSearch);
  el.clearBtn.addEventListener("click", clearSearchAndFilters);
  el.refreshLocationBtn.addEventListener("click", tryAutoLocate);
  el.cheapestBtn.addEventListener("click", zoomToCheapest);
  ["zoneSelect", "districtSelect", "brandSelect", "radiusSelect", "sortSelect"].forEach(id => {
    el[id].addEventListener("change", applyFiltersAndRender);
  });
  el.locationSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleSearch();
  });
}

function populateSelects() {
  const districts = uniqueSorted(state.allStations.map(s => s.district).filter(Boolean));
  const brands = uniqueSorted(state.allStations.map(s => s.brand).filter(Boolean));

  el.districtSelect.innerHTML = '<option value="all">Todos</option>' + districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  el.brandSelect.innerHTML = '<option value="all">Todas</option>' + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
}

async function tryAutoLocate() {
  if (!navigator.geolocation) {
    setSearchCenter(LISBON_DEFAULT.lat, LISBON_DEFAULT.lon, "Lisboa (fallback)");
    return;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      state.userLatLng = { lat, lon };
      setUserMarker(lat, lon);
      setSearchCenter(lat, lon, "A tua localização");
      map.setView([lat, lon], 11);
      resolve();
    }, () => {
      setSearchCenter(LISBON_DEFAULT.lat, LISBON_DEFAULT.lon, "Lisboa (fallback)");
      map.setView([LISBON_DEFAULT.lat, LISBON_DEFAULT.lon], LISBON_DEFAULT.zoom);
      resolve();
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 });
  });
}

async function handleSearch() {
  const query = el.locationSearch.value.trim();
  if (!query) {
    applyFiltersAndRender();
    return;
  }
  const found = await geocode(query);
  if (found) {
    setSearchCenter(found.lat, found.lon, found.label);
    map.setView([found.lat, found.lon], 11);
  }
  applyFiltersAndRender();
}

function clearSearchAndFilters() {
  el.locationSearch.value = "";
  el.zoneSelect.value = "all";
  el.districtSelect.value = "all";
  el.brandSelect.value = "all";
  el.radiusSelect.value = "50";
  el.sortSelect.value = "distance";

  if (state.userLatLng) {
    setSearchCenter(state.userLatLng.lat, state.userLatLng.lon, "A tua localização");
    map.setView([state.userLatLng.lat, state.userLatLng.lon], 11);
  } else {
    setSearchCenter(LISBON_DEFAULT.lat, LISBON_DEFAULT.lon, "Lisboa (fallback)");
    map.setView([LISBON_DEFAULT.lat, LISBON_DEFAULT.lon], LISBON_DEFAULT.zoom);
  }
  applyFiltersAndRender();
}

function setSearchCenter(lat, lon, label) {
  state.searchCenter = { lat, lon };
  state.searchLabel = label;
  el.searchCenterLabel.textContent = label;
  updateRadiusCircle();
}

function setUserMarker(lat, lon) {
  if (userMarker) stationLayer.removeLayer(userMarker);
  userMarker = L.circleMarker([lat, lon], {
    radius: 8,
    color: "#7aa789",
    weight: 2,
    fillColor: "#7aa789",
    fillOpacity: 0.95
  }).bindPopup("A tua localização");
  stationLayer.addLayer(userMarker);
}

function updateRadiusCircle() {
  if (!state.searchCenter) return;
  const radiusKm = Number(el.radiusSelect.value || 50);
  if (searchCircle) stationLayer.removeLayer(searchCircle);
  if (radiusKm >= 9999) return;
  searchCircle = L.circle([state.searchCenter.lat, state.searchCenter.lon], {
    radius: radiusKm * 1000,
    color: "rgba(199,121,97,0.55)",
    fillColor: "rgba(199,121,97,0.10)",
    fillOpacity: 0.15,
    weight: 1.5
  });
  stationLayer.addLayer(searchCircle);
}

function applyFiltersAndRender() {
  if (!state.searchCenter) {
    setSearchCenter(LISBON_DEFAULT.lat, LISBON_DEFAULT.lon, "Lisboa (fallback)");
  }

  const radiusKm = Number(el.radiusSelect.value || 50);
  const zone = el.zoneSelect.value;
  const district = el.districtSelect.value;
  const brand = el.brandSelect.value;
  const sort = el.sortSelect.value;

  let rows = state.allStations
    .filter(s => isFinite(s.lat) && isFinite(s.lon))
    .map(s => ({
      ...s,
      distanceKm: haversineKm(state.searchCenter.lat, state.searchCenter.lon, s.lat, s.lon)
    }))
    .filter(s => zone === "all" || s.zone === zone)
    .filter(s => district === "all" || s.district === district)
    .filter(s => brand === "all" || s.brand === brand)
    .filter(s => radiusKm >= 9999 || s.distanceKm <= radiusKm);

  rows = sortStations(rows, sort);
  state.filteredStations = rows;

  renderMap(rows);
  renderResults(rows.slice(0, 10));
  renderStats(rows);
}

function sortStations(rows, sort) {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "price") {
      return compareNullable(a.price, b.price) || a.distanceKm - b.distanceKm;
    }
    if (sort === "updated") {
      return compareDateDesc(a.updatedAt, b.updatedAt) || a.distanceKm - b.distanceKm;
    }
    if (sort === "name") {
      return String(a.name).localeCompare(String(b.name), "pt");
    }
    return a.distanceKm - b.distanceKm;
  });
  return copy;
}

function renderMap(rows) {
  stationLayer.eachLayer(layer => {
    if (layer !== userMarker && layer !== searchCircle) {
      stationLayer.removeLayer(layer);
    }
  });

  if (userMarker) stationLayer.addLayer(userMarker);
  if (searchCircle) stationLayer.addLayer(searchCircle);

  const bounds = [];
  rows.slice(0, 150).forEach((s) => {
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 7,
      color: "#c77961",
      weight: 1.5,
      fillColor: "#d4907a",
      fillOpacity: 0.95
    }).bindPopup(popupHtml(s));
    stationLayer.addLayer(marker);
    bounds.push([s.lat, s.lon]);
  });

  if (state.searchCenter) bounds.push([state.searchCenter.lat, state.searchCenter.lon]);
  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }
}

function renderResults(rows) {
  if (!rows.length) {
    el.results.innerHTML = '<div class="empty-state">Não encontrei postos com estes filtros. Ajusta o raio, zona ou procura outra localidade.</div>';
    return;
  }

  el.results.innerHTML = rows.map((s, idx) => {
    const wazeUrl = buildWazeUrl(s.lat, s.lon, s.wazeLabel);
    const googleUrl = buildGoogleMapsUrl(s.lat, s.lon);
    const priceLabel = s.price != null ? `${s.price.toFixed(3)} €/L` : "Sem preço";
    const updatedLabel = s.updatedAt ? formatDate(s.updatedAt) : "Sem data";
    const recentClass = isRecent(s.updatedAt) ? "meta-badge" : "meta-badge";
    const sourceLabel = [s.source, s.sourceUrl ? `<a href="${s.sourceUrl}" target="_blank" rel="noreferrer">fonte</a>` : ""].filter(Boolean).join(" · ");

    return `
      <article class="station-card">
        <div class="station-head">
          <div>
            <h3 class="station-title">${idx + 1}. ${escapeHtml(s.name)}</h3>
            <p class="station-subtitle">${escapeHtml(s.brand)} · ${escapeHtml([s.address, s.locality || s.municipality, s.district].filter(Boolean).join(" • "))}</p>
          </div>
          <div class="price-badge">${priceLabel}</div>
        </div>

        <div class="meta-badges">
          <span class="meta-badge">${s.distanceKm.toFixed(1)} km</span>
          <span class="${recentClass}">Atualizado: ${updatedLabel}</span>
          ${s.source ? `<span class="meta-badge">${escapeHtml(sourceLabel)}</span>` : ""}
        </div>

        <div class="station-actions">
          <a class="action-link primary" href="${wazeUrl}" target="_blank" rel="noreferrer">Abrir rota no Waze</a>
          <a class="action-link" href="${googleUrl}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>
        </div>
      </article>
    `;
  }).join("");
}

function renderStats(rows) {
  el.visibleCount.textContent = rows.length.toString();
  const cheapest = rows.filter(r => r.price != null).sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)[0];
  if (cheapest) {
    el.cheapestCard.textContent = `${cheapest.price.toFixed(3)} €/L · ${cheapest.name}`;
  } else {
    el.cheapestCard.textContent = "Sem preço disponível";
  }
}

function zoomToCheapest() {
  const cheapest = state.filteredStations.filter(r => r.price != null).sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)[0];
  if (!cheapest) return;
  map.setView([cheapest.lat, cheapest.lon], 13);
}

function popupHtml(s) {
  const wazeUrl = buildWazeUrl(s.lat, s.lon, s.wazeLabel);
  return `
    <strong>${escapeHtml(s.name)}</strong><br>
    ${escapeHtml(s.brand)}<br>
    ${s.price != null ? `${s.price.toFixed(3)} €/L` : "Sem preço"}<br>
    <a href="${wazeUrl}" target="_blank" rel="noreferrer">Rota no Waze</a>
  `;
}

function buildWazeUrl(lat, lon, name) {
  const ll = `${lat},${lon}`;
  return `https://www.waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes&zoom=16`;
}

function buildGoogleMapsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat + "," + lon)}`;
}

async function geocode(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pt&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" }});
    const rows = await res.json();
    if (!rows.length) return null;
    return {
      lat: Number(rows[0].lat),
      lon: Number(rows[0].lon),
      label: rows[0].display_name.split(",").slice(0, 3).join(", ")
    };
  } catch {
    return null;
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function compareNullable(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareDateDesc(a, b) {
  const aa = Date.parse(a || "") || 0;
  const bb = Date.parse(b || "") || 0;
  return bb - aa;
}

function isRecent(dateText) {
  const stamp = Date.parse(dateText || "");
  if (!stamp) return false;
  const diffDays = (Date.now() - stamp) / 86400000;
  return diffDays <= 7;
}

function formatGeneratedAt(dateText) {
  if (!dateText) return "—";
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return dateText;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(dateText) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return dateText;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function pad(v) {
  return String(v).padStart(2, "0");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "pt"));
}

function guessDistrictFromLocality(locality) {
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

init();
