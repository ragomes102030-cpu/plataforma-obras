-- Executar EXCLUSIVAMENTE no Supabase após migração 0021, como owner.
-- A tabela já foi provisionada no projeto Aurora e esta política foi verificada.
ALTER TABLE "lob_activity_locations" ENABLE ROW LEVEL SECURITY;
-- O backend usa o papel SQL arquimedes_app; nenhum cliente anon/authenticated
-- acessa parcelas diretamente pela Data API (RLS sem políticas para eles).
REVOKE ALL ON TABLE public."lob_activity_locations" FROM anon,authenticated,PUBLIC;

REVOKE ALL ON SEQUENCE public."lob_activity_locations_id_seq" FROM anon,authenticated,PUBLIC;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public."lob_activity_locations" TO arquimedes_app;

GRANT USAGE,SELECT ON SEQUENCE public."lob_activity_locations_id_seq" TO arquimedes_app;

DROP POLICY IF EXISTS "lob_backend_guard" ON public."lob_activity_locations";

CREATE POLICY "lob_backend_guard" ON public."lob_activity_locations"
  FOR ALL TO arquimedes_app USING (true) WITH CHECK (true);

