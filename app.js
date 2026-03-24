
const regionByDistrict = {
  'Aveiro': 'Centro', 'Beja': 'Alentejo', 'Braga': 'Norte', 'Bragança': 'Norte',
  'Castelo Branco': 'Centro', 'Coimbra': 'Centro', 'Évora': 'Alentejo', 'Faro': 'Algarve',
  'Guarda': 'Centro', 'Leiria': 'Centro', 'Lisboa': 'Lisboa e Vale do Tejo', 'Portalegre': 'Alentejo',
  'Porto': 'Norte', 'Santarém': 'Lisboa e Vale do Tejo', 'Setúbal': 'Lisboa e Vale do Tejo',
  'Viana do Castelo': 'Norte', 'Vila Real': 'Norte', 'Viseu': 'Centro', 'Açores': 'Açores', 'Madeira': 'Madeira'
};

const map = L.map('map', { zoomControl: true }).setView([39.6, -8.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const stationIcon = L.divIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#ff6a00;border:3px solid rgba(255,255,255,.85);box-shadow:0 0 0 4px rgba(255,106,0,.18)"></div>',
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const userIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#7dd3fc;border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 4px rgba(125,211,252,.18)"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const state = {
  stations: [],
  filtered: [],
  markers: [],
  userLocation: null,
  userMarker: null,
  searchMarker: null,
  lastReferenceLabel: ''
};

const els = {
  locationInput: document.getElementById('locationInput'),
  radius: document.getElementById('radiusSelect'),
  zone: document.getElementById('zoneSelect'),
  district: document.getElementById('districtSelect'),
  brand: document.getElementById('brandSelect'),
  sort: document.getElementById('sortSelect'),
  nearestList: document.getElementById('nearestList'),
  resultsList: document.getElementById('resultsList'),
  visibleCount: document.getElementById('visibleCount'),
  avgPrice: document.getElementById('avgPrice'),
  minPrice: document.getElementById('minPrice'),
  lastUpdated: document.getElementById('lastUpdated'),
  listContext: document.getElementById('listContext'),
  useLocationBtn: document.getElementById('useLocationBtn'),
  searchPlaceBtn: document.getElementById('searchPlaceBtn'),
  resetBtn: document.getElementById('resetBtn'),
  cheapestBtn: document.getElementById('cheapestBtn')
};

init();

async function init() {
  const response = await fetch('./data/stations.json');
  const data = await response.json();
  state.stations = data.stations.map(normalizeStation);
  populateSelectors();
  bindEvents();
  applyFilters();
}

function normalizeStation(station) {
  const district = station.district || '';
  return {
    ...station,
    brand: station.brand || 'Sem marca',
    zone: station.zone || regionByDistrict[district] || 'Outros',
    price: typeof station.price === 'number' ? station.price : null,
    distanceKm: null
  };
}

function populateSelectors() {
  const districts = [...new Set(state.stations.map(s => s.district).filter(Boolean))].sort(localeSort);
  const brands = [...new Set(state.stations.map(s => s.brand).filter(Boolean))].sort(localeSort);

  for (const district of districts) {
    const option = document.createElement('option');
    option.value = district;
    option.textContent = district;
    els.district.appendChild(option);
  }

  for (const brand of brands) {
    const option = document.createElement('option');
    option.value = brand;
    option.textContent = brand;
    els.brand.appendChild(option);
  }
}

function bindEvents() {
  ['change', 'input'].forEach(eventName => {
    els.zone.addEventListener(eventName, applyFilters);
    els.district.addEventListener(eventName, applyFilters);
    els.brand.addEventListener(eventName, applyFilters);
    els.radius.addEventListener(eventName, applyFilters);
    els.sort.addEventListener(eventName, applyFilters);
  });

  els.useLocationBtn.addEventListener('click', useMyLocation);
  els.searchPlaceBtn.addEventListener('click', searchLocation);
  els.locationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchLocation();
  });
  els.resetBtn.addEventListener('click', resetFilters);
  els.cheapestBtn.addEventListener('click', showCheapestInRadius);
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert('O navegador não suporta geolocalização.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setReferencePoint(lat, lon, 'A tua localização');
    },
    () => {
      alert('Não foi possível obter a tua localização.');
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

async function searchLocation() {
  const query = els.locationInput.value.trim();
  if (!query) {
    alert('Indica uma localidade ou localização.');
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pt&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    if (!data.length) {
      alert('Não encontrei essa localização.');
      return;
    }

    const place = data[0];
    setReferencePoint(Number(place.lat), Number(place.lon), place.display_name);
  } catch (error) {
    console.error(error);
    alert('Não foi possível pesquisar a localização neste momento.');
  }
}

function setReferencePoint(lat, lon, label) {
  state.userLocation = { lat, lon };
  state.lastReferenceLabel = label;
  if (state.userMarker) map.removeLayer(state.userMarker);
  if (state.searchMarker) map.removeLayer(state.searchMarker);

  state.userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
  state.userMarker.bindPopup(`<div class="popup-card"><strong>Referência</strong><div>${escapeHtml(label)}</div></div>`);
  map.setView([lat, lon], 11);
  applyFilters();
}

function resetFilters() {
  els.locationInput.value = '';
  els.radius.value = '50';
  els.zone.value = 'all';
  els.district.value = 'all';
  els.brand.value = 'all';
  els.sort.value = 'distance';
  state.userLocation = null;
  state.lastReferenceLabel = '';
  if (state.userMarker) {
    map.removeLayer(state.userMarker);
    state.userMarker = null;
  }
  applyFilters();
  map.setView([39.6, -8.0], 7);
}

function applyFilters() {
  const zone = els.zone.value;
  const district = els.district.value;
  const brand = els.brand.value;
  const radiusKm = Number(els.radius.value);
  const sortMode = els.sort.value;

  const filtered = state.stations
    .map(station => {
      const distanceKm = state.userLocation
        ? haversineKm(state.userLocation.lat, state.userLocation.lon, station.lat, station.lon)
        : null;
      return { ...station, distanceKm };
    })
    .filter(station => zone === 'all' || station.zone === zone)
    .filter(station => district === 'all' || station.district === district)
    .filter(station => brand === 'all' || station.brand === brand)
    .filter(station => !state.userLocation || radiusKm === 0 || station.distanceKm <= radiusKm);

  filtered.sort((a, b) => {
    if (sortMode === 'priceAsc') return compareNullableNumbers(a.price, b.price, 1);
    if (sortMode === 'priceDesc') return compareNullableNumbers(a.price, b.price, -1);
    if (sortMode === 'name') return localeSort(a.name, b.name);
    return compareNullableNumbers(a.distanceKm, b.distanceKm, 1);
  });

  state.filtered = filtered;
  renderMap();
  renderLists();
  renderStats();
}

function showCheapestInRadius() {
  const candidates = state.filtered.filter(item => item.price !== null);
  if (!candidates.length) {
    alert('Não existem postos com preço dentro dos filtros atuais.');
    return;
  }
  const cheapest = [...candidates].sort((a, b) => a.price - b.price)[0];
  map.setView([cheapest.lat, cheapest.lon], 13);
  const marker = state.markers.find(item => item.station.name === cheapest.name && item.station.address === cheapest.address);
  if (marker) marker.marker.openPopup();
}

function renderMap() {
  state.markers.forEach(entry => map.removeLayer(entry.marker));
  state.markers = [];

  const bounds = [];
  for (const station of state.filtered) {
    const marker = L.marker([station.lat, station.lon], { icon: stationIcon }).addTo(map);
    marker.bindPopup(buildPopupHtml(station));
    marker.on('click', () => highlightStationCard(station));
    state.markers.push({ station, marker });
    bounds.push([station.lat, station.lon]);
  }

  if (!state.userLocation && bounds.length) {
    const groupBounds = L.latLngBounds(bounds);
    map.fitBounds(groupBounds.pad(0.18));
  }
}

function renderLists() {
  const nearest = state.userLocation
    ? [...state.filtered]
        .filter(item => item.distanceKm !== null)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 10)
    : state.filtered.slice(0, 10);

  els.nearestList.innerHTML = nearest.length
    ? nearest.map(station => buildStationCard(station, true)).join('')
    : `<div class="empty-state">Sem resultados para os filtros atuais.</div>`;

  els.resultsList.innerHTML = state.filtered.length
    ? state.filtered.slice(0, 50).map(station => buildStationCard(station, false)).join('')
    : `<div class="empty-state">Sem postos para mostrar.</div>`;

  bindCardActions();

  const radiusText = Number(els.radius.value) === 0 ? 'sem limite de raio' : `até ${els.radius.value} km`;
  if (state.userLocation) {
    els.listContext.textContent = `${nearest.length} mais próximas a partir de ${state.lastReferenceLabel || 'referência atual'} • ${radiusText}`;
  } else {
    els.listContext.textContent = `Filtra por zona, distrito ou marca. Para top 10 real, usa localização ou pesquisa uma localidade.`;
  }
}

