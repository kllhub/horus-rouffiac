/**
 * HORUS — règles métier PURES (aucune entrée-sortie).
 *
 * La grille des rôles est écrite ICI et nulle part ailleurs ; les services l'appliquent à
 * chaque lecture et chaque écriture. Le front n'en montre qu'un reflet : *un bouton caché
 * n'interdit rien, une requête forgée passe à côté.*
 *
 *   rôle        lire               valider/rejeter  prise en charge  clôturer       corriger/fiche  main courante  déclarant
 *   referent    son quartier       son quartier     —                son quartier   —               —              —
 *   moderateur  tout               ✓                —                ✓              ✓               —              —
 *   gend / pn   tout               ✓                ✓                ✓              ✓               ✓              ✓
 *   pm          tout               ✓                ✓                ✓              ✓               ✓              ✓
 *   asvp        tout               ✓                ✓                —              ✓               ✓              ✓
 *   admin       — (gère uniquement les comptes)
 */

export const QUARTIERS = ['Centre-Bourg', 'Louradou', 'Castelviel', 'Charlary', 'Tartaloche', 'Pigassou'] as const
export const ROLES = ['admin', 'referent', 'moderateur', 'gend', 'pn', 'pm', 'asvp'] as const
export const ROLES_FDO = ['gend', 'pn', 'pm', 'asvp'] as const
export const SUITES = ['En cours', 'Patrouille effectuée', 'Transmis au procureur', 'Classé sans suite'] as const

export type Role = (typeof ROLES)[number]
export type Action = 'take' | 'validate' | 'reject' | 'resolve'
export type Statut = 'pending' | 'taken' | 'approved' | 'rejected'

export const UNITES: Record<string, string> = {
  gend: 'Gendarmerie Nationale',
  pn: 'Police Nationale',
  pm: 'Police Municipale',
  asvp: 'ASVP',
}

/** L'utilisateur tel que l'API le connaît : rôle (Keycloak) + fiche membre (base). */
export type Acteur = { id: string; role: Role; nom: string; quartier: string | null }

export const estFdo = (role: string): boolean => (ROLES_FDO as readonly string[]).includes(role)

/** Un refus métier, traduit en 403/409 par l'API. Le code est stable, le front le traduit. */
export class Refus extends Error {
  constructor(
    public readonly code: string,
    public readonly statut: 403 | 404 | 409 | 422 = 403,
  ) {
    super(code)
  }
}

/** Quels signalements un acteur peut-il lire ? `null` = tous ; sinon le quartier imposé. */
export function perimetreLecture(a: Acteur): { quartier: string | null } {
  if (estFdo(a.role) || a.role === 'moderateur') return { quartier: null }
  if (a.role === 'referent' && a.quartier) return { quartier: a.quartier }
  throw new Refus('non_autorise')
}

export const voitDeclarant = (a: Acteur): boolean => estFdo(a.role)
export const voitMainCourante = (a: Acteur): boolean => estFdo(a.role)

/**
 * Applique une action à un signalement : renvoie la modification à écrire et, si l'acteur
 * est une force de l'ordre, le libellé à porter en main courante.
 */
export function planAction(
  a: Acteur,
  s: { statut: Statut; quartier: string; clotureLe: Date | null; fdoKey: string | null; fdoNom: string | null },
  action: Action,
  maintenant: Date,
): { patch: Record<string, unknown>; mainCourante: string | null } {
  const fdo = estFdo(a.role)
  perimetreLecture(a) // refuse admin et référent sans quartier
  if (a.role === 'referent' && s.quartier !== a.quartier) throw new Refus('hors_quartier')

  let patch: Record<string, unknown>
  let libelle: string
  switch (action) {
    case 'take':
      if (!fdo) throw new Refus('non_autorise')
      if (s.statut !== 'pending') throw new Refus('statut_invalide', 409)
      patch = { statut: 'taken', fdoKey: a.role, fdoNom: a.nom, traiteParId: a.id }
      libelle = 'Pris en charge'
      break
    case 'validate':
    case 'reject':
      if (s.statut !== 'pending' && s.statut !== 'taken') throw new Refus('statut_invalide', 409)
      patch = {
        statut: action === 'validate' ? 'approved' : 'rejected',
        fdoKey: fdo ? a.role : s.fdoKey,
        fdoNom: fdo ? a.nom : s.fdoNom,
        traiteParId: a.id,
      }
      libelle = action === 'validate' ? 'Validé' : 'Rejeté'
      break
    case 'resolve':
      if (a.role === 'asvp') throw new Refus('non_autorise')
      if (s.statut !== 'approved' || s.clotureLe) throw new Refus('statut_invalide', 409)
      patch = { clotureLe: maintenant }
      libelle = 'Clôturé'
      break
    default:
      throw new Refus('action_inconnue', 422)
  }
  return { patch, mainCourante: fdo ? libelle : null }
}

export function peutCorriger(a: Acteur): boolean {
  return estFdo(a.role) || a.role === 'moderateur'
}

/** Messagerie : un référent écrit dans SON quartier, une FDO dans tous. */
export function peutEcrire(a: Acteur, quartier: string): boolean {
  if (estFdo(a.role)) return true
  return a.role === 'referent' && a.quartier === quartier
}

export function quartiersMessagerie(a: Acteur): readonly string[] {
  if (estFdo(a.role)) return QUARTIERS
  if (a.role === 'referent' && a.quartier) return [a.quartier]
  return []
}

/** Numéro de main courante au format MCG / NMCI. */
export const formatMcg = (annee: number, n: number): string => `MCG-${annee}-${String(n).padStart(5, '0')}`

/** Suite donnée par défaut d'une nouvelle entrée. */
export const suiteParDefaut = (libelle: string): string => (libelle === 'Clôturé' ? 'Classé sans suite' : 'En cours')
