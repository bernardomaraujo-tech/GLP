
let map = L.map('map').setView([38.7, -9.1], 8);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO'
}).addTo(map);

let markers = [];

async function loadData(){
  const res = await fetch('data/stations.json');
  const data = await res.json();
  document.getElementById('update-date').innerText = data.generatedAt;
  render(data.stations);
}

function render(stations){
  markers.forEach(m=>map.removeLayer(m));
  markers=[];

  const container = document.getElementById('results');
  container.innerHTML="";

  stations.slice(0,10).forEach(s=>{
    if(!s.lat || !s.lon) return;

    let m = L.marker([s.lat, s.lon]).addTo(map)
      .bindPopup(s.name + " - " + (s.price||"-"));
    markers.push(m);

    const waze = `https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes`;

    container.innerHTML += `
      <div class="card">
        <b>${s.name}</b><br>
        ${s.municipality || ""}<br>
        Preço: ${s.price || "-"}<br>
        <a class="route" href="${waze}" target="_blank">👉 Ir com Waze</a>
      </div>
    `;
  });
}

function useLocation(){
  navigator.geolocation.getCurrentPosition(pos=>{
    map.setView([pos.coords.latitude,pos.coords.longitude],12);
  });
}

function reset(){
  loadData();
}

function searchLocation(){
  alert("Geocoding pode ser ligado depois");
}

loadData();
