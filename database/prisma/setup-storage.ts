import "dotenv/config";
import { ensurePrivateBucket, verifyPrivateBucket } from "../src/storage/supabase-storage";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "crm-privado";
const anonKey = process.env.SUPABASE_ANON_KEY || undefined;

if (!url) throw new Error("SUPABASE_URL es obligatoria");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY es obligatoria");

const config = { url, serviceRoleKey, bucket, anonKey };

async function main() {
  const result = await ensurePrivateBucket(config);
  if (result.created) console.info(`Bucket privado "${bucket}" creado`);
  else if (result.wasPublic) console.warn(`El bucket "${bucket}" era público; se cambió a privado`);
  else console.info(`Bucket privado "${bucket}" actualizado`);

  const checks = await verifyPrivateBucket(config);
  for (const check of checks) {
    console.info(`${check.passed ? "✔" : "✘"} ${check.name} (${check.detail})`);
  }
  if (!anonKey) {
    console.info("Defina SUPABASE_ANON_KEY para comprobar también el acceso con la clave anónima.");
  }
  if (checks.some((check) => !check.passed)) {
    throw new Error("El bucket no cumple las condiciones de acceso privado");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
