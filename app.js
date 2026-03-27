const PORTUGAL_CENTER = [39.5, -8.0];
const PORTUGAL_ZOOM = 7;

const map = L.map('map').setView(PORTUGAL_CENTER, PORTUGAL_ZOOM);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

let allStations = [];
let filteredStations = [];
let markers = [];
let currentReferencePoint = null;

const els = {
  search: document.getElementById('search'),
  btnSearch: document.getElementById('btn-search'),
  btnReset: document.getElementById('btn-reset'),
  btnLocation: document.getElementById('btn-location'),
  btnCheapest: document.getElementById('btn-cheapest'),
  radius: document.getElementById('radius'),
  zone: document.getElementById('zone'),
  district: document.getElementById('district'),
  brand: document.getElementById('brand'),
  sortBy: document.getElementById('sort-by'),
  results: document.getElementById('results'),
  updateDate: document.getElementById('update-date'),
  sourceSummary: document.getElementById('source-summary'),
  statTotal: document.getElementById('stat-total'),
  statCoords: document.getElementById('stat-coords'),
  statPrice: document.getElementById('stat-price'),
  statCheapest: document.getElementById('stat-cheapest')
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidStation(station) {
  return station && safeNumber(station.lat) !== null && safeNumber(station.lon) !== null;
}

function formatPrice(price) {
  return price === null || price === undefined || Number.isNaN(Number(price))
    ? '—'
    : `${Number(price).toFixed(3)} €`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function formatDistance(distanceKm) {
  return distanceKm === undefined || distanceKm === null
    ? '—'
    : `${distanceKm.toFixed(1)} km`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function updateStats(meta, stations) {
  els.updateDate.textContent = formatDate(meta.dataUpdatedAt || meta.generatedAt);
  els.sourceSummary.textContent = meta.sourceSummary || '-';
  els.statTotal.textContent = meta.stats?.totalStations ?? stations.length ?? '—';
  els.statCoords.textContent = meta.stats?.withCoordinates ?? stations.filter(isValidStation).length ?? '—';
  els.statPrice.textContent = meta.stats?.withPrice ?? stations.filter(s => s.price !== null && s.price !== undefined).length ?? '—';

  const cheapest = stations
    .filter(s => s.price !== null && s.price !== undefined && !Number.isNaN(Number(s.price)))
    .sort((a, b) => Number(a.price) - Number(b.price))[0];

  els.statCheapest.textContent = cheapest ? `${Number(cheapest.price).toFixed(3)} €` : '—';
}

function populateFilters(stations) {
  const districts = [...new Set(stations.map(s => s.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const brands = [...new Set(stations.map(s => s.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  els.district.innerHTML = '<option value="">Todos</option>' + districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  els.brand.innerHTML = '<option value="">Todas</option>' + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
}

function renderResults(stations) {
  els.results.innerHTML = '';

  if (!stations.length) {
    els.results.innerHTML = '<div class="empty">Não foram encontrados postos com os filtros atuais.</div>';
    clearMarkers();
    map.setView(PORTUGAL_CENTER, PORTUGAL_ZOOM);
    return;
  }

  clearMarkers();

  stations.forEach((station, index) => {
    const lat = Number(station.lat);
    const lon = Number(station.lon);
    const distance = station.distanceKm;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const wazeLink = `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes`;

    const popupHtml = `
      <div class="popup">
        <strong>${escapeHtml(station.name)}</strong><br />
        ${escapeHtml(station.brand || '')}<br />
        ${escapeHtml(station.address || station.locality || station.municipality || '')}<br />
        <strong>${formatPrice(station.price)}</strong>
      </div>
    `;

    const marker = L.marker([lat, lon]).addTo(map).bindPopup(popupHtml);
    markers.push(marker);

    const badges = [
      station.brand ? `<span class="badge">${escapeHtml(station.brand)}</span>` : '',
      station.price !== null ? `<span class="badge badge-price">${formatPrice(station.price)}</span>` : '',
      distance !== undefined && distance !== null ? `<span class="badge badge-distance">${formatDistance(distance)}</span>` : '',
      index === 0 && els.sortBy.value === 'price' ? `<span class="badge badge-best">Mais barato</span>` : ''
    ].join('');

    const html = `
      <article class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(station.name)}</h3>
            <div class="meta">
              ${escapeHtml(station.address || 'Morada não disponível')}<br />
              ${escapeHtml([station.locality, station.municipality, station.district].filter(Boolean).join(' · '))}
            </div>
          </div>
          <div class="price-box">${formatPrice(station.price)}</div>
        </div>

        <div class="badges">${badges}</div>

        <div class="meta">
          Atualizado: ${escapeHtml(formatDate(station.updatedAt))}<br />
          Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}
        </div>

        <div class="actions">
          <a class="btn-link" href="${mapsLink}" target="_blank" rel="noreferrer">Google Maps</a>
          <a class="btn-link" href="${wazeLink}" target="_blank" rel="noreferrer">Waze</a>
        </div>
      </article>
    `;
    els.results.insertAdjacentHTML('beforeend', html);
  });

  const validStations = stations.filter(isValidStation);
  const bounds = L.latLngBounds(validStations.map(s => [Number(s.lat), Number(s.lon)]));
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.12));
  }
}

async function searchLocation() {
  const query = els.search.value.trim();
  if (!query) {
    applyFilters();
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pt&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'Accept-Language': 'pt-PT' }
    });
    const data = await response.json();

    if (!data.length) {
      alert('Não foi possível encontrar essa localização.');
      return;
    }

    currentReferencePoint = {
      lat: Number(data[0].lat),
      lon: Number(data[0].lon)
    };
    applyFilters();
  } catch (error) {
    console.error(error);
    alert('Erro ao procurar a localização.');
  }
}

function applyFilters() {
  const radiusKm = Number(els.radius.value);
  const zone = els.zone.value;
  const district = els.district.value;
  const brand = els.brand.value;
  const search = els.search.value.trim().toLowerCase();
  const sortBy = els.sortBy.value;

  filteredStations = allStations
    .map(station => {
      const matchText = [
        station.name,
        station.brand,
        station.address,
        station.locality,
        station.municipality,
        station.district
      ].join(' ').toLowerCase();

      if (search && !matchText.includes(search) && !currentReferencePoint) {
        return null;
      }

      if (zone && station.zone !== zone) return null;
      if (district && station.district !== district) return null;
      if (brand && station.brand !== brand) return null;

      let distanceKm = null;
      if (currentReferencePoint) {
        distanceKm = haversineDistance(
          currentReferencePoint.lat,
          currentReferencePoint.lon,
          Number(station.lat),
          Number(station.lon)
        );
        if (distanceKm > radiusKm) return null;
      }

      return { ...station, distanceKm };
    })
    .filter(Boolean);

  filteredStations.sort((a, b) => {
    if (sortBy === 'price') {
      const pa = a.price ?? 999;
      const pb = b.price ?? 999;
      if (pa !== pb) return pa - pb;
      return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    }

    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }

    return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
  });

  const limitedStations = filteredStations.slice(0, currentReferencePoint ? 10 : 200);
  renderResults(limitedStations);
}

function resetAll() {
  els.search.value = '';
  els.radius.value = '50';
  els.zone.value = '';
  els.district.value = '';
  els.brand.value = '';
  els.sortBy.value = 'distance';
  currentReferencePoint = null;
  applyFilters();
}

function useLocation() {
  if (!navigator.geolocation) {
    alert('Geolocalização não suportada neste dispositivo.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      currentReferencePoint = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
      applyFilters();
    },
    error => {
      console.error(error);
      alert('Não foi possível obter a tua localização.');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 }
  );
}

function showCheapestInRadius() {
  if (!filteredStations.length) return;

  const cheapest = filteredStations
    .filter(s => s.price !== null && s.price !== undefined && !Number.isNaN(Number(s.price)))
    .sort((a, b) => Number(a.price) - Number(b.price))[0];

  if (!cheapest) {
    alert('Não existe preço disponível nos postos filtrados.');
    return;
  }

  map.setView([Number(cheapest.lat), Number(cheapest.lon)], 14);
  const marker = markers.find(m => {
    const ll = m.getLatLng();
    return Math.abs(ll.lat - Number(cheapest.lat)) < 0.00001 && Math.abs(ll.lng - Number(cheapest.lon)) < 0.00001;
  });
  if (marker) marker.openPopup();
}

async function loadData() {
  try {
    const res = await fetch(`./data/stations.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`Erro a carregar stations.json (${res.status})`);
    const data = await res.json();

    allStations = Array.isArray(data.stations) ? data.stations.filter(isValidStation) : [];
    populateFilters(allStations);
    updateStats(data, allStations);
    applyFilters();
  } catch (error) {
    console.error(error);
    els.sourceSummary.textContent = 'Erro ao carregar o dataset.';
    els.results.innerHTML = '<div class="empty">Não foi possível carregar os postos. Confirma o ficheiro data/stations.json.</div>';
  }
}

els.btnSearch.addEventListener('click', searchLocation);
els.btnReset.addEventListener('click', resetAll);
els.btnLocation.addEventListener('click', useLocation);
els.btnCheapest.addEventListener('click', showCheapestInRadius);
els.radius.addEventListener('change', applyFilters);
els.zone.addEventListener('change', applyFilters);
els.district.addEventListener('change', applyFilters);
els.brand.addEventListener('change', applyFilters);
els.sortBy.addEventListener('change', applyFilters);
els.search.addEventListener('keydown', event => {
  if (event.key === 'Enter') searchLocation();
});

loadData();
