const API_URL = '/api/admin';

let currentAdmin = null;
let currentModule = 'viajes';

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupAdminEvents();
});

function setupAdminEvents() {
    // Formulario de Login
    document.getElementById('form-login').addEventListener('submit', handleLogin);

    // Botón Logout
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Navegación Sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const mod = item.getAttribute('data-module');
            switchModule(mod);
        });
    });

    // Filtro de Viajes
    document.getElementById('filter-viajes-estado').addEventListener('change', () => loadViajes());
    document.getElementById('btn-refresh-viajes').addEventListener('click', () => loadViajes());

    // Botones Agregar
    document.getElementById('btn-add-conductor').addEventListener('click', () => openConductorModal());
    document.getElementById('btn-add-vehiculo').addEventListener('click', () => openVehiculoModal());
    document.getElementById('btn-add-lugar').addEventListener('click', () => openLugarModal());
    document.getElementById('btn-refresh-gps').addEventListener('click', () => loadUbicacionesGPS());

    // Cierre Modal
    document.getElementById('btn-close-admin-modal').addEventListener('click', closeModal);
}

// ----------------------------------------------------
// AUTENTICACIÓN Y SESIÓN
// ----------------------------------------------------
async function checkSession() {
    try {
        const response = await fetch(`${API_URL}/auth/session`);
        const res = await response.json();

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
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const res = await response.json();

        if (!res.success) {
            alertBox.textContent = res.message;
            alertBox.className = 'alert alert-danger';
            alertBox.classList.remove('hidden');
            return;
        }

        currentAdmin = res.data;
        showDashboard();
    } catch (err) {
        alertBox.textContent = 'Error al conectar con el servidor: ' + err.message;
        alertBox.className = 'alert alert-danger';
        alertBox.classList.remove('hidden');
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
    } catch (e) {}
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

    // Actualizar sidebar active
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('data-module') === modName) item.classList.add('active');
        else item.classList.remove('active');
    });

    // Ocultar todos los módulos
    const modules = ['viajes', 'conductores', 'unidades', 'destinos', 'ubicaciones'];
    modules.forEach(m => {
        const el = document.getElementById(`mod-${m}`);
        if (el) {
            if (m === modName) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    // Titulo del Modulo
    const titles = {
        viajes: 'Gestión y Historial de Viajes',
        conductores: 'Catálogo de Conductores',
        unidades: 'Flotilla Vehicular',
        destinos: 'Catálogo de Lugares y Destinos',
        ubicaciones: 'Monitoreo GPS en Tiempo Real'
    };
    document.getElementById('module-title').textContent = titles[modName] || 'Dashboard';

    // Cargar Datos del Modulo
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
        const response = await fetch(url);
        const res = await response.json();

        if (!res.success || !res.data.length) {
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
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="viewTripDetail(${v.id_viajes})">Detalles</button>
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
        const response = await fetch(`${API_URL}/conductores`);
        const res = await response.json();

        if (!res.success || !res.data.length) {
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
        const response = await fetch(`${API_URL}/vehiculos`);
        const res = await response.json();

        if (!res.success || !res.data.length) {
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
        const response = await fetch(`${API_URL}/lugares`);
        const res = await response.json();

        if (!res.success || !res.data.length) {
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

async function loadUbicacionesGPS() {
    const tbody = document.getElementById('tbody-ubicaciones');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/ubicaciones/recientes`);
        const res = await response.json();

        if (!res.success || !res.data.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay viajes transmitiendo GPS actualmente.</td></tr>';
            return;
        }

        tbody.innerHTML = res.data.map(u => `
            <tr>
                <td><strong>${u.folio}</strong></td>
                <td>${u.conductor_nombre}</td>
                <td>${u.vehiculo_nombre} (${u.numero_economico})</td>
                <td>${Number(u.latitud).toFixed(6)}</td>
                <td>${Number(u.longitud).toFixed(6)}</td>
                <td>${u.precision_metros ? Math.round(u.precision_metros) + ' m' : '-'}</td>
                <td>${new Date(u.fecha_gps).toLocaleString('es-MX')}</td>
                <td>
                    <a href="https://maps.google.com/?q=${u.latitud},${u.longitud}" target="_blank" class="btn btn-primary" style="padding:4px 8px; font-size:11px; text-decoration:none;">🗺️ Abrir Mapa</a>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${err.message}</td></tr>`;
    }
}

// ----------------------------------------------------
// MODALES DE EDICIÓN Y DETALLES
// ----------------------------------------------------
async function viewTripDetail(idViaje) {
    try {
        const response = await fetch(`/api/viajes/${idViaje}`);
        const res = await response.json();
        if (!res.success) return alert(res.message);

        const v = res.data;
        let acompStr = '-';
        try {
            const arr = typeof v.acompanantes === 'string' ? JSON.parse(v.acompanantes) : v.acompanantes;
            if (Array.isArray(arr) && arr.length) acompStr = arr.join(', ');
        } catch (e) {}

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
                ${v.ultima_ubicacion ? `
                    <div style="margin-top:10px; padding:10px; background:rgba(59,130,246,0.1); border-radius:6px;">
                        <strong>Última Ubicación GPS:</strong><br>
                        Lat: ${v.ultima_ubicacion.latitud}, Lng: ${v.ultima_ubicacion.longitud}<br>
                        Fecha: ${new Date(v.ultima_ubicacion.fecha_gps).toLocaleString('es-MX')}
                    </div>
                ` : ''}
            </div>
        `;

        openModal('Detalles del Viaje', html);
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

        const res = await fetch(`${API_URL}/conductores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            closeModal();
            loadConductores();
        } else {
            alert(res.message);
        }
    });
}

async function editConductor(id) {
    const res = await fetch(`${API_URL}/conductores`).then(r => r.json());
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

        const res = await fetch(`${API_URL}/vehiculos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            closeModal();
            loadUnidades();
        } else {
            alert(res.message);
        }
    });
}

async function editVehiculo(id) {
    const res = await fetch(`${API_URL}/vehiculos`).then(r => r.json());
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

        const res = await fetch(`${API_URL}/lugares`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.success) {
            closeModal();
            loadDestinos();
        } else {
            alert(res.message);
        }
    });
}

async function editLugar(id) {
    const res = await fetch(`${API_URL}/lugares`).then(r => r.json());
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
