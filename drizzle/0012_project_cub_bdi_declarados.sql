-- R6-02: CUB declarado e BDI declarado como dado proprio da obra.
--
-- O CUB e o BDI sao parametros de custo que o engenheiro DECLARA na obra
-- (projects) — o sistema nao os inventa. Antes desta migration a regra 6
-- comparava o custo direto por m2 com um piso fixo de R$ 2.500/m2 * 0,6,
-- sem lastro; e a regra 4 nao tinha como saber o BDI da obra.
--
-- Os tres campos do CUB juntos SAO a declaracao (valor + UF + mes); valor sem
-- UF/mes nao e referencia. Sempre nullable: nao declarar e um estado valido
-- (a regra 6 nao roda e a cobertura nomeia o motivo).
ALTER TABLE "projects"
ADD COLUMN "cubValor" numeric(12, 2);

--> statement-breakpoint
ALTER TABLE "projects"
ADD COLUMN "cubUf" varchar(2);

--> statement-breakpoint
ALTER TABLE "projects"
ADD COLUMN "cubMes" varchar(7);

--> statement-breakpoint
ALTER TABLE "projects"
ADD COLUMN "bdiDeclarado" numeric(8, 6);
