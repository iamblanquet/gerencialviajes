function getApiUrl() {
    if (window.location.hostname.includes('onrender.com')) {
        return 'https://gerenciamiento-viajes-backend.onrender.com/api/admin';
    }
    return '/api/admin';
}

const API_URL = getApiUrl();

let currentAdmin = null;
let currentModule = 'viajes';

let mainGpsMap = null;
let mainGpsMarkers = [];
let currentGpsTab = 'live';

// Helper para llamadas fetch seguras con credenciales y token Bearer
async function safeFetchJson(url, options = {}) {
    const token = localStorage.getItem('admin_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
        credentials: 'include',
        ...options,
        headers
    };

    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('content-type');
    
    if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`El servidor devolvió un error (${res.status}): ${text.substring(0, 100)}`);
    }

    const json = await res.json();
    if (res.status === 401) {
        localStorage.removeItem('admin_token');
        showLogin();
    }
    return json;
}

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupAdminEvents();
});

function setupAdminEvents() {
    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const mod = item.getAttribute('data-module');
            switchModule(mod);
        });
    });

    document.getElementById('filter-viajes-estado').addEventListener('change', () => loadViajes());
    document.getElementById('btn-refresh-viajes').addEventListener('click', () => loadViajes());

    document.getElementById('btn-add-conductor').addEventListener('click', () => openConductorModal());
    document.getElementById('btn-add-vehiculo').addEventListener('click', () => openVehiculoModal());
    document.getElementById('btn-add-lugar').addEventListener('click', () => openLugarModal());
    
    document.getElementById('btn-refresh-gps').addEventListener('click', () => {
        if (currentGpsTab === 'live') loadUbicacionesGPS();
        else loadHistorialGPS();
    });

    document.getElementById('btn-view-gps-live').addEventListener('click', () => switchGpsSubTab('live'));
    document.getElementById('btn-view-gps-history').addEventListener('click', () => switchGpsSubTab('history'));
    
    document.getElementById('filter-gps-trip').addEventListener('change', () => loadHistorialGPS());

    document.getElementById('btn-close-admin-modal').addEventListener('click', closeModal);
}