function renderStats() {
  els.visibleCount.textContent = String(state.filtered.length);

  const priced = state.filtered.filter(item => item.price !== null);
  const avg = priced.length ? priced.reduce((sum, item) => sum + item.price, 0) / priced.length : null;
  const min = priced.length ? Math.min(...priced.map(item => item.price)) : null;
  const latest = state.filtered
    .map(item => item.lastUpdated)
    .filter(Boolean)
    .sort()
    .at(-1);

  els.avgPrice.textContent = avg !== null ? `${avg.toFixed(3)} €/L` : '—';
  els.minPrice.textContent = min !== null ? `${min.toFixed(3)} €/L` : '—';
  els.lastUpdated.textContent = latest || '—';
}

function buildStationCard(station, withDistance) {
  const distance = station.distanceKm !== null ? `${station.distanceKm.toFixed(1)} km` : '—';
  const price = station.price !== null ? `${station.price.toFixed(3)} €/L` : 'N/D';
  const encodedDestination = `${station.lat},${station.lon}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedDestination}`;

  return `
    <article class="station-card" data-lat="${station.lat}" data-lon="${station.lon}" data-name="${escapeHtml(station.name)}">
      <h3>${escapeHtml(station.name)}</h3>
      <div class="station-meta">
        <span>${escapeHtml(station.brand)}</span>
        <span class="station-price">${price}</span>
        ${withDistance ? `<span>${distance}</span>` : ''}
      </div>
      <div class="station-note">${escapeHtml(station.address)} • ${escapeHtml(station.city)}${station.district ? ` • ${escapeHtml(station.district)}` : ''}</div>
      <div class="station-note">Fonte preço: ${escapeHtml(station.priceSource || 'N/D')} • Atualização: ${escapeHtml(station.lastUpdated || 'N/D')}</div>
      <div class="station-actions">
        <a href="${googleMapsUrl}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>
        <a href="#" class="focus-map-link" data-lat="${station.lat}" data-lon="${station.lon}" data-name="${escapeHtml(station.name)}">Ver no mapa</a>
      </div>
    </article>
  `;
}

