/* ─── Constants ─────────────────────────────────────────────── */

const CATEGORIES = {
  viewpoint:  { label: 'Viewpoint',  color: '#8B5CF6', emoji: '👁'  },
  food:       { label: 'Food',       color: '#F97316', emoji: '🍽'  },
  drink:      { label: 'Drink',      color: '#06B6D4', emoji: '☕'  },
  attraction: { label: 'Attraction', color: '#3B82F6', emoji: '★'  },
  nature:     { label: 'Nature',     color: '#22C55E', emoji: '🌿'  },
  network:    { label: 'Network',    color: '#EC4899', emoji: '👤'  },
};

const LS_KEY = 'nyc-map-state';

/* ─── State ──────────────────────────────────────────────────── */

let state = { pins: [], connections: [] };
let mode = 'select';            // 'select' | 'add-hub' | 'add-bird'
let selectedPinId = null;
let contextLatLng = null;       // where right-click landed

// drag-to-connect
let dragSourceId = null;
let dragSourceScreenPos = null;

// leaflet marker registry  { id -> L.Marker }
const markers = {};
// active connection polylines (shown for selected hub)
let activeLines = [];
// temp search marker
let searchMarker = null;
let searchClearTimer = null;

/* ─── Map init ───────────────────────────────────────────────── */

const map = L.map('map', {
  center: [40.718, -73.98],
  zoom: 12,
  zoomControl: false,
  attributionControl: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

/* ─── Persistence ────────────────────────────────────────────── */

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (_) { state = { pins: [], connections: [] }; }
}

/* ─── UUID ───────────────────────────────────────────────────── */

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ─── Icon builders ──────────────────────────────────────────── */

function hubIcon(count) {
  const html = `
    <div class="hub-marker">
      <svg viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 30 12 30S28 21 28 12C28 5.37 22.63 0 16 0z"
              fill="#dc2626" stroke="#b91c1c" stroke-width="1"/>
        <circle cx="16" cy="12" r="8" fill="#fff" opacity=".2"/>
      </svg>
      <div class="hub-badge">${count}</div>
    </div>`;
  return L.divIcon({ html, className: '', iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -44] });
}

function birdIcon(category) {
  const cat = CATEGORIES[category] || CATEGORIES.attraction;
  const html = `<div class="bird-marker" style="background:${cat.color}">${cat.emoji}</div>`;
  return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
}

/* ─── Hub badge count ────────────────────────────────────────── */

function hubCount(hubId) {
  return state.connections.filter(c => c.hubId === hubId).length;
}

/* ─── Refresh a single marker icon ──────────────────────────── */

function refreshMarkerIcon(pin) {
  const m = markers[pin.id];
  if (!m) return;
  if (pin.type === 'hub') {
    m.setIcon(hubIcon(hubCount(pin.id)));
  } else {
    m.setIcon(birdIcon(pin.category));
  }
}

/* ─── Connection lines ───────────────────────────────────────── */

function clearLines() {
  activeLines.forEach(l => map.removeLayer(l));
  activeLines = [];
}

function drawLinesForHub(hubId) {
  clearLines();
  const hub = state.pins.find(p => p.id === hubId);
  if (!hub) return;
  const birdIds = state.connections.filter(c => c.hubId === hubId).map(c => c.birdId);
  birdIds.forEach(bid => {
    const bird = state.pins.find(p => p.id === bid);
    if (!bird) return;
    const line = L.polyline([[hub.lat, hub.lng], [bird.lat, bird.lng]], {
      color: '#dc2626', weight: 2, dashArray: '6, 5', opacity: 0.7,
    }).addTo(map);
    activeLines.push(line);
  });
}

/* ─── Place a marker on the map ─────────────────────────────── */

function placeMarker(pin) {
  const icon = pin.type === 'hub' ? hubIcon(hubCount(pin.id)) : birdIcon(pin.category);
  const m = L.marker([pin.lat, pin.lng], { icon, draggable: false }).addTo(map);
  markers[pin.id] = m;

  // pointer-down on the marker element → start drag-to-connect
  const el = m.getElement();
  if (el) {
    el.addEventListener('pointerdown', e => onMarkerPointerDown(e, pin.id));
  }

  m.on('click', e => {
    L.DomEvent.stopPropagation(e);
    onPinClick(pin.id);
  });
}