// ----------------------------------------------------
// AUTENTICACIÓN Y SESIÓN
// ----------------------------------------------------
async function checkSession() {
    try {
        const res = await safeFetchJson(`${API_URL}/auth/session`);
        if (res.success && res.data) {
            currentAdmin = res.data;
            showDashboard();
        } else {
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const alertBox = document.getElementById('login-alert');
    alertBox.classList.add('hidden');

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await safeFetchJson(`${API_URL}/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (!res.success) {
            alertBox.textContent = res.message;
            alertBox.className = 'alert alert-danger';
            alertBox.classList.remove('hidden');
            return;
        }

        currentAdmin = res.data;
        if (res.data.token) {
            localStorage.setItem('admin_token', res.data.token);
        }
        showDashboard();
    } catch (err) {
        alertBox.textContent = 'Error al conectar con el servidor: ' + err.message;
        alertBox.className = 'alert alert-danger';
        alertBox.classList.remove('hidden');
    }
}

async function handleLogout() {
    try {
        await safeFetchJson(`${API_URL}/auth/logout`, { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('admin_token');
    currentAdmin = null;
    showLogin();
}

function showLogin() {
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('view-dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');

    if (currentAdmin) {
        document.getElementById('user-display-name').textContent = currentAdmin.nombre || currentAdmin.username;
        document.getElementById('user-display-role').textContent = currentAdmin.rol;
    }

    switchModule(currentModule);
}

function switchModule(modName) {
    currentModule = modName;

    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('data-module') === modName) item.classList.add('active');
        else item.classList.remove('active');
    });

    const modules = ['viajes', 'conductores', 'unidades', 'destinos', 'ubicaciones'];
    modules.forEach(m => {
        const el = document.getElementById(`mod-${m}`);
        if (el) {
            if (m === modName) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    const titles = {
        viajes: 'Gestión y Historial de Viajes',
        conductores: 'Catálogo de Conductores',
        unidades: 'Flotilla Vehicular',
        destinos: 'Catálogo de Lugares y Destinos',
        ubicaciones: 'Monitoreo GPS en Tiempo Real e Historial'
    };
    document.getElementById('module-title').textContent = titles[modName] || 'Dashboard';

    if (modName === 'viajes') loadViajes();
    else if (modName === 'conductores') loadConductores();
    else if (modName === 'unidades') loadUnidades();
    else if (modName === 'destinos') loadDestinos();
    else if (modName === 'ubicaciones') loadUbicacionesGPS();
}

// ----------------------------------------------------
// CARGA DE DATOS DE MÓDULOS
// ----------------------------------------------------
async function loadViajes() {
    const tbody = document.getElementById('tbody-viajes');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando...</td></tr>';

    const estadoFilter = document.getElementById('filter-viajes-estado').value;
    let url = `${API_URL}/viajes`;
    if (estadoFilter) url += `?estado=${encodeURIComponent(estadoFilter)}`;

    try {
        const res = await safeFetchJson(url);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay viajes registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = res.data.map(v => `
            <tr>
                <td><strong>${v.folio}</strong></td>
                <td>${v.fecha}</td>
                <td>${v.conductor_nombre}</td>
                <td>${v.vehiculo_nombre} (${v.numero_economico})</td>
                <td>${v.origen_nombre} ➔ ${v.destino_nombre}</td>
                <td><span class="badge badge-${v.estado_nombre}">${v.estado_nombre}</span></td>
                <td>${v.kilometros_recorridos !== null ? v.kilometros_recorridos + ' km' : '-'}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="viewTripDetail(${v.id_viajes})">Detalles y Historial</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function loadConductores() {
    const tbody = document.getElementById('tbody-conductores');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando...</td></tr>';

    try {
        const res = await safeFetchJson(`${API_URL}/conductores`);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay conductores.</td></tr>';
            return;
        }

        tbody.innerHTML = res.data.map(c => `
            <tr>
                <td>#${c.id_conductores}</td>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.licencia_numero || '-'}</td>
                <td>
                    <span class="badge ${c.licencia_vigente ? 'badge-vigente' : 'badge-vencida'}">
                        ${c.licencia_vigente ? 'Vigente' : 'Vencida'}
                    </span>
                </td>
                <td>${c.licencia_vencimiento || '-'}</td>
                <td>${c.telefono || '-'}</td>
                <td>${c.telegram_username ? '@' + c.telegram_username : (c.telegram_user_id ? 'ID: ' + c.telegram_user_id : 'Sin vincular')}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="editConductor(${c.id_conductores})">Editar</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function loadUnidades() {
    const tbody = document.getElementById('tbody-unidades');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';

    try {
        const res = await safeFetchJson(`${API_URL}/vehiculos`);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay vehículos registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = res.data.map(v => `
            <tr>
                <td><strong>${v.numero_economico}</strong></td>
                <td>${v.nombre}</td>
                <td>${v.placas || '-'}</td>
                <td><strong>${v.kilometraje_actual} km</strong></td>
                <td>${v.activo ? '<span class="badge badge-vigente">Activo</span>' : '<span class="badge badge-vencida">Inactivo</span>'}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="editVehiculo(${v.id_vehiculos})">Editar</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function loadDestinos() {
    const tbody = document.getElementById('tbody-destinos');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';

    try {
        const res = await safeFetchJson(`${API_URL}/lugares`);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay lugares registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = res.data.map(l => `
            <tr>
                <td>#${l.id_lugares}</td>
                <td><strong>${l.nombre}</strong></td>
                <td>${l.direccion || '-'}</td>
                <td>${l.latitud && l.longitud ? `${l.latitud}, ${l.longitud}` : 'Sin coordenadas'}</td>
                <td>${l.activo ? '<span class="badge badge-vigente">Activo</span>' : '<span class="badge badge-vencida">Inactivo</span>'}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="editLugar(${l.id_lugares})">Editar</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

// ----------------------------------------------------
// MONITOREO EN VIVO E HISTORIAL DE COORDENADAS GPS
// ----------------------------------------------------
function switchGpsSubTab(tab) {
    currentGpsTab = tab;
    const btnLive = document.getElementById('btn-view-gps-live');
    const btnHistory = document.getElementById('btn-view-gps-history');
    const secLive = document.getElementById('section-gps-live');
    const secHistory = document.getElementById('section-gps-history');

    if (tab === 'live') {
        btnLive.className = 'btn btn-primary';
        btnHistory.className = 'btn btn-secondary';
        secLive.classList.remove('hidden');
        secHistory.classList.add('hidden');
        loadUbicacionesGPS();
    } else {
        btnLive.className = 'btn btn-secondary';
        btnHistory.className = 'btn btn-primary';
        secLive.classList.add('hidden');
        secHistory.classList.remove('hidden');
        populateTripFilter();
        loadHistorialGPS();
    }
}

async function loadUbicacionesGPS() {
    const tbody = document.getElementById('tbody-ubicaciones');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando...</td></tr>';

    initMainGpsMap();

    try {
        const res = await safeFetchJson(`${API_URL}/ubicaciones/recientes`);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay viajes transmitiendo GPS actualmente.</td></tr>';
            clearMainMapMarkers();
            return;
        }

        clearMainMapMarkers();
        const bounds = [];

        tbody.innerHTML = res.data.map((u) => {
            const lat = Number(u.latitud);
            const lng = Number(u.longitud);
            bounds.push([lat, lng]);

            if (mainGpsMap) {
                const marker = L.marker([lat, lng]).addTo(mainGpsMap)
                    .bindPopup(`
                        <div style="font-size:12px; font-family:sans-serif;">
                            <strong>Folio: ${u.folio}</strong><br>
                            Conductor: ${u.conductor_nombre}<br>
                            Unidad: ${u.vehiculo_nombre} (${u.numero_economico})<br>
                            Reporte: ${new Date(u.fecha_gps).toLocaleTimeString('es-MX')}
                        </div>
                    `);
                mainGpsMarkers.push(marker);
            }

            return `
                <tr>
                    <td><strong>${u.folio}</strong></td>
                    <td>${u.conductor_nombre}</td>
                    <td>${u.vehiculo_nombre} (${u.numero_economico})</td>
                    <td>${lat.toFixed(6)}</td>
                    <td>${lng.toFixed(6)}</td>
                    <td>${u.precision_metros ? Math.round(u.precision_metros) + ' m' : '-'}</td>
                    <td>${new Date(u.fecha_gps).toLocaleString('es-MX')}</td>
                    <td>
                        <button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="centerMainMap(${lat}, ${lng})">Ubicar en Mapa</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (mainGpsMap && bounds.length > 0) {
            mainGpsMap.fitBounds(bounds, { padding: [40, 40] });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

async function populateTripFilter() {
    const select = document.getElementById('filter-gps-trip');
    try {
        const res = await safeFetchJson(`${API_URL}/viajes`);
        if (res.success && res.data) {
            select.innerHTML = '<option value="">Todas las Ubicaciones Registradas</option>' +
                res.data.map(v => `<option value="${v.id_viajes}">${v.folio} - ${v.conductor_nombre} (${v.fecha})</option>`).join('');
        }
    } catch (e) {}
}

async function loadHistorialGPS() {
    const tbody = document.getElementById('tbody-historial-gps');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Cargando historial de coordenadas...</td></tr>';

    initMainGpsMap();

    const selectedTripId = document.getElementById('filter-gps-trip').value;
    let url = `${API_URL}/ubicaciones/historial`;
    if (selectedTripId) url += `?id_viajes=${selectedTripId}`;

    try {
        const res = await safeFetchJson(url);

        if (!res.success || !res.data || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No hay registros de coordenadas GPS guardados.</td></tr>';
            clearMainMapMarkers();
            return;
        }

        clearMainMapMarkers();
        const bounds = [];

        tbody.innerHTML = res.data.map((u) => {
            const lat = Number(u.latitud);
            const lng = Number(u.longitud);
            bounds.push([lat, lng]);

            if (mainGpsMap) {
                const marker = L.marker([lat, lng]).addTo(mainGpsMap)
                    .bindPopup(`
                        <div style="font-size:12px; font-family:sans-serif;">
                            <strong>#${u.id_ubicaciones_viaje} - Folio: ${u.folio}</strong><br>
                            Conductor: ${u.conductor_nombre}<br>
                            Fecha: ${new Date(u.fecha_gps).toLocaleString('es-MX')}<br>
                            Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}
                        </div>
                    `);
                mainGpsMarkers.push(marker);
            }

            return `
                <tr>
                    <td>#${u.id_ubicaciones_viaje}</td>
                    <td>${new Date(u.fecha_gps).toLocaleString('es-MX')}</td>
                    <td><strong>${u.folio}</strong></td>
                    <td>${u.conductor_nombre}</td>
                    <td>${u.vehiculo_nombre} (${u.numero_economico})</td>
                    <td>${lat.toFixed(6)}</td>
                    <td>${lng.toFixed(6)}</td>
                    <td>${u.precision_metros ? Math.round(u.precision_metros) + ' m' : '-'}</td>
                    <td>
                        <button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="centerMainMap(${lat}, ${lng})">Ubicar</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (mainGpsMap && bounds.length > 0) {
            mainGpsMap.fitBounds(bounds, { padding: [40, 40] });
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

function initMainGpsMap() {
    if (!mainGpsMap && typeof L !== 'undefined') {
        const mapContainer = document.getElementById('admin-gps-map');
        if (mapContainer) {
            mainGpsMap = L.map('admin-gps-map').setView([19.8456, -90.5312], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap'
            }).addTo(mainGpsMap);
        }
    } else if (mainGpsMap) {
        setTimeout(() => mainGpsMap.invalidateSize(), 200);
    }
}

function clearMainMapMarkers() {
    if (mainGpsMarkers && mainGpsMarkers.length) {
        mainGpsMarkers.forEach(m => mainGpsMap && mainGpsMap.removeLayer(m));
        mainGpsMarkers = [];
    }
}

function centerMainMap(lat, lng) {
    if (mainGpsMap) {
        mainGpsMap.setView([lat, lng], 16);
    }
}

// ----------------------------------------------------
// MODALES DE EDICIÓN Y DETALLES CON RUTA Y REGISTRO COMPLETO DE COORDENADAS
// ----------------------------------------------------
async function viewTripDetail(idViaje) {
    try {
        const res = await safeFetchJson(`${API_URL}/viajes/${idViaje}`);
        if (!res.success) return alert(res.message);

        const v = res.data;
        let acompStr = '-';
        try {
            const arr = typeof v.acompanantes === 'string' ? JSON.parse(v.acompanantes) : v.acompanantes;
            if (Array.isArray(arr) && arr.length) acompStr = arr.join(', ');
        } catch (e) {}

        let paradasHtml = '<p style="color:#64748b; font-size:12px;">Sin paradas registradas.</p>';
        if (v.paradas && v.paradas.length > 0) {
            paradasHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">
                    ${v.paradas.map(p => `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px 10px; border-radius:6px; font-size:12px;">
                            <strong>Motivo:</strong> ${p.motivo_parada}<br>
                            <strong>Inicio:</strong> ${new Date(p.hora_inicio).toLocaleString('es-MX')}<br>
                            <strong>Duración:</strong> ${p.duracion_minutos !== null ? p.duracion_minutos + ' min' : 'En curso'}<br>
                            ${p.observaciones ? `<strong>Notas:</strong> ${p.observaciones}` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        let ubicacionesLogHtml = '<p style="color:#64748b; font-size:12px;">Sin coordenadas GPS registradas en este viaje.</p>';
        if (v.ubicaciones && v.ubicaciones.length > 0) {
            ubicacionesLogHtml = `
                <div style="max-height: 160px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 6px;">
                    <table class="data-table" style="font-size:11px;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Fecha / Hora GPS</th>
                                <th>Latitud</th>
                                <th>Longitud</th>
                                <th>Precisión</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${v.ubicaciones.map(u => `
                                <tr>
                                    <td>#${u.id_ubicaciones_viaje}</td>
                                    <td>${new Date(u.fecha_gps).toLocaleString('es-MX')}</td>
                                    <td>${Number(u.latitud).toFixed(6)}</td>
                                    <td>${Number(u.longitud).toFixed(6)}</td>
                                    <td>${u.precision_metros ? Math.round(u.precision_metros) + ' m' : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const html = `
            <div style="font-size:13px; display:flex; flex-direction:column; gap:10px;">
                <div><strong>Folio:</strong> ${v.folio} <span class="badge badge-${v.estado_nombre}">${v.estado_nombre}</span></div>
                <div><strong>Conductor:</strong> ${v.conductor_nombre} (${v.licencia_numero})</div>
                <div><strong>Vehículo:</strong> ${v.vehiculo_nombre} (${v.numero_economico}) - Placas: ${v.placas || 'N/A'}</div>
                <div><strong>Origen:</strong> ${v.origen_nombre}</div>
                <div><strong>Destino:</strong> ${v.destino_nombre}</div>
                <div><strong>Km Inicial:</strong> ${v.kilometraje_inicial} km</div>
                <div><strong>Km Final:</strong> ${v.kilometraje_final !== null ? v.kilometraje_final + ' km' : 'En trayecto'}</div>
                <div><strong>Km Recorridos:</strong> ${v.kilometros_recorridos !== null ? v.kilometros_recorridos + ' km' : 'En trayecto'}</div>
                <div><strong>Acompañantes:</strong> ${acompStr}</div>
                <div><strong>Motivo:</strong> ${v.motivo}</div>
                <div><strong>Salida:</strong> ${v.hora_salida ? new Date(v.hora_salida).toLocaleString('es-MX') : 'Pendiente'}</div>
                <div><strong>Llegada:</strong> ${v.hora_llegada ? new Date(v.hora_llegada).toLocaleString('es-MX') : 'Pendiente'}</div>
                
                <div style="margin-top:6px; border-top:1px solid #e2e8f0; padding-top:8px;">
                    <strong>Historial de Paradas del Viaje:</strong>
                    ${paradasHtml}
                </div>

                <div style="margin-top:6px; border-top:1px solid #e2e8f0; padding-top:8px;">
                    <strong>Mapa de Ruta Recorrida:</strong>
                    <div id="modal-trip-map" style="height: 220px; width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 6px;"></div>
                </div>

                <div style="margin-top:6px; border-top:1px solid #e2e8f0; padding-top:8px;">
                    <strong>Historial Completo de Coordenadas GPS (${v.ubicaciones ? v.ubicaciones.length : 0} puntos):</strong>
                    ${ubicacionesLogHtml}
                </div>
            </div>
        `;

        openModal('Detalles del Viaje', html);

        setTimeout(async () => {
            if (typeof L !== 'undefined') {
                const mapEl = document.getElementById('modal-trip-map');
                if (mapEl) {
                    const detailMap = L.map('modal-trip-map').setView([19.8456, -90.5312], 12);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(detailMap);

                    try {
                        const locationsRes = await safeFetchJson(`${API_URL}/viajes/${idViaje}/ubicaciones`);
                        if (locationsRes.success && locationsRes.data && locationsRes.data.length > 0) {
                            const latLngs = locationsRes.data.map(p => [Number(p.latitud), Number(p.longitud)]);
                            
                            L.polyline(latLngs, { color: '#2563eb', weight: 4 }).addTo(detailMap);
                            L.marker(latLngs[0]).addTo(detailMap).bindPopup('Inicio del Viaje');

                            if (latLngs.length > 1) {
                                L.marker(latLngs[latLngs.length - 1]).addTo(detailMap).bindPopup('Última Posición GPS');
                            }

                            detailMap.fitBounds(L.polyline(latLngs).getBounds(), { padding: [20, 20] });
                        }
                    } catch (err) {}
                }
            }
        }, 200);

    } catch (e) {
        alert('Error al consultar detalles: ' + e.message);
    }
}

function openConductorModal(conductorData = null) {
    const isEdit = !!conductorData;
    const html = `
        <form id="form-admin-conductor">
            <input type="hidden" id="cond-id" value="${isEdit ? conductorData.id_conductores : ''}">
            <div class="form-group">
                <label>Nombre Completo *</label>
                <input type="text" id="cond-nombre" value="${isEdit ? conductorData.nombre : ''}" required>
            </div>
            <div class="form-group">
                <label>Número de Licencia *</label>
                <input type="text" id="cond-licencia" value="${isEdit ? conductorData.licencia_numero || '' : ''}" required>
            </div>
            <div class="form-group">
                <label>Fecha de Vencimiento de Licencia *</label>
                <input type="date" id="cond-vencimiento" value="${isEdit ? conductorData.licencia_vencimiento || '' : ''}" required>
            </div>
            <div class="form-group">
                <label>Teléfono</label>
                <input type="tel" id="cond-telefono" value="${isEdit ? conductorData.telefono || '' : ''}">
            </div>
            <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Actualizar' : 'Guardar'} Conductor</button>
        </form>
    `;

    openModal(isEdit ? 'Editar Conductor' : 'Nuevo Conductor', html);

    document.getElementById('form-admin-conductor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id_conductores: document.getElementById('cond-id').value || undefined,
            nombre: document.getElementById('cond-nombre').value,
            licencia_numero: document.getElementById('cond-licencia').value,
            licencia_vencimiento: document.getElementById('cond-vencimiento').value,
            telefono: document.getElementById('cond-telefono').value
        };

        const res = await safeFetchJson(`${API_URL}/conductores`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.success) {
            closeModal();
            loadConductores();
        } else {
            alert(res.message);
        }
    });
}

async function editConductor(id) {
    const res = await safeFetchJson(`${API_URL}/conductores`);
    const item = res.data.find(c => c.id_conductores === id);
    if (item) openConductorModal(item);
}

function openVehiculoModal(vehiculoData = null) {
    const isEdit = !!vehiculoData;
    const html = `
        <form id="form-admin-vehiculo">
            <input type="hidden" id="veh-id" value="${isEdit ? vehiculoData.id_vehiculos : ''}">
            <div class="form-group">
                <label>Nombre del Vehículo *</label>
                <input type="text" id="veh-nombre" value="${isEdit ? vehiculoData.nombre : ''}" placeholder="Ej: Toyota Hilux 4x4" required>
            </div>
            <div class="form-group">
                <label>Número Económico *</label>
                <input type="text" id="veh-numero" value="${isEdit ? vehiculoData.numero_economico : ''}" placeholder="Ej: AQR-01" required>
            </div>
            <div class="form-group">
                <label>Placas</label>
                <input type="text" id="veh-placas" value="${isEdit ? vehiculoData.placas || '' : ''}" placeholder="Ej: YZA-101-A">
            </div>
            <div class="form-group">
                <label>Kilometraje Actual (km) *</label>
                <input type="number" id="veh-km" value="${isEdit ? vehiculoData.kilometraje_actual : 0}" min="0" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Actualizar' : 'Guardar'} Unidad</button>
        </form>
    `;

    openModal(isEdit ? 'Editar Unidad' : 'Nueva Unidad', html);

    document.getElementById('form-admin-vehiculo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id_vehiculos: document.getElementById('veh-id').value || undefined,
            nombre: document.getElementById('veh-nombre').value,
            numero_economico: document.getElementById('veh-numero').value,
            placas: document.getElementById('veh-placas').value,
            kilometraje_actual: document.getElementById('veh-km').value
        };

        const res = await safeFetchJson(`${API_URL}/vehiculos`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.success) {
            closeModal();
            loadUnidades();
        } else {
            alert(res.message);
        }
    });
}

async function editVehiculo(id) {
    const res = await safeFetchJson(`${API_URL}/vehiculos`);
    const item = res.data.find(v => v.id_vehiculos === id);
    if (item) openVehiculoModal(item);
}

function openLugarModal(lugarData = null) {
    const isEdit = !!lugarData;
    const html = `
        <form id="form-admin-lugar">
            <input type="hidden" id="lug-id" value="${isEdit ? lugarData.id_lugares : ''}">
            <div class="form-group">
                <label>Nombre del Lugar *</label>
                <input type="text" id="lug-nombre" value="${isEdit ? lugarData.nombre : ''}" placeholder="Ej: Oficinas Centrales" required>
            </div>
            <div class="form-group">
                <label>Dirección</label>
                <textarea id="lug-direccion" rows="2">${isEdit ? lugarData.direccion || '' : ''}</textarea>
            </div>
            <div class="form-group">
                <label>Latitud</label>
                <input type="number" step="any" id="lug-lat" value="${isEdit ? lugarData.latitud || '' : ''}">
            </div>
            <div class="form-group">
                <label>Longitud</label>
                <input type="number" step="any" id="lug-lng" value="${isEdit ? lugarData.longitud || '' : ''}">
            </div>
            <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Actualizar' : 'Guardar'} Lugar</button>
        </form>
    `;

    openModal(isEdit ? 'Editar Lugar' : 'Nuevo Lugar', html);

    document.getElementById('form-admin-lugar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id_lugares: document.getElementById('lug-id').value || undefined,
            nombre: document.getElementById('lug-nombre').value,
            direccion: document.getElementById('lug-direccion').value,
            latitud: document.getElementById('lug-lat').value,
            longitud: document.getElementById('lug-lng').value
        };

        const res = await safeFetchJson(`${API_URL}/lugares`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.success) {
            closeModal();
            loadDestinos();
        } else {
            alert(res.message);
        }
    });
}

async function editLugar(id) {
    const res = await safeFetchJson(`${API_URL}/lugares`);
    const item = res.data.find(l => l.id_lugares === id);
    if (item) openLugarModal(item);
}

function openModal(title, contentHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = contentHtml;
    document.getElementById('admin-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('admin-modal').classList.add('hidden');
}
