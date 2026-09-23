import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensurePrivateBucket,
  privateBucketSettings,
  verifyPrivateBucket,
} from "../src/storage/supabase-storage";

type RecordedRequest = { method: string; url: string; headers: Headers; body?: string };

// Simula la API de Supabase Storage con un bucket en memoria.
function fakeStorage(initialBucket: { public: boolean } | null) {
  let bucket = initialBucket ? { id: "crm-privado", ...initialBucket } : null;
  const objects = new Set<string>();
  const requests: RecordedRequest[] = [];

  const fakeFetch: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : undefined;
    requests.push({ method, url, headers, body });
    const path = new URL(url).pathname.replace("/storage/v1", "");
    const json = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

    if (path === "/bucket/crm-privado" && method === "GET") {
      return bucket ? json(200, bucket) : json(400, { statusCode: "404", error: "Bucket not found" });
    }
    if (path === "/bucket" && method === "POST") {
      bucket = { id: "crm-privado", public: JSON.parse(body!).public };
      return json(200, { name: "crm-privado" });
    }
    if (path === "/bucket/crm-privado" && method === "PUT") {
      bucket = { id: "crm-privado", public: JSON.parse(body!).public };
      return json(200, { message: "Successfully updated" });
    }
    if (path.startsWith("/object/public/crm-privado/")) {
      const key = path.replace("/object/public/crm-privado/", "");
      return bucket?.public && objects.has(key)
        ? new Response("archivo", { status: 200 })
        : json(400, { error: "not_found" });
    }
    if (path.startsWith("/object/authenticated/crm-privado/")) {
      return json(400, { error: "not_found" });
    }
    if (path.startsWith("/object/crm-privado/") && method === "POST") {
      objects.add(path.replace("/object/crm-privado/", ""));
      return json(200, { Key: path });
    }
    if (path === "/object/crm-privado" && method === "DELETE") {
      for (const prefix of JSON.parse(body!).prefixes as string[]) objects.delete(prefix);
      return json(200, []);
    }
    return json(404, { error: "ruta no simulada" });
  };

  return { fakeFetch, requests, objects, bucket: () => bucket };
}

const baseConfig = {
  url: "https://proyecto.supabase.co/",
  serviceRoleKey: "clave-service-role",
  bucket: "crm-privado",
};

test("crea el bucket como privado cuando no existe", async () => {
  const storage = fakeStorage(null);
  const result = await ensurePrivateBucket({ ...baseConfig, fetch: storage.fakeFetch });

  assert.deepEqual(result, { created: true, wasPublic: false });
  assert.equal(storage.bucket()?.public, false);
  const creation = storage.requests.find((request) => request.method === "POST");
  assert.equal(creation?.url, "https://proyecto.supabase.co/storage/v1/bucket");
  assert.equal(creation?.headers.get("apikey"), "clave-service-role");
  assert.deepEqual(JSON.parse(creation!.body!), {
    id: "crm-privado",
    name: "crm-privado",
    ...privateBucketSettings,
  });
});

test("corrige un bucket existente que era público", async () => {
  const storage = fakeStorage({ public: true });
  const result = await ensurePrivateBucket({ ...baseConfig, fetch: storage.fakeFetch });

  assert.deepEqual(result, { created: false, wasPublic: true });
  assert.equal(storage.bucket()?.public, false);
});

test("verifica que el bucket privado no expone archivos y limpia el archivo de prueba", async () => {
  const storage = fakeStorage({ public: false });
  const checks = await verifyPrivateBucket({
    ...baseConfig,
    anonKey: "clave-anonima",
    fetch: storage.fakeFetch,
  });

  assert.equal(checks.length, 4);
  assert.ok(checks.every((check) => check.passed), JSON.stringify(checks));
  assert.equal(storage.objects.size, 0);
  const publicRequest = storage.requests.find((request) => request.url.includes("/object/public/"));
  assert.equal(publicRequest?.headers.get("apikey"), null);
});

test("detecta un bucket público", async () => {
  const storage = fakeStorage({ public: true });
  const checks = await verifyPrivateBucket({ ...baseConfig, fetch: storage.fakeFetch });

  assert.equal(checks.find((check) => check.name.includes("es privado"))?.passed, false);
  assert.equal(checks.find((check) => check.name.includes("URL pública"))?.passed, false);
  assert.equal(storage.objects.size, 0);
});
