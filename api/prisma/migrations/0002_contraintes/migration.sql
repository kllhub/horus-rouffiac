-- Contraintes métier que Prisma ne sait pas exprimer : la base refuse une valeur
-- hors référentiel même si l'API venait à l'oublier.

ALTER TABLE "membres"
  ADD CONSTRAINT "membres_quartier_ck" CHECK ("quartier" IS NULL OR "quartier" IN ('Centre-Bourg','Louradou','Castelviel','Charlary','Tartaloche','Pigassou')),
  ADD CONSTRAINT "membres_nom_ck" CHECK (char_length("nom") BETWEEN 2 AND 80);

ALTER TABLE "signalements"
  ADD CONSTRAINT "signalements_statut_ck"   CHECK ("statut" IN ('pending','taken','approved','rejected')),
  ADD CONSTRAINT "signalements_quartier_ck" CHECK ("quartier" IN ('Centre-Bourg','Louradou','Castelviel','Charlary','Tartaloche','Pigassou')),
  ADD CONSTRAINT "signalements_fdo_ck"      CHECK ("fdo_key" IS NULL OR "fdo_key" IN ('gend','pn','pm','asvp')),
  ADD CONSTRAINT "signalements_rue_ck"      CHECK (char_length("rue") BETWEEN 2 AND 200),
  ADD CONSTRAINT "signalements_numero_ck"   CHECK ("numero" IS NULL OR char_length("numero") <= 10),
  ADD CONSTRAINT "signalements_type_ck"     CHECK (char_length("type") BETWEEN 2 AND 60),
  ADD CONSTRAINT "signalements_desc_ck"     CHECK (char_length("description") BETWEEN 5 AND 2000),
  ADD CONSTRAINT "signalements_plaque_ck"   CHECK ("plaque" IS NULL OR char_length("plaque") <= 20),
  ADD CONSTRAINT "signalements_temoins_ck"  CHECK ("nb_temoins" IS NULL OR "nb_temoins" BETWEEN 0 AND 999),
  ADD CONSTRAINT "signalements_suites_ck"   CHECK ("suites" IS NULL OR char_length("suites") <= 200);

ALTER TABLE "declarants"
  ADD CONSTRAINT "declarants_nom_ck"     CHECK ("nom" IS NULL OR char_length("nom") <= 80),
  ADD CONSTRAINT "declarants_contact_ck" CHECK ("contact" IS NULL OR char_length("contact") <= 120);

ALTER TABLE "main_courante"
  ADD CONSTRAINT "main_courante_suite_ck" CHECK ("suite_donnee" IN ('En cours','Patrouille effectuée','Transmis au procureur','Classé sans suite'));

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_quartier_ck" CHECK ("quartier" IN ('Centre-Bourg','Louradou','Castelviel','Charlary','Tartaloche','Pigassou')),
  ADD CONSTRAINT "messages_role_ck"     CHECK ("role" IN ('referent','gend','pn','pm','asvp')),
  ADD CONSTRAINT "messages_contenu_ck"  CHECK (char_length("contenu") BETWEEN 1 AND 2000);
