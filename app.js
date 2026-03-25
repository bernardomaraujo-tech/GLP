
const DEFAULT_CENTER = [39.5, -8.0];
const DEFAULT_ZOOM = 7;
const SEARCH_ZOOM = 11;

const map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

const state = {
  raw: [],
  filtered: [],
  userLocation: null,
  searchLocation: null,
  currentOrigin: null,
  markers: [],
  userMarker: null
};

const zoneRules = [
  { key: 'norte', name: 'Norte', districts: ['Braga','Bragança','Porto','Viana do Castelo','Vila Real'] },
  { key: 'centro', name: 'Centro', districts: ['Aveiro','Castelo Branco','Coimbra','Guarda','Leiria','Santarém','Viseu'] },
  { key: 'lisboa-vale-tejo', name: 'Lisboa e Vale do Tejo', districts: ['Lisboa','Santarém','Setúbal'] },
  { key: 'alentejo', name: 'Alentejo', districts: ['Beja','Évora','Portalegre','Setúbal'] },
  { key: 'algarve', name: 'Algarve', districts: ['Faro'] }
];

const searchInput = document.getElementById('searchInput');
const radiusSelect = document.getElementById('radiusSelect');
const zoneSelect = document.getElementById('zoneSelect');
const districtSelect = document.getElementById('districtSelect');
const brandSelect = document.getElementById('brandSelect');
const sortSelect = document.getElementById('sortSelect');

const statCount = document.getElementById('statCount');
const statAvgPrice = document.getElementById('statAvgPrice');
const statCheapest = document.getElementById('statCheapest');
const statUpdated = document.getElementById('statUpdated');
const datasetUpdated = document.getElementById('datasetUpdated');
const datasetSource = document.getElementById('datasetSource');
const resultsSubtitle = document.getElementById('resultsSubtitle');
const topResults = document.getElementById('topResults');
const allResults = document.getElementById('allResults');

document.getElementById('btnSearch').addEventListener('click', onSearch);
document.getElementById('btnClear').addEventListener('click', clearFilters);
document.getElementById('btnClearTop').addEventListener('click', clearFilters);
document.getElementById('btnUseLocation').addEventListener('click', requestUserLocation);
document.getElementById('btnCheapest').addEventListener('click', focusCheapest);

radiusSelect.addEventListener('change', applyFilters);
zoneSelect.addEventListener('change', () => {
  syncDistrictOptions();
  applyFilters();
});
districtSelect.addEventListener('change', applyFilters);
brandSelect.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onSearch();
});

async function bootstrap() {
  buildZoneOptions();
  try {
    const response = await fetch('./data/stations.json?v=' + Date.now());
    if (!response.ok) throw new Error('Não foi possível carregar stations.json');
    const payload = await response.json();

    const stations = Array.isArray(payload.stations) ? payload.stations : [];
    state.raw = stations.map((station, index) => normalizeStation(station, index));
    datasetUpdated.textContent = payload.generatedAt || '—';
    datasetSource.textContent = payload.sourceSummary || 'Fonte: glpautogas + páginas públicas de preços';
    populateStaticOptions();
    applyFilters();
    requestUserLocation(true);
  } catch (error) {
    console.error(error);
    topResults.innerHTML = `<div class="empty-state">Não foi possível carregar o dataset. Confirma se existe <strong>data/stations.json</strong> no repositório.</div>`;
    allResults.innerHTML = '';
    resultsSubtitle.textContent = 'Erro ao carregar dados.';
  }
}

function normalizeStation(station, index) {
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  const price = station.price === null || station.price === undefined || station.price === '' ? null : Number(station.price);

  return {
    id: station.id || `station-${index + 1}`,
    name: station.name || 'Posto sem nome',
    brand: station.brand || 'Sem marca',
    district: station.district || '',
    municipality: station.municipality || '',
    locality: station.locality || '',
    address: station.address || '',
    postalCode: station.postalCode || '',
    lat,
    lon,
    price: Number.isFinite(price) ? price : null,
    updated: station.updated || '',
    source: station.source || '',
    sourcePrice: station.sourcePrice || '',
    sourceLocation: station.sourceLocation || '',
    zone: inferZone(station.district),
    distanceKm: null
  };
}

function inferZone(district) {
  const found = zoneRules.find(rule => rule.districts.includes(district));
  return found ? found.name : 'Outros';
}

function buildZoneOptions() {
  zoneRules.forEach(rule => {
    const option = document.createElement('option');
    option.value = rule.name;
    option.textContent = rule.name;
    zoneSelect.appendChild(option);
  });
}

function populateStaticOptions() {
  const districts = [...new Set(state.raw.map(item => item.district).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt'));
  const brands = [...new Set(state.raw.map(item => item.brand).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt'));

  districtSelect.innerHTML = '<option value="">Todos</option>';
  districts.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    districtSelect.appendChild(option);
  });

  brandSelect.innerHTML = '<option value="">Todas</option>';
  brands.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    brandSelect.appendChild(option);
  });
}