function buildPopupHtml(station) {
  const price = station.price !== null ? `${station.price.toFixed(3)} €/L` : 'N/D';
  const distance = station.distanceKm !== null ? `${station.distanceKm.toFixed(1)} km` : '—';
  return `
    <div class="popup-card">
      <strong>${escapeHtml(station.name)}</strong>
      <div>${escapeHtml(station.brand)} • ${price}</div>
      <div>${escapeHtml(station.city)}${station.district ? ` • ${escapeHtml(station.district)}` : ''}</div>
      <div>${escapeHtml(station.address)}</div>
      <div>Distância: ${distance}</div>
    </div>
  `;
}

function bindCardActions() {
  document.querySelectorAll('.focus-map-link').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const lat = Number(link.dataset.lat);
      const lon = Number(link.dataset.lon);
      const name = link.dataset.name;
      map.setView([lat, lon], 14);
      const match = state.markers.find(item => item.station.lat === lat && item.station.lon === lon);
      if (match) match.marker.openPopup();
    });
  });
}

function highlightStationCard(station) {
  const cards = document.querySelectorAll('.station-card');
  cards.forEach(card => card.style.borderColor = 'rgba(255,255,255,0.1)');
  const match = [...cards].find(card => card.dataset.lat == station.lat && card.dataset.lon == station.lon);
  if (match) {
    match.style.borderColor = 'rgba(255,176,103,0.75)';
    match.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compareNullableNumbers(a, b, direction = 1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a - b);
}

function localeSort(a, b) {
  return String(a).localeCompare(String(b), 'pt');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