/* ─── Add pin ────────────────────────────────────────────────── */

function addPin(type, latlng, category) {
  const pin = {
    id: uid(),
    type,
    lat: latlng.lat,
    lng: latlng.lng,
    name: '',
    blurb: '',
    link: '',
    category: category || 'attraction',
  };
  state.pins.push(pin);
  save();
  placeMarker(pin);
  setMode('select');
  openPanel(pin.id);
}

/* ─── Delete pin ─────────────────────────────────────────────── */

function deletePin(id) {
  const pin = state.pins.find(p => p.id === id);
  if (!pin) return;

  // remove connections touching this pin
  const affected = new Set(
    state.connections
      .filter(c => c.hubId === id || c.birdId === id)
      .map(c => c.hubId === id ? c.birdId : c.hubId)
  );
  state.connections = state.connections.filter(c => c.hubId !== id && c.birdId !== id);

  // update badges for affected hubs
  affected.forEach(aid => {
    const ap = state.pins.find(p => p.id === aid);
    if (ap) refreshMarkerIcon(ap);
  });

  state.pins = state.pins.filter(p => p.id !== id);
  save();

  if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; }
  clearLines();
  closePanel();
}

/* ─── Connect hub ↔ bird ─────────────────────────────────────── */

function connectPins(idA, idB) {
  const a = state.pins.find(p => p.id === idA);
  const b = state.pins.find(p => p.id === idB);
  if (!a || !b) return;

  let hubId, birdId;
  if (a.type === 'hub' && b.type === 'bird')       { hubId = a.id; birdId = b.id; }
  else if (a.type === 'bird' && b.type === 'hub')  { hubId = b.id; birdId = a.id; }
  else return; // hub↔hub or bird↔bird: not allowed

  // prevent duplicate
  if (state.connections.some(c => c.hubId === hubId && c.birdId === birdId)) return;

  state.connections.push({ id: uid(), hubId, birdId });
  save();

  // refresh hub badge
  const hub = state.pins.find(p => p.id === hubId);
  if (hub) refreshMarkerIcon(hub);

  // if hub is currently selected, redraw lines
  if (selectedPinId === hubId) drawLinesForHub(hubId);
  // if bird is selected and its hub is now connected, refresh panel
  if (selectedPinId === birdId || selectedPinId === hubId) renderPanel();
}

/* ─── Mode management ────────────────────────────────────────── */

function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === m);
  });
  document.body.className = m !== 'select' ? `mode-${m}` : '';
}

/* ─── Panel ──────────────────────────────────────────────────── */

function openPanel(id) {
  selectedPinId = id;
  const pin = state.pins.find(p => p.id === id);
  if (!pin) return;

  // draw lines if hub
  if (pin.type === 'hub') drawLinesForHub(id);
  else clearLines();

  renderPanel();
  document.getElementById('detail-panel').className = 'panel-open';
}

function closePanel() {
  selectedPinId = null;
  clearLines();
  document.getElementById('detail-panel').className = 'panel-closed';
}

function renderPanel() {
  const pin = state.pins.find(p => p.id === selectedPinId);
  if (!pin) return;

  // badge
  const badge = document.getElementById('panel-type-badge');
  if (pin.type === 'hub') {
    badge.textContent = 'Hub';
    badge.className = 'badge-hub';
  } else {
    const cat = CATEGORIES[pin.category] || CATEGORIES.attraction;
    badge.textContent = cat.label;
    badge.style.background = cat.color + '22';
    badge.style.color = cat.color;
    badge.className = '';
  }

  document.getElementById('field-name').value  = pin.name  || '';
  document.getElementById('field-blurb').value = pin.blurb || '';
  document.getElementById('field-link').value  = pin.link  || '';

  const linkOpen = document.getElementById('link-open');
  linkOpen.href = pin.link || '#';
  linkOpen.style.opacity = pin.link ? '1' : '0.3';

  // connections section
  const connDiv = document.getElementById('panel-connections');
  connDiv.innerHTML = '';

  if (pin.type === 'hub') {
    const birds = state.connections
      .filter(c => c.hubId === pin.id)
      .map(c => state.pins.find(p => p.id === c.birdId))
      .filter(Boolean);
    if (birds.length) {
      connDiv.innerHTML = `<div class="conn-title">Linked birds (${birds.length})</div>`;
      birds.forEach(b => {
        const cat = CATEGORIES[b.category] || CATEGORIES.attraction;
        const chip = document.createElement('button');
        chip.className = 'conn-chip';
        chip.style.background = cat.color + '22';
        chip.style.color = cat.color;
        chip.innerHTML = `${cat.emoji} ${b.name || 'Unnamed'}`;
        chip.addEventListener('click', () => openPanel(b.id));
        connDiv.appendChild(chip);
      });
    }
  } else {
    const conn = state.connections.find(c => c.birdId === pin.id);
    if (conn) {
      const hub = state.pins.find(p => p.id === conn.hubId);
      if (hub) {
        connDiv.innerHTML = `<div class="conn-title">Linked to hub</div>`;
        const chip = document.createElement('button');
        chip.className = 'conn-chip';
        chip.style.background = '#fee2e222';
        chip.style.color = '#dc2626';
        chip.innerHTML = `📍 ${hub.name || 'Unnamed hub'}`;
        chip.addEventListener('click', () => openPanel(hub.id));
        connDiv.appendChild(chip);
      }
    }
  }
}

