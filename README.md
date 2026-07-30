# 🚛 Gerenciamiento de Viajes

Sistema full-stack completo en español para la administración y rastreo GPS en tiempo real de viajes de una flotilla vehicular. Diseñado con soporte nativo para **Telegram Mini App** (Conductores) y **Panel Web Administrativo** (Supervisores y Operadores), respaldado por **Node.js REST API**, **SQLite (`db.sqlite`)**, **Docker Compose** y **Nginx**.

---

## 📁 Estructura del Proyecto

```
/
├── backend/                  # API REST Node.js / Express con SQLite (better-sqlite3)
│   ├── src/                  # Servidor, rutas, middlewares y controladores
│   ├── package.json          # Dependencias del backend
│   └── Dockerfile            # Imagen Docker de Node.js Alpine
├── frontend/                 # Web App Conductor / Telegram Mini App
│   ├── index.html            # Interfaz moderna con Glassmorphism
│   ├── styles.css            # Estilos responsivos con paleta en HSL
│   ├── app.js                # Lógica del conductor, GPS watchPosition y API
│   ├── nginx.conf            # Configuración Nginx y Proxy Inverso (Puerto 80)
│   └── Dockerfile            # Imagen Docker de Nginx Alpine
├── panel-admin/              # Panel Administrativo Web (Dashboard SPA)
│   ├── index.html            # Dashboard con Sidebar, Navbar y Tablas
│   ├── styles.css            # Estilos visuales del Panel Admin
│   ├── admin.js              # Lógica de login JWT, cookies httpOnly y catálogos
│   ├── nginx.conf            # Configuración Nginx (Puerto 8081)
│   └── Dockerfile            # Imagen Docker Nginx
├── database/
│   ├── db.sqlite             # Archivo de base de datos SQLite (auto-inicializable)
│   ├── migrations/
│   │   └── 001_init_schema.sql  # DDL SQL de tablas, constraints, FKs e índices
│   ├── seeds/
│   │   └── 001_seed_data.sql    # Datos iniciales (Estados, Vehículos, Lugares)
│   └── scripts/
│       ├── init-db.js        # Script Node.js de inicialización DDL/DML
│       └── create-admin.js   # Script CLI Node.js para registrar administradores cifrados
├── compose.yml               # Orquestación Docker Compose (Backend, Frontend, Admin)
├── .env.example              # Variables de entorno de ejemplo
├── .env                      # Variables de entorno activas
└── README.md                 # Documentación completa
```

---

## ⚙️ Requisitos Previos

- **Docker y Docker Compose** (recomendado para ejecución en contenedores)
- **Node.js 18+** y **npm** (si se desea ejecutar localmente sin Docker)

---

## 🚀 Instalación y Ejecución con Docker Compose (Recomendado)

1. **Clonar o descargar el repositorio** e ingresar a la carpeta del proyecto:
   ```bash
   cd gerenciamiento-viajes
   ```

2. **Verificar variables de entorno**:
   Asegúrese de contar con el archivo `.env` (creado a partir de `.env.example`).

3. **Construir e iniciar los servicios con Docker Compose**:
   ```bash
   docker compose up --build -d
   ```

4. **Verificar el estado de los contenedores**:
   ```bash
   docker compose ps
   ```

---

## 🌐 URLs y Servicios Disponibles

