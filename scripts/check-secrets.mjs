#!/usr/bin/env node
// Comprueba que los secretos no lleguen al repositorio ni al bundle del frontend.
//
//   node scripts/check-secrets.mjs               → revisa los archivos versionados
//   node scripts/check-secrets.mjs front/dist    → además revisa el bundle compilado
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const problems = [];

// Claves reales, sin importar dónde aparezcan.
const secretValuePatterns = [
  { name: "clave secreta de Supabase", pattern: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "llave privada", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

// Nombres y valores que nunca deben existir en código que se ejecuta en el navegador.
const bundlePatterns = [
  ...secretValuePatterns,
  { name: "referencia a service_role", pattern: /service_role/i },
  { name: "cadena de conexión de PostgreSQL", pattern: /postgres(?:ql)?:\/\/[^\s"'`]+/i },
  { name: "variable secreta del backend", pattern: /JWT_ACCESS_SECRET|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL|POSTGRES_PASSWORD/ },
];

const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function serviceRoleJwts(content) {
  return (content.match(jwtPattern) ?? []).filter((token) => {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      return payload.role === "service_role";
    } catch {
      return false;
    }
  });
}

function scanContent(label, content, patterns) {
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) problems.push(`${label}: contiene ${name}`);
  }
  if (serviceRoleJwts(content).length > 0) problems.push(`${label}: contiene un JWT con rol service_role`);
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

// 1. Archivos versionados.
const trackedFiles = execFileSync("git", ["ls-files", "-z", "--full-name"], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

for (const file of trackedFiles) {
  const fileName = file.split("/").pop();
  if (/^\.env(\..+)?$/.test(fileName) && fileName !== ".env.example") {
    problems.push(`${file}: los archivos de entorno no deben versionarse`);
  }
  const path = join(repositoryRoot, file);
  if (file === "scripts/check-secrets.mjs" || !existsSync(path)) continue;
  const buffer = readFileSync(path);
  if (!isBinary(buffer)) scanContent(file, buffer.toString("utf8"), secretValuePatterns);
}

// 2. Bundle del frontend.
const bundleDirectory = process.argv[2] ? resolve(process.argv[2]) : null;
function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

if (bundleDirectory) {
  if (!existsSync(bundleDirectory)) {
    problems.push(`${bundleDirectory}: no existe; compile el frontend antes de revisarlo`);
  } else {
    for (const path of listFiles(bundleDirectory)) {
      const buffer = readFileSync(path);
      if (!isBinary(buffer)) {
        scanContent(relative(repositoryRoot, path).replaceAll("\\", "/"), buffer.toString("utf8"), bundlePatterns);
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Se encontraron posibles secretos expuestos:");
  for (const problem of problems) console.error(`  ✘ ${problem}`);
  process.exit(1);
}
console.info(
  `✔ Sin secretos en ${trackedFiles.length} archivos versionados${bundleDirectory ? " ni en el bundle del frontend" : ""}`,
);