function onPinClick(id) {
  if (selectedPinId === id) { closePanel(); return; }
  openPanel(id);
}

/* ─── Drag-to-connect ────────────────────────────────────────── */

const dragSvg  = document.getElementById('drag-svg');
const dragLine = document.getElementById('drag-line');

function onMarkerPointerDown(e, pinId) {
  if (mode !== 'select') return;
  e.preventDefault();
  e.stopPropagation();

  dragSourceId = pinId;
  const rect = e.target.closest('.hub-marker, .bird-marker') || e.target;
  const mapRect = document.getElementById('map').getBoundingClientRect();

  const startX = e.clientX;
  const startY = e.clientY;

  dragSvg.style.display = 'block';
  dragLine.setAttribute('x1', startX);
  dragLine.setAttribute('y1', startY);
  dragLine.setAttribute('x2', startX);
  dragLine.setAttribute('y2', startY);

  function onMove(ev) {
    dragLine.setAttribute('x2', ev.clientX);
    dragLine.setAttribute('y2', ev.clientY);
  }

  function onUp(ev) {
    dragSvg.style.display = 'none';
    dragSourceId = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    // find if pointer is over a marker
    const els = document.elementsFromPoint(ev.clientX, ev.clientY);
    const targetEl = els.find(el =>
      el.classList.contains('hub-marker') ||
      el.classList.contains('bird-marker') ||
      el.closest('.hub-marker') ||
      el.closest('.bird-marker')
    );
    if (!targetEl) return;

    // find pin whose marker element contains targetEl
    let targetPinId = null;
    for (const [id, marker] of Object.entries(markers)) {
      const mel = marker.getElement();
      if (mel && (mel === targetEl || mel.contains(targetEl))) {
        targetPinId = id;
        break;
      }
    }
    if (targetPinId && targetPinId !== pinId) {
      connectPins(pinId, targetPinId);
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/* ─── Map click → add pin ────────────────────────────────────── */

map.on('click', e => {
  hideContextMenu();
  if (mode === 'add-hub') {
    addPin('hub', e.latlng);
  } else if (mode === 'add-bird') {
    pendingBirdLatLng = e.latlng;
    showCategoryModal();
  } else {
    closePanel();
  }
});

/* ─── Right-click context menu ───────────────────────────────── */

let pendingBirdLatLng = null;

map.on('contextmenu', e => {
  L.DomEvent.preventDefault(e);
  contextLatLng = e.latlng;
  showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY);
});

function showContextMenu(x, y) {
  const menu = document.getElementById('context-menu');
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.add('visible');
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.remove('visible');
}

document.getElementById('ctx-add-hub').addEventListener('click', () => {
  hideContextMenu();
  if (contextLatLng) addPin('hub', contextLatLng);
});

document.getElementById('ctx-add-bird').addEventListener('click', () => {
  hideContextMenu();
  if (contextLatLng) {
    pendingBirdLatLng = contextLatLng;
    showCategoryModal();
  }
});

document.addEventListener('click', e => {
  if (!document.getElementById('context-menu').contains(e.target)) hideContextMenu();
});

/* ─── Category modal ─────────────────────────────────────────── */

function showCategoryModal() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.innerHTML = `
      <div class="cat-dot" style="background:${cat.color}22;color:${cat.color}">${cat.emoji}</div>
      ${cat.label}`;
    btn.addEventListener('click', () => {
      const latlng = pendingBirdLatLng;
      hideCategoryModal();
      if (latlng) addPin('bird', latlng, key);
    });
    grid.appendChild(btn);
  });
  document.getElementById('category-modal').classList.remove('hidden');
}

