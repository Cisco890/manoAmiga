# Frontend del CRM Escolar

Interfaz del CRM con autenticación, navegación protegida y vistas diferenciadas para administradores y colaboradores.

## Requisitos

- Node.js 20.19 o posterior

## Inicio

```bash
cd front
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:5173`.
La API debe estar disponible en `http://localhost:3000`; Vite redirige automáticamente las solicitudes `/api` durante el desarrollo.

Para un despliegue donde la API se encuentre en otro origen, defina:

```bash
VITE_API_URL=https://api.ejemplo.edu.gt/api
```

El token JWT de acceso permanece únicamente en memoria. La sesión se renueva mediante una cookie `HttpOnly`, por lo que no se guarda información sensible en `localStorage`.

## Gestión de usuarios

La vista `/usuarios`, disponible solo para administradores, está conectada al API REST. Permite:

- Listar y paginar usuarios.
- Buscar por nombre o correo y filtrar por rol o estado.
- Crear y editar cuentas con un único rol.
- Desactivar y reactivar cuentas.

Las solicitudes incluyen el JWT automáticamente. Si el token de acceso vence, el cliente intenta renovar la sesión una vez y repite la solicitud original. El backend sigue validando el permiso `user.manage`; ocultar la vista en React no sustituye la autorización del servidor.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — comprobación de TypeScript y empaquetado
- `npm run lint` — análisis estático con Oxlint
- `npm test` — pruebas con Vitest del inicio de sesión y la protección de rutas
- `npm run preview` — vista previa de la build
