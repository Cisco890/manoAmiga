export type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  anonKey?: string;
  fetch?: typeof fetch;
};

export type StorageCheck = { name: string; passed: boolean; detail: string };

// Fotografías de alumnos y documentos generados (fichas, carnés y formularios).
export const privateBucketSettings = {
  public: false,
  file_size_limit: 10 * 1024 * 1024,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

type BucketInfo = { id: string; public: boolean };

function storageUrl(config: SupabaseStorageConfig, path: string) {
  return `${config.url.replace(/\/+$/, "")}/storage/v1${path}`;
}

function serviceHeaders(config: SupabaseStorageConfig, extra: Record<string, string> = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...extra,
  };
}

async function errorMessage(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // Se conserva el texto original.
  }
  return text || response.statusText;
}

async function getBucket(config: SupabaseStorageConfig): Promise<BucketInfo | null> {
  const request = config.fetch ?? fetch;
  const response = await request(storageUrl(config, `/bucket/${encodeURIComponent(config.bucket)}`), {
    headers: serviceHeaders(config),
  });
  if (response.ok) return (await response.json()) as BucketInfo;

  const message = await errorMessage(response);
  // Storage responde 404, o 400 con "Bucket not found" según la versión.
  if (response.status === 404 || /not found/i.test(message)) return null;
  throw new Error(`No se pudo consultar el bucket (${response.status}): ${message}`);
}

/** Crea el bucket privado o corrige su configuración si ya existe. */
export async function ensurePrivateBucket(config: SupabaseStorageConfig) {
  const request = config.fetch ?? fetch;
  const existing = await getBucket(config);
  const response = existing
    ? await request(storageUrl(config, `/bucket/${encodeURIComponent(config.bucket)}`), {
        method: "PUT",
        headers: serviceHeaders(config, { "Content-Type": "application/json" }),
        body: JSON.stringify(privateBucketSettings),
      })
    : await request(storageUrl(config, "/bucket"), {
        method: "POST",
        headers: serviceHeaders(config, { "Content-Type": "application/json" }),
        body: JSON.stringify({ id: config.bucket, name: config.bucket, ...privateBucketSettings }),
      });
  if (!response.ok) {
    throw new Error(
      `No se pudo ${existing ? "actualizar" : "crear"} el bucket (${response.status}): ${await errorMessage(response)}`,
    );
  }
  return { created: !existing, wasPublic: existing?.public ?? false };
}

/**
 * Sube un archivo de prueba y confirma que no puede descargarse por URL pública ni con la
 * clave anónima. El archivo se elimina al terminar.
 */
export async function verifyPrivateBucket(config: SupabaseStorageConfig): Promise<StorageCheck[]> {
  const request = config.fetch ?? fetch;
  const checks: StorageCheck[] = [];
  const bucket = await getBucket(config);
  checks.push({
    name: "El bucket existe y es privado",
    passed: bucket !== null && bucket.public === false,
    detail: bucket ? `public=${bucket.public}` : "el bucket no existe",
  });
  if (!bucket) return checks;

  const objectPath = `_verificacion/${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;
  const encodedBucket = encodeURIComponent(config.bucket);
  const upload = await request(storageUrl(config, `/object/${encodedBucket}/${objectPath}`), {
    method: "POST",
    headers: serviceHeaders(config, { "Content-Type": "application/pdf", "x-upsert": "true" }),
    body: "%PDF-1.4\n% verificacion de acceso privado\n",
  });
  if (!upload.ok) {
    checks.push({
      name: "El backend puede subir archivos",
      passed: false,
      detail: `${upload.status}: ${await errorMessage(upload)}`,
    });
    return checks;
  }
  checks.push({ name: "El backend puede subir archivos", passed: true, detail: `${upload.status}` });

  try {
    const publicResponse = await request(
      storageUrl(config, `/object/public/${encodedBucket}/${objectPath}`),
    );
    await publicResponse.body?.cancel();
    checks.push({
      name: "La URL pública no entrega el archivo",
      passed: !publicResponse.ok,
      detail: `${publicResponse.status}`,
    });

    if (config.anonKey) {
      const anonResponse = await request(
        storageUrl(config, `/object/authenticated/${encodedBucket}/${objectPath}`),
        { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } },
      );
      await anonResponse.body?.cancel();
      checks.push({
        name: "La clave anónima no puede descargar el archivo",
        passed: !anonResponse.ok,
        detail: `${anonResponse.status}`,
      });
    }
  } finally {
    const removal = await request(storageUrl(config, `/object/${encodedBucket}`), {
      method: "DELETE",
      headers: serviceHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [objectPath] }),
    });
    await removal.body?.cancel();
  }
  return checks;
}