function hideCategoryModal() {
  document.getElementById('category-modal').classList.add('hidden');
  pendingBirdLatLng = null;
}

document.getElementById('category-cancel').addEventListener('click', hideCategoryModal);
document.getElementById('category-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideCategoryModal();
});

/* ─── Toolbar buttons ────────────────────────────────────────── */

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

/* ─── Panel fields → auto-save ───────────────────────────────── */

function onFieldInput() {
  const pin = state.pins.find(p => p.id === selectedPinId);
  if (!pin) return;
  pin.name  = document.getElementById('field-name').value;
  pin.blurb = document.getElementById('field-blurb').value;
  pin.link  = document.getElementById('field-link').value;
  document.getElementById('link-open').href = pin.link || '#';
  document.getElementById('link-open').style.opacity = pin.link ? '1' : '0.3';

  // update hub badge text if name changed (for connection chips elsewhere)
  save();
}

['field-name', 'field-blurb', 'field-link'].forEach(id => {
  document.getElementById(id).addEventListener('input', onFieldInput);
});

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('btn-delete').addEventListener('click', () => {
  if (selectedPinId) deletePin(selectedPinId);
});

/* ─── Export ─────────────────────────────────────────────────── */

document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = '2birds-map.json'; a.click();
  URL.revokeObjectURL(url);
});

/* ─── Search ─────────────────────────────────────────────────── */

const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchClear   = document.getElementById('search-clear');

let searchTimer = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('visible', q.length > 0);
  clearTimeout(searchTimer);
  if (!q) { hideSearchResults(); return; }
  searchTimer = setTimeout(() => runSearch(q), 350);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { clearSearch(); }
});

searchClear.addEventListener('click', clearSearch);

function clearSearch() {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  hideSearchResults();
  removeSearchMarker();
}

function hideSearchResults() {
  searchResults.classList.remove('visible');
  searchResults.innerHTML = '';
}

async function runSearch(q) {
  // check for coordinate pair: "40.7128, -74.0060" or "40.7128 -74.0060"
  const coordMatch = q.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      flyToResult(lat, lng, `${lat}, ${lng}`, 'Coordinates', 15);
      hideSearchResults();
      return;
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}&viewbox=-74.3,40.45,-73.6,40.95&bounded=0`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    showSearchResults(data);
  } catch (_) {
    searchResults.innerHTML = '<div class="search-no-result">Could not reach geocoding service</div>';
    searchResults.classList.add('visible');
  }
}

function showSearchResults(data) {
  searchResults.innerHTML = '';
  if (!data.length) {
    searchResults.innerHTML = '<div class="search-no-result">No results found</div>';
    searchResults.classList.add('visible');
    return;
  }
  data.forEach(item => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    const parts = item.display_name.split(', ');
    const main  = parts.slice(0, 2).join(', ');
    const sub   = parts.slice(2).join(', ');
    div.innerHTML = `<div class="result-main">${main}</div>${sub ? `<div class="result-sub">${sub}</div>` : ''}`;
    div.addEventListener('click', () => {
      flyToResult(parseFloat(item.lat), parseFloat(item.lon), main, sub, 15);
      hideSearchResults();
      searchInput.value = main;
    });
    searchResults.appendChild(div);
  });
  searchResults.classList.add('visible');
}

function flyToResult(lat, lng, main, sub, zoom) {
  map.flyTo([lat, lng], zoom, { duration: 1.2 });
  removeSearchMarker();

  const html = `<div class="search-marker-wrap"><div class="search-marker-pulse"></div><div class="search-marker-dot"></div></div>`;
  searchMarker = L.marker([lat, lng], {
    icon: L.divIcon({ html, className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
    zIndexOffset: 500,
  }).addTo(map);

  clearTimeout(searchClearTimer);
  searchClearTimer = setTimeout(removeSearchMarker, 6000);
}

function removeSearchMarker() {
  if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
}

/* ─── Boot ───────────────────────────────────────────────────── */

loadState();
state.pins.forEach(placeMarker);
