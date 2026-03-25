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

function formatDistance(distanceKm) {
  return distanceKm === undefined || distanceKm === null
    ? ''
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

function zoneForDistrict(district) {
  const d = (district || '').toLowerCase();
  const norte = ['viana do castelo','braga','porto','vila real','braganca'];
  const centro = ['aveiro','viseu','guarda','coimbra','castelo branco','leiria'];
  const lisboa = ['lisboa','santarem','setubal'];
  const alentejo = ['portalegre','evora','beja'];
  const algarve = ['faro'];

  if (norte.includes(d)) return 'norte';
  if (centro.includes(d)) return 'centro';
  if (lisboa.includes(d)) return 'lisboa';
  if (alentejo.includes(d)) return 'alentejo';
  if (algarve.includes(d)) return 'algarve';
  return '';
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
  els.updateDate.textContent = meta.generatedAt || '-';
  els.sourceSummary.textContent = meta.sourceSummary || '-';
  els.statTotal.textContent = meta.stats?.totalStations ?? stations.length ?? '-';
  els.statCoords.textContent = meta.stats?.withCoordinates ?? stations.filter(isValidStation).length ?? '-';
  els.statPrice.textContent = meta.stats?.withPrice ?? stations.filter(s => s.price !== null && s.price !== undefined).length ?? '-';

  const cheapest = stations
    .filter(s => s.price !== null && s.price !== undefined && !Number.isNaN(Number(s.price)))
    .sort((a, b) => Number(a.price) - Number(b.price))[0];

  els.statCheapest.textContent = cheapest ? `${Number(cheapest.price).toFixed(3)} €` : '—';
}

function populateFilters(stations) {
  const districts = [...new Set(stations.map(s => s.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const brands = [...new Set(stations.map(s => s.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const districtValue = els.district.value;
  const brandValue = els.brand.value;

  els.district.innerHTML = '<option value="">Todos</option>' + districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  els.brand.innerHTML = '<option value="">Todas</option>' + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

  els.district.value = districts.includes(districtValue) ? districtValue : '';
  els.brand.value = brands.includes(brandValue) ? brandValue : '';
}

function getCurrentRadius() {
  return Number(els.radius.value || 50);
}

function applyFilters() {
  const zone = els.zone.value;
  const district = els.district.value.toLowerCase();
  const brand = els.brand.value.toLowerCase();
  const sortBy = els.sortBy.value;
  const text = els.search.value.trim().toLowerCase();
  const radiusKm = getCurrentRadius();

  let items = allStations.filter(isValidStation);

  if (zone) {
    items = items.filter(s => zoneForDistrict(s.district) === zone);
  }

  if (district) {
    items = items.filter(s => (s.district || '').toLowerCase() === district);
  }

  if (brand) {
    items = items.filter(s => (s.brand || '').toLowerCase() === brand);
  }

  if (text) {
    items = items.filter(s => [
      s.name,
      s.brand,
      s.district,
      s.municipality,
      s.locality,
      s.address
    ].filter(Boolean).some(v => String(v).toLowerCase().includes(text)));
  }

  if (currentReferencePoint) {
    items = items.map(station => ({
      ...station,
      distanceKm: haversineDistance(
        currentReferencePoint.lat,
        currentReferencePoint.lon,
        Number(station.lat),
        Number(station.lon)
      )
    })).filter(s => s.distanceKm <= radiusKm);
  } else {
    items = items.map(station => ({ ...station, distanceKm: undefined }));
  }

  if (sortBy === 'price') {
    items.sort((a, b) => {
      const ap = a.price === null || a.price === undefined ? Number.POSITIVE_INFINITY : Number(a.price);
      const bp = b.price === null || b.price === undefined ? Number.POSITIVE_INFINITY : Number(b.price);
      return ap - bp;
    });
  } else if (sortBy === 'name') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else {
    items.sort((a, b) => {
      const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }

  filteredStations = items;
  renderStations(items.slice(0, currentReferencePoint ? 10 : 100), Boolean(currentReferencePoint));
  updateVisibleCheapest(items);
}

function updateVisibleCheapest(items) {
  const cheapest = items
    .filter(s => s.price !== null && s.price !== undefined && !Number.isNaN(Number(s.price)))
    .sort((a, b) => Number(a.price) - Number(b.price))[0];

  els.statCheapest.textContent = cheapest ? `${Number(cheapest.price).toFixed(3)} €` : '—';
}

function renderStations(stations, fitToBounds = true) {
  clearMarkers();
  els.results.innerHTML = '';

  if (!stations.length) {
    els.results.innerHTML = '<div class="empty">Não foram encontrados postos para os filtros atuais.</div>';
    if (!currentReferencePoint) {
      map.setView(PORTUGAL_CENTER, PORTUGAL_ZOOM);
    }
    return;
  }

  const bounds = [];
  const cheapestId = stations
    .filter(s => s.price !== null && s.price !== undefined && !Number.isNaN(Number(s.price)))
    .sort((a, b) => Number(a.price) - Number(b.price))[0]?.id;

  stations.forEach(station => {
    const lat = Number(station.lat);
    const lon = Number(station.lon);
    const distance = formatDistance(station.distanceKm);
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

    const marker = L.marker([lat, lon]).addTo(map)
      .bindPopup(`
        <strong>${escapeHtml(station.name || 'Posto')}</strong><br>
        ${escapeHtml(station.brand || '')}<br>
        ${escapeHtml(station.municipality || '')}<br>
        Preço: ${escapeHtml(formatPrice(station.price))}${distance ? `<br>Distância: ${escapeHtml(distance)}` : ''}<br>
        <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer">Ir com Waze</a>
      `);

    markers.push(marker);
    bounds.push([lat, lon]);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(station.name || 'Posto')}</h3>
          <div class="meta">${escapeHtml(station.brand || '')}</div>
        </div>
      </div>
      <div class="badges">
        <span class="badge badge-price">${escapeHtml(formatPrice(station.price))}</span>
        ${distance ? `<span class="badge badge-distance">${escapeHtml(distance)}</span>` : ''}
        ${station.id === cheapestId ? '<span class="badge badge-best">Mais barato</span>' : ''}
      </div>
      <div class="meta">
        ${escapeHtml(station.address || '')}<br>
        ${escapeHtml(station.locality || station.municipality || '')}${station.district ? ` · ${escapeHtml(station.district)}` : ''}<br>
        Atualizado: ${escapeHtml(station.updated || '-')}
      </div>
      <div class="actions">
        <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer">Ir com Waze</a>
        <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer">Google Maps</a>
      </div>
    `;
    els.results.appendChild(card);
  });

  if (fitToBounds && bounds.length) {
    map.fitBounds(bounds, { padding: [24, 24] });
  } else if (!currentReferencePoint) {
    map.setView(PORTUGAL_CENTER, PORTUGAL_ZOOM);
  }
}

async function geocodePortugal(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pt&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Erro geocoding (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

async function searchLocation() {
  const query = els.search.value.trim();
  if (!query) {
    applyFilters();
    return;
  }

  try {
    const result = await geocodePortugal(query);
    if (!result) {
      els.results.innerHTML = '<div class="empty">Localização não encontrada.</div>';
      return;
    }
    currentReferencePoint = result;
    applyFilters();
  } catch (error) {
    console.error(error);
    els.results.innerHTML = '<div class="empty">Erro ao procurar a localização.</div>';
  }
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
  if (!filteredStations.length) {
    return;
  }

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

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          currentReferencePoint = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          applyFilters();
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 900000 }
      );
    }
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
els.search.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchLocation();
});

loadData();
