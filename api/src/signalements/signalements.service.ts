import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  Acteur, Action, estFdo, formatMcg, peutCorriger, perimetreLecture, planAction, Refus, Statut,
  suiteParDefaut, UNITES, voitDeclarant, voitMainCourante,
} from '../domaine/regles'
import { PrismaService } from '../prisma.service'
import { CorrectionDto, FicheDto, NouveauSignalementDto } from './dto'

type Tx = Prisma.TransactionClient

@Injectable()
export class SignalementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public ─────────────────────────────────────────────────────────
  /** Fil public : validé, non clôturé, sans numéro de rue ni données du déclarant. */
  alertesPubliques() {
    return this.prisma.signalement.findMany({
      where: { statut: 'approved', clotureLe: null },
      select: { id: true, creeLe: true, rue: true, quartier: true, type: true, description: true, fdoKey: true },
      orderBy: { creeLe: 'desc' },
      take: 200,
    })
  }

  async soumettre(d: NouveauSignalementDto) {
    // Garde-fou global, en plus de la limite par adresse IP.
    const recents = await this.prisma.signalement.count({ where: { creeLe: { gt: new Date(Date.now() - 10 * 60_000) } } })
    if (recents >= 60) throw new Refus('trop_de_signalements', 409)
    const s = await this.prisma.signalement.create({
      data: {
        rue: d.rue, numero: d.numero || null, quartier: d.quartier, type: d.type, description: d.description,
        declarant: d.nom || d.contact ? { create: { nom: d.nom || null, contact: d.contact || null } } : undefined,
      },
      select: { id: true },
    })
    return { id: s.id }
  }

  // ── Espace sécurisé ────────────────────────────────────────────────
  async lister(a: Acteur) {
    const { quartier } = perimetreLecture(a)
    return this.prisma.signalement.findMany({
      where: quartier ? { quartier } : {},
      include: { declarant: voitDeclarant(a) },
      orderBy: { creeLe: 'desc' },
      take: 500,
    })
  }

  private async charger(tx: Tx, a: Acteur, id: number) {
    const s = await tx.signalement.findUnique({ where: { id } })
    if (!s) throw new Refus('introuvable', 404)
    const { quartier } = perimetreLecture(a)
    // ⛔ Hors périmètre : 403, jamais 404 (ne pas permettre d'énumérer les identifiants).
    if (quartier && s.quartier !== quartier) throw new Refus('hors_quartier')
    return s
  }

  async agir(a: Acteur, id: number, action: Action) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.charger(tx, a, id)
      const { patch, mainCourante } = planAction(a, { ...s, statut: s.statut as Statut }, action, new Date())
      // Écriture conditionnelle : si un autre agent a agi entre-temps, on refuse plutôt que d'écraser.
      const maj = await tx.signalement.updateMany({ where: { id, statut: s.statut, clotureLe: s.clotureLe }, data: patch })
      if (maj.count !== 1) throw new Refus('statut_invalide', 409)
      if (mainCourante) await this.inscrireMainCourante(tx, a, id, mainCourante)
      return { ok: true }
    })
  }

  private async inscrireMainCourante(tx: Tx, a: Acteur, signalementId: number, action: string) {
    const s = await tx.signalement.findUniqueOrThrow({ where: { id: signalementId }, include: { declarant: true } })
    const annee = new Date().getFullYear()
    const [{ dernier }] = await tx.$queryRaw<{ dernier: number }[]>`
      INSERT INTO mcg_compteurs (annee, dernier) VALUES (${annee}, 1)
      ON CONFLICT (annee) DO UPDATE SET dernier = mcg_compteurs.dernier + 1
      RETURNING dernier`
    await tx.mainCourante.create({
      data: {
        mcgNum: formatMcg(annee, dernier),
        dateFaits: s.creeLe,
        signalementId,
        quartier: s.quartier,
        type: s.type,
        lieu: [s.numero, s.rue].filter(Boolean).join(' '),
        resume: s.description.slice(0, 120),
        agent: a.nom,
        service: a.role,
        unite: UNITES[a.role] ?? a.role,
        declarant: [s.declarant?.nom, s.declarant?.contact].filter(Boolean).join(' · ') || null,
        action,
        suiteDonnee: suiteParDefaut(action),
        auteurId: a.id,
      },
    })
  }

  async corriger(a: Acteur, id: number, d: CorrectionDto) {
    if (!peutCorriger(a)) throw new Refus('non_autorise')
    return this.prisma.$transaction(async (tx) => {
      await this.charger(tx, a, id)
      const maj = await tx.signalement.updateMany({
        where: { id, statut: { in: ['pending', 'taken'] } },
        data: { rue: d.rue, quartier: d.quartier, type: d.type, description: d.description },
      })
      if (maj.count !== 1) throw new Refus('statut_invalide', 409)
      return { ok: true }
    })
  }

  async fiche(a: Acteur, id: number, d: FicheDto) {
    if (!estFdo(a.role)) throw new Refus('non_autorise')
    await this.prisma.signalement.update({
      where: { id },
      data: { plaque: d.plaque || null, nbTemoins: d.nbTemoins ?? null, suites: d.suites || null },
    })
    return { ok: true }
  }

  // ── Main courante ──────────────────────────────────────────────────
  mainCourante(a: Acteur) {
    if (!voitMainCourante(a)) throw new Refus('non_autorise')
    return this.prisma.mainCourante.findMany({ orderBy: { creeLe: 'desc' }, take: 1000 })
  }

  async majSuite(a: Acteur, id: number, suiteDonnee: string) {
    if (!voitMainCourante(a)) throw new Refus('non_autorise')
    await this.prisma.mainCourante.update({ where: { id }, data: { suiteDonnee } })
    return { ok: true }
  }
}