| Servicio | Puerto Host | Descripción / Enlace |
| :--- | :--- | :--- |
| **Frontend Conductor (Telegram Mini App)** | `80` | [http://localhost](http://localhost) |
| **Panel Administrativo Web** | `8081` | [http://localhost:8081](http://localhost:8081) |
| **Backend REST API & Health check** | `3000` | [http://localhost:3000/health](http://localhost:3000/health) |

---

## 🔑 Credenciales Iniciales de Prueba

### Panel Administrativo (http://localhost:8081)
- **Usuario**: `admin`
- **Contraseña**: `Admin123!`
- **Rol**: `ADMINISTRADOR`

### Script CLI para Crear o Actualizar Administradores:
Puedes registrar o modificar usuarios administradores con contraseñas cifradas en `bcrypt` ejecutando:
```bash
node database/scripts/create-admin.js <usuario> <contraseña> <nombre> <correo> <rol>
```
*Ejemplo:*
```bash
node database/scripts/create-admin.js operador Pass123! "Operador Nocturno" operador@flotilla.com OPERADOR
```

---

## 🚖 Funcionalidades y Flujos de Uso

### 1. Web App de Conductor (Telegram Mini App)
- **Acceso Directo o Simulación**: Funciona de forma automática dentro de Telegram Mini App validando `initData` por HMAC-SHA256, o fuera de Telegram en **Modo Demo Web**.
- **Registro de Conductor**: Si el usuario de Telegram no está vinculado a un conductor, se presenta el formulario para capturar Nombre, Teléfono, Número de Licencia y Vencimiento. La vigencia se calcula automáticamente.
- **Formulario "Nuevo Viaje"**:
  - Muestra el nombre y estado de licencia del conductor autenticado.
  - Al seleccionar un vehículo, precarga automáticamente su **Kilometraje Actual**.
  - Valida que el Origen y Destino sean distintos.
  - Valida que el Kilometraje Inicial no sea inferior al registrado por la unidad.
  - Genera Folio consecutivo diario: `VJ-YYYYMMDD-0001`.
- **Rastreo GPS en Tiempo Real**:
  - Al presionar **Iniciar Viaje** (estado `EN_CURSO`), la app activa `navigator.geolocation.watchPosition` enviando coordenadas (latitud, longitud, precisión, velocidad y dirección) cada 15 segundos al backend.
- **Finalización de Viaje**:
  - Captura del kilometraje final.
  - Validación de `kilometraje_final >= kilometraje_inicial`.
  - Cálculo de kilómetros recorridos y actualización del kilometraje actual de la unidad.
  - Resumen visual completo con Folio, horas, kilómetros y última ubicación.

### 2. Panel Administrativo (http://localhost:8081)
- **Inicio de Sesión Seguro**: Autenticación JWT almacenada en **Cookie `httpOnly`**.
- **Protección contra Intentos Fallidos**: Bloqueo automático temporal tras 3 intentos fallidos (configurables vía `ADMIN_LOGIN_MAX_ATTEMPTS` y `ADMIN_LOGIN_BLOCK_MINUTES`).
- **Módulos Disponibles**:
  - 📑 **Viajes**: Consulta de historial con filtros por estado (`PENDIENTE`, `EN_CURSO`, `FINALIZADO`), desglose de folios, rutas, horas y acompañantes.
  - 👨‍✈️ **Conductores**: Altas y ediciones de conductores, estatus de licencia (Vigente/Vencida) y sincronización con Telegram.
  - 🚚 **Unidades**: Gestión de vehículos (Hilux, L300, etc.), números económicos, placas y kilometraje acumulado.
  - 📍 **Destinos**: Registro de lugares y puntos de control con coordenadas.
  - 📡 **Ubicaciones GPS**: Monitoreo en vivo con mapas de los viajes `EN_CURSO` y última posición recibida.

---

## 🛠️ Endpoints de la API REST

### Catálogos y Salud
- `GET /health` - Estado del servidor y conexión a base de datos.
- `GET /api/catalogos/conductores` - Lista de conductores activos.
- `GET /api/catalogos/vehiculos` - Lista de vehículos activos.
- `GET /api/catalogos/lugares` - Lista de lugares activos.
- `GET /api/catalogos/estados-viaje` - Lista de estados de viaje.

### Telegram y Conductores
- `POST /api/telegram/autenticar` - Validar `initData` de Telegram o simulación demo.
- `POST /api/telegram/registro-conductor` - Registro y vinculación de conductor.

### Gestión de Viajes
- `POST /api/viajes` - Crear viaje (Folio diario `VJ-YYYYMMDD-XXXX`, estado `PENDIENTE`).
- `POST /api/viajes/:idViaje/iniciar` - Iniciar viaje (salida y estado `EN_CURSO`).
- `POST /api/viajes/:idViaje/finalizar` - Finalizar viaje (llegada, km recorridos y actualización de unidad).
- `GET /api/viajes/activo` - Consultar viaje activo del conductor.
- `GET /api/viajes/:idViaje` - Consultar detalle completo de viaje.
- `POST /api/viajes/:idViaje/ubicaciones` - Registrar punto GPS (latitud, longitud, velocidad, precisión).

### Panel Administrativo
- `POST /api/admin/auth/login` - Autenticación Admin (Cookie httpOnly JWT).
- `GET /api/admin/auth/session` - Validar sesión activa.
- `POST /api/admin/auth/logout` - Cerrar sesión Admin.
- `GET /api/admin/conductores` | `POST /api/admin/conductores`
- `GET /api/admin/vehiculos` | `POST /api/admin/vehiculos`
- `GET /api/admin/lugares` | `POST /api/admin/lugares`
- `GET /api/admin/viajes`
- `GET /api/admin/ubicaciones/recientes`

---

## 🗄️ Esquema de Base de Datos SQLite

El esquema relacional incluye las siguientes tablas con llaves foráneas y restricciones `CHECK`:
1. `conductores`
2. `vehiculos`
3. `lugares`
4. `estados_viaje`
5. `viajes`
6. `ubicaciones_viaje`
7. `historial_estados_viaje`
8. `usuarios_telegram`
9. `usuarios_admin`

---

## 📜 Licencia y Autoría

Desarrollado para el proyecto **Gerenciamiento de Viajes** de flotilla vehicular.