function syncDistrictOptions() {
  const selectedZone = zoneSelect.value;
  const currentDistrict = districtSelect.value;
  const allowed = selectedZone
    ? new Set(zoneRules.find(rule => rule.name === selectedZone)?.districts || [])
    : null;

  const districts = [...new Set(state.raw.map(item => item.district).filter(Boolean))]
    .filter(item => !allowed || allowed.has(item))
    .sort((a,b) => a.localeCompare(b, 'pt'));

  districtSelect.innerHTML = '<option value="">Todos</option>';
  districts.forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    if (item === currentDistrict) option.selected = true;
    districtSelect.appendChild(option);
  });

  if (currentDistrict && !districts.includes(currentDistrict)) {
    districtSelect.value = '';
  }
}

function clearMarkers() {
  state.markers.forEach(marker => map.removeLayer(marker));
  state.markers = [];
}

function renderMarkers(items) {
  clearMarkers();
  const bounds = [];

  items.forEach(item => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;

    const marker = L.marker([item.lat, item.lon]).addTo(map);
    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(item.name)}</div>
      <div>${escapeHtml(item.brand)} · ${escapeHtml(item.municipality || item.locality || '')}</div>
      <div>Preço: ${formatPrice(item.price)}</div>
      <div>Atualizado: ${item.updated || '—'}</div>
      <div style="margin-top:8px;">
        <a href="${buildWazeLink(item)}" target="_blank" rel="noopener noreferrer">Ir com Waze</a>
      </div>
    `);

    state.markers.push(marker);
    bounds.push([item.lat, item.lon]);
  });

  if (state.userMarker) {
    bounds.push(state.userMarker.getLatLng());
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30] });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
}

function renderResults(items) {
  topResults.innerHTML = '';
  allResults.innerHTML = '';

  if (!items.length) {
    const empty = '<div class="empty-state">Sem resultados para os filtros atuais.</div>';
    topResults.innerHTML = empty;
    return;
  }

  items.slice(0, 10).forEach(item => topResults.insertAdjacentHTML('beforeend', stationCard(item, true)));
  items.forEach(item => allResults.insertAdjacentHTML('beforeend', stationCard(item, false)));
}

function stationCard(item, compact) {
  return `
    <article class="station-card">
      <div class="station-top">
        <div>
          <h3 class="station-name">${escapeHtml(item.name)}</h3>
          <div class="station-meta">
            ${escapeHtml(item.brand)} · ${escapeHtml(item.municipality || item.locality || '—')}<br>
            ${escapeHtml(item.address || 'Morada não disponível')}
          </div>
        </div>
        <div class="station-price">${formatPrice(item.price)}</div>
      </div>

      <div class="station-flags">
        ${item.distanceKm !== null ? `<span class="flag">${item.distanceKm.toFixed(1)} km</span>` : ''}
        ${item.updated ? `<span class="flag">Atualizado ${item.updated}</span>` : ''}
        ${item.district ? `<span class="flag">${escapeHtml(item.district)}</span>` : ''}
      </div>

      <div class="station-links">
        <a href="${buildWazeLink(item)}" target="_blank" rel="noopener noreferrer">🧭 Ir com Waze</a>
        <a class="secondary" href="${buildGoogleMapsLink(item)}" target="_blank" rel="noopener noreferrer">🗺️ Google Maps</a>
      </div>
    </article>
  `;
}

function updateStats(items) {
  statCount.textContent = String(items.length);

  const prices = items.map(item => item.price).filter(price => price !== null);
  if (prices.length) {
    const avg = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    statAvgPrice.textContent = avg.toFixed(3) + ' €';
    const cheapest = [...items].filter(item => item.price !== null).sort((a,b) => a.price - b.price)[0];
    statCheapest.textContent = `${formatPrice(cheapest.price)} · ${cheapest.name}`;
  } else {
    statAvgPrice.textContent = '—';
    statCheapest.textContent = '—';
  }

  const updatedValues = items.map(item => item.updated).filter(Boolean).sort().reverse();
  statUpdated.textContent = updatedValues[0] || '—';
}

function applyFilters() {
  const radiusKm = Number(radiusSelect.value);
  const selectedZone = zoneSelect.value;
  const selectedDistrict = districtSelect.value;
  const selectedBrand = brandSelect.value;
  const sortBy = sortSelect.value;
  const origin = state.userLocation || state.searchLocation;

  let items = state.raw
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map(item => ({
      ...item,
      distanceKm: origin ? haversine(origin.lat, origin.lon, item.lat, item.lon) : null
    }));

  if (selectedZone) {
    items = items.filter(item => item.zone === selectedZone);
  }

  if (selectedDistrict) {
    items = items.filter(item => item.district === selectedDistrict);
  }

  if (selectedBrand) {
    items = items.filter(item => item.brand === selectedBrand);
  }

  if (origin && radiusKm < 9999) {
    items = items.filter(item => item.distanceKm !== null && item.distanceKm <= radiusKm);
  }

  items.sort((a, b) => {
    if (sortBy === 'price') {
      return nullSafeNumber(a.price, Infinity) - nullSafeNumber(b.price, Infinity);
    }
    if (sortBy === 'updated') {
      return (b.updated || '').localeCompare(a.updated || '');
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'pt');
    }
    return nullSafeNumber(a.distanceKm, Infinity) - nullSafeNumber(b.distanceKm, Infinity);
  });

  state.filtered = items;
  resultsSubtitle.textContent = buildSubtitle(origin, radiusKm, items.length);
  updateStats(items);
  renderResults(items);
  renderMarkers(items.slice(0, 50));
}

function buildSubtitle(origin, radiusKm, count) {
  if (origin && radiusKm < 9999) {
    return `${count} resultado(s) no raio de ${radiusKm} km.`;
  }
  if (origin && radiusKm >= 9999) {
    return `${count} resultado(s) com distância calculada a partir do ponto atual.`;
  }
  return `${count} resultado(s) com base nos filtros atuais.`;
}

async function onSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    state.searchLocation = null;
    state.currentOrigin = state.userLocation;
    applyFilters();
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pt&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    const results = await response.json();

    if (!Array.isArray(results) || !results.length) {
      alert('Não encontrei essa localidade em Portugal.');
      return;
    }

    const hit = results[0];
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    state.searchLocation = { lat, lon, label: hit.display_name };
    state.currentOrigin = state.searchLocation;

    if (state.userMarker) {
      map.removeLayer(state.userMarker);
      state.userMarker = null;
    }

    state.userMarker = L.circleMarker([lat, lon], {
      radius: 8,
      color: '#b4743a',
      weight: 2,
      fillColor: '#f6e4d6',
      fillOpacity: 1
    }).addTo(map).bindPopup('Pesquisa: ' + hit.display_name);

    map.setView([lat, lon], SEARCH_ZOOM);
    applyFilters();
  } catch (error) {
    console.error(error);
    alert('Não foi possível pesquisar essa localização.');
  }
}

function requestUserLocation(silent = false) {
  if (!navigator.geolocation) {
    if (!silent) alert('Geolocalização não suportada neste dispositivo.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      state.userLocation = { lat, lon, label: 'A minha localização' };
      state.currentOrigin = state.userLocation;

      if (state.userMarker) {
        map.removeLayer(state.userMarker);
      }

      state.userMarker = L.circleMarker([lat, lon], {
        radius: 9,
        color: '#245c49',
        weight: 2,
        fillColor: '#cfe4db',
        fillOpacity: 1
      }).addTo(map).bindPopup('A minha localização');

      map.setView([lat, lon], 11);
      applyFilters();
    },
    error => {
      console.warn(error);
      if (!silent) alert('Não foi possível obter a tua localização.');
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 }
  );
}

function focusCheapest() {
  if (!state.filtered.length) return;
  const candidate = [...state.filtered].filter(item => item.price !== null).sort((a,b) => a.price - b.price)[0];
  if (!candidate) return;

  map.setView([candidate.lat, candidate.lon], 13);
  const marker = state.markers.find(item => {
    const pos = item.getLatLng();
    return Math.abs(pos.lat - candidate.lat) < 0.00001 && Math.abs(pos.lng - candidate.lon) < 0.00001;
  });
  if (marker) marker.openPopup();
}

function clearFilters() {
  searchInput.value = '';
  radiusSelect.value = '50';
  zoneSelect.value = '';
  districtSelect.value = '';
  brandSelect.value = '';
  sortSelect.value = 'distance';
  state.searchLocation = null;
  state.currentOrigin = state.userLocation;

  if (state.userMarker && !state.userLocation) {
    map.removeLayer(state.userMarker);
    state.userMarker = null;
  }

  if (!state.userLocation && state.userMarker) {
    map.removeLayer(state.userMarker);
    state.userMarker = null;
  }

  syncDistrictOptions();
  applyFilters();

  if (!state.userLocation) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
}

function buildWazeLink(item) {
  return `https://waze.com/ul?ll=${item.lat},${item.lon}&navigate=yes`;
}

function buildGoogleMapsLink(item) {
  return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`;
}

function formatPrice(value) {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${Number(value).toFixed(3)} €`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nullSafeNumber(value, fallback) {
  return value === null || value === undefined || Number.isNaN(value) ? fallback : Number(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

bootstrap();
