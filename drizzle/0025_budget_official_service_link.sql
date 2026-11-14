ALTER TABLE "budget_items"
  ADD COLUMN IF NOT EXISTS "officialPriceItemId" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_items"
    ADD CONSTRAINT "budget_items_officialPriceItemId_price_items_id_fk"
    FOREIGN KEY ("officialPriceItemId") REFERENCES "public"."price_items"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_items_official_price_item_idx"
  ON "budget_items" USING btree ("officialPriceItemId");
