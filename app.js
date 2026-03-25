let map = L.map('map').setView([38.7, -9.1], 9);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

let markers = [];
let allStations = [];

async function loadData() {
  try {
    const res = await fetch('./data/stations.json?v=' + Date.now());

    if (!res.ok) {
      throw new Error(`Erro a carregar stations.json (${res.status})`);
    }

    const data = await res.json();

    console.log('JSON carregado:', data);

    document.getElementById('update-date').innerText = data.generatedAt || '-';
    allStations = Array.isArray(data.stations) ? data.stations : [];

    if (!allStations.length) {
      renderEmpty('Sem postos no ficheiro stations.json.');
      return;
    }

    renderStations(allStations);
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    document.getElementById('update-date').innerText = 'erro';
    renderEmpty('Não foi possível carregar os postos. Confirma o ficheiro data/stations.json.');
  }
}

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function renderEmpty(message) {
  clearMarkers();
  document.getElementById('results').innerHTML = `<div class="card">${message}</div>`;
}

function renderStations(stations) {
  clearMarkers();

  const results = document.getElementById('results');
  results.innerHTML = '';

  const validStations = stations.filter(s =>
    s &&
    s.lat !== undefined &&
    s.lon !== undefined &&
    s.lat !== null &&
    s.lon !== null &&
    !Number.isNaN(Number(s.lat)) &&
    !Number.isNaN(Number(s.lon))
  );

  if (!validStations.length) {
    renderEmpty('Os postos foram carregados, mas nenhum tem coordenadas válidas.');
    return;
  }

  const bounds = [];

  validStations.slice(0, 10).forEach(station => {
    const lat = Number(station.lat);
    const lon = Number(station.lon);

    const marker = L.marker([lat, lon]).addTo(map)
      .bindPopup(`
        <strong>${station.name || 'Posto sem nome'}</strong><br>
        ${station.municipality || ''}<br>
        Preço: ${station.price ?? '-'} €<br>
        <a href="https://waze.com/ul?ll=${lat},${lon}&navigate=yes" target="_blank">Ir com Waze</a>
      `);

    markers.push(marker);
    bounds.push([lat, lon]);

    results.innerHTML += `
      <div class="card">
        <strong>${station.name || 'Posto sem nome'}</strong><br>
        ${station.municipality || ''}<br>
        Preço: ${station.price ?? '-'} €<br>
        <a class="route" href="https://waze.com/ul?ll=${lat},${lon}&navigate=yes" target="_blank">👉 Ir com Waze</a>
      </div>
    `;
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

function reset() {
  document.getElementById('search').value = '';
  loadData();
}

function useLocation() {
  if (!navigator.geolocation) {
    alert('Geolocalização não suportada neste dispositivo.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;
      map.setView([userLat, userLon], 12);
    },
    err => {
      console.error(err);
      alert('Não foi possível obter a tua localização.');
    }
  );
}

function searchLocation() {
  const query = document.getElementById('search').value.trim().toLowerCase();

  if (!query) {
    renderStations(allStations);
    return;
  }

  const filtered = allStations.filter(station => {
    return [
      station.name,
      station.municipality,
      station.locality,
      station.address
    ]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(query));
  });

  if (!filtered.length) {
    renderEmpty('Nenhum posto encontrado para essa pesquisa.');
    return;
  }

  renderStations(filtered);
}

loadData();
