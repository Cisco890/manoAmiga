-- Supabase publica el esquema public mediante su API REST (roles anon y authenticated).
-- El CRM solo accede a los datos a través de la API propia, por lo que se activa RLS sin
-- políticas: cualquier consulta directa desde esos roles queda denegada.
-- La API se conecta como propietaria de las tablas y no se ve afectada por RLS.
-- Las tablas creadas en migraciones posteriores deben incluir su propio ENABLE ROW LEVEL SECURITY.
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
  END LOOP;
END
$$;
