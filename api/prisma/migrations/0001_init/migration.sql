-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "membres" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "nom" TEXT NOT NULL,
    "quartier" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "derniere_connexion" TIMESTAMPTZ,
    "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signalements" (
    "id" SERIAL NOT NULL,
    "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rue" TEXT NOT NULL,
    "numero" TEXT,
    "quartier" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'pending',
    "fdo_key" TEXT,
    "fdo_nom" TEXT,
    "traite_par" TEXT,
    "cloture_le" TIMESTAMPTZ,
    "plaque" TEXT,
    "nb_temoins" INTEGER,
    "suites" TEXT,

    CONSTRAINT "signalements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declarants" (
    "signalement_id" INTEGER NOT NULL,
    "nom" TEXT,
    "contact" TEXT,

    CONSTRAINT "declarants_pkey" PRIMARY KEY ("signalement_id")
);

-- CreateTable
CREATE TABLE "mcg_compteurs" (
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL,

    CONSTRAINT "mcg_compteurs_pkey" PRIMARY KEY ("annee")
);

-- CreateTable
CREATE TABLE "main_courante" (
    "id" SERIAL NOT NULL,
    "mcg_num" TEXT NOT NULL,
    "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_faits" TIMESTAMPTZ NOT NULL,
    "signalement_id" INTEGER,
    "quartier" TEXT,
    "type" TEXT,
    "lieu" TEXT,
    "resume" TEXT,
    "agent" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "declarant" TEXT,
    "action" TEXT NOT NULL,
    "suite_donnee" TEXT NOT NULL DEFAULT 'En cours',
    "auteur" TEXT,

    CONSTRAINT "main_courante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quartier" TEXT NOT NULL,
    "auteur" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "auteur_nom" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "lu_fdo" BOOLEAN NOT NULL DEFAULT false,
    "lu_ref" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_journal" (
    "id" SERIAL NOT NULL,
    "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_id" TEXT,
    "admin_nom" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "admin_journal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signalements_statut_cree_le_idx" ON "signalements"("statut", "cree_le" DESC);

-- CreateIndex
CREATE INDEX "signalements_quartier_idx" ON "signalements"("quartier");

-- CreateIndex
CREATE UNIQUE INDEX "main_courante_mcg_num_key" ON "main_courante"("mcg_num");

-- CreateIndex
CREATE INDEX "main_courante_cree_le_idx" ON "main_courante"("cree_le" DESC);

-- CreateIndex
CREATE INDEX "messages_quartier_cree_le_idx" ON "messages"("quartier", "cree_le");

-- CreateIndex
CREATE INDEX "admin_journal_cree_le_idx" ON "admin_journal"("cree_le" DESC);

-- AddForeignKey
ALTER TABLE "signalements" ADD CONSTRAINT "signalements_traite_par_fkey" FOREIGN KEY ("traite_par") REFERENCES "membres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarants" ADD CONSTRAINT "declarants_signalement_id_fkey" FOREIGN KEY ("signalement_id") REFERENCES "signalements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "main_courante" ADD CONSTRAINT "main_courante_signalement_id_fkey" FOREIGN KEY ("signalement_id") REFERENCES "signalements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "main_courante" ADD CONSTRAINT "main_courante_auteur_fkey" FOREIGN KEY ("auteur") REFERENCES "membres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_auteur_fkey" FOREIGN KEY ("auteur") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

