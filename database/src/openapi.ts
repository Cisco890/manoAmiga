const errorResponse = {
  description: "Error de la solicitud",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "API CRM Mano Amiga",
    version: "1.0.0",
    description:
      "API REST para autenticación y administración de usuarios del CRM Mano Amiga. Los endpoints de usuarios requieren el permiso user.manage.",
  },
  servers: [{ url: "/", description: "Servidor actual" }],
  tags: [
    { name: "Sistema" },
    { name: "Autenticación" },
    { name: "Usuarios" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Sistema"],
        summary: "Comprobar el estado de la API",
        responses: { "200": { description: "API disponible" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Autenticación"],
        summary: "Iniciar sesión",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Sesión iniciada",
            headers: {
              "Set-Cookie": {
                description: "Refresh token rotativo en cookie HttpOnly",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Autenticación"],
        summary: "Renovar el JWT de acceso",
        description: "Utiliza y rota la cookie HttpOnly ma_refresh.",
        responses: {
          "200": {
            description: "Token renovado",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } },
            },
          },
          "401": errorResponse,
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Autenticación"],
        summary: "Cerrar y revocar la sesión",
        responses: { "204": { description: "Sesión cerrada" } },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Autenticación"],
        summary: "Consultar el usuario autenticado",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Usuario autenticado",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user"],
                  properties: { user: { $ref: "#/components/schemas/AuthUser" } },
                },
              },
            },
          },
          "401": errorResponse,
        },
      },
    },
    "/api/roles": {
      get: {
        tags: ["Usuarios"],
        summary: "Listar los roles asignables",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Roles ADMIN y COLLABORATOR" },
          "401": errorResponse,
          "403": errorResponse,
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["Usuarios"],
        summary: "Listar usuarios",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          { name: "q", in: "query", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          },
          {
            name: "role",
            in: "query",
            schema: { type: "string", enum: ["ADMIN", "COLLABORATOR"] },
          },
        ],
        responses: {
          "200": {
            description: "Listado paginado",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "pagination"],
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/User" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
        },
      },
      post: {
        tags: ["Usuarios"],
        summary: "Crear un usuario",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateUser" } },
          },
        },
        responses: {
          "201": {
            description: "Usuario creado",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/api/users/{userId}": {
      parameters: [
        {
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        tags: ["Usuarios"],
        summary: "Consultar un usuario",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Usuario encontrado" },
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
      patch: {
        tags: ["Usuarios"],
        summary: "Editar un usuario, su estado o su rol",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateUser" } },
          },
        },
        responses: {
          "200": { description: "Usuario actualizado" },
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
      delete: {
        tags: ["Usuarios"],
        summary: "Desactivar un usuario",
        description: "No elimina físicamente el registro; cambia su estado a INACTIVE y revoca sus sesiones.",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "Usuario desactivado" },
          "400": errorResponse,
          "401": errorResponse,
          "403": errorResponse,
          "404": errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "schoolId", "email", "displayName", "roles", "permissions"],
        properties: {
          id: { type: "string", format: "uuid" },
          schoolId: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          displayName: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          permissions: { type: "array", items: { type: "string" } },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["accessToken", "expiresIn", "user"],
        properties: {
          accessToken: { type: "string" },
          expiresIn: { type: "integer", example: 900 },
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
      Role: {
        type: "object",
        required: ["code", "name"],
        properties: {
          code: { type: "string", enum: ["ADMIN", "COLLABORATOR"] },
          name: { type: "string" },
        },
      },
      User: {
        type: "object",
        required: ["id", "schoolId", "email", "displayName", "status", "role"],
        properties: {
          id: { type: "string", format: "uuid" },
          schoolId: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          displayName: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
          role: { $ref: "#/components/schemas/Role" },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateUser: {
        type: "object",
        additionalProperties: false,
        required: ["email", "displayName", "password", "role"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          displayName: { type: "string", minLength: 2, maxLength: 160 },
          password: { type: "string", format: "password", minLength: 12, maxLength: 72 },
          role: { type: "string", enum: ["ADMIN", "COLLABORATOR"] },
        },
      },
      UpdateUser: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          displayName: { type: "string", minLength: 2, maxLength: 160 },
          role: { type: "string", enum: ["ADMIN", "COLLABORATOR"] },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
        },
      },
      Pagination: {
        type: "object",
        required: ["page", "limit", "total", "pages"],
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          pages: { type: "integer" },
        },
      },
    },
  },
} as const;

export const swaggerHtml = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Mano Amiga · Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body{margin:0;background:#f5f7fa}.topbar{display:none}</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true
      });
    </script>
  </body>
</html>`;
