import { Body, Controller, Get, Injectable, Param, Patch, Post } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { Transform } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, IsString, Length, MaxLength, ValidateIf } from 'class-validator'
import { ActeurCourant, Roles } from '../auth/auth'
import { Acteur, QUARTIERS, Refus, Role, ROLES } from '../domaine/regles'
import { PrismaService } from '../prisma.service'
import { KeycloakAdmin } from './keycloak-admin'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

class ProfilDto {
  @Transform(trim) @IsString() @Length(2, 80) nom!: string
  @IsIn(ROLES) role!: Role
  @ValidateIf((o) => o.role === 'referent') @IsIn(QUARTIERS) quartier?: string | null
}
class CreationDto extends ProfilDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail() @MaxLength(120) email!: string
}
class ActifDto {
  @IsBoolean() actif!: boolean
}

/** Mot de passe provisoire : Keycloak impose son changement à la première connexion. */
const provisoire = () => randomBytes(12).toString('base64url').slice(0, 16)

/**
 * Deuxième facteur exigé à la première connexion pour tous les comptes HORUS : ils donnent
 * accès à des signalements nominatifs et à la main courante.
 */
const ACTIONS_INITIALES = ['CONFIGURE_TOTP']

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kc: KeycloakAdmin,
  ) {}

  private async journal(me: Acteur, action: string, cible: string, details: object = {}) {
    await this.prisma.adminJournal.create({ data: { adminId: me.id, adminNom: me.nom, action, cible, details } })
  }

  private async roleDe(id: string): Promise<Role | null> {
    for (const r of ROLES) if ((await this.kc.membresDuRole(r)).some((u) => u.id === id)) return r
    return null
  }

  /** ⛔ Ne jamais laisser HORUS sans administrateur actif. */
  private async verifierDernierAdmin(id: string, resteAdminActif: boolean) {
    if (resteAdminActif) return
    const admins = await this.kc.membresDuRole('admin')
    if (!admins.some((u) => u.id === id)) return
    const actifs = await this.prisma.membre.count({ where: { id: { in: admins.map((u) => u.id) }, actif: true } })
    if (actifs <= 1) throw new Refus('dernier_admin', 409)
  }

  async lister() {
    const [users, membres, ...parRole] = await Promise.all([
      this.kc.utilisateurs(),
      this.prisma.membre.findMany(),
      ...ROLES.map((r) => this.kc.membresDuRole(r)),
    ])
    const role = new Map<string, Role>()
    ROLES.forEach((r, i) => parRole[i].forEach((u) => role.set(u.id, r)))
    const fiche = new Map(membres.map((m) => [m.id, m]))
    return users.map((u) => {
      const m = fiche.get(u.id)
      return {
        id: u.id,
        email: u.email ?? u.username,
        nom: m?.nom ?? u.username,
        role: role.get(u.id) ?? null,
        quartier: m?.quartier ?? null,
        actif: u.enabled && (m?.actif ?? true),
        derniereConnexion: m?.derniereConnexion ?? null,
        deuxiemeFacteur: !!u.totp,
        enAttente: u.requiredActions ?? [],
      }
    })
  }

  async creer(me: Acteur, d: CreationDto) {
    const motDePasse = provisoire()
    const id = await this.kc.creer(d.email, motDePasse, ACTIONS_INITIALES)
    try {
      await this.kc.definirRole(id, d.role, ROLES)
      await this.prisma.membre.create({
        data: { id, email: d.email, nom: d.nom, quartier: d.role === 'referent' ? d.quartier! : null },
      })
    } catch (e) {
      await this.kc.supprimer(id).catch(() => undefined) // pas de compte à moitié créé
      throw e
    }
    await this.journal(me, 'création', d.email, { nom: d.nom, role: d.role, quartier: d.quartier ?? null })
    return { id, email: d.email, motDePasse }
  }

  async modifier(me: Acteur, id: string, d: ProfilDto) {
    if (id === me.id && d.role !== 'admin') throw new Refus('pas_soi_meme', 409)
    const u = await this.kc.utilisateur(id)
    const avant = await this.prisma.membre.findUnique({ where: { id } })
    await this.verifierDernierAdmin(id, d.role === 'admin')
    const ancienRole = await this.roleDe(id)
    await this.kc.definirRole(id, d.role, ROLES)
    const quartier = d.role === 'referent' ? d.quartier! : null
    await this.prisma.membre.upsert({
      where: { id },
      create: { id, email: u.email, nom: d.nom, quartier },
      update: { nom: d.nom, quartier },
    })
    // Un changement de rôle doit prendre effet tout de suite : on coupe les sessions.
    if (ancienRole !== d.role) await this.kc.deconnecter(id)
    await this.journal(me, 'modification', u.email ?? u.username, {
      avant: { nom: avant?.nom, role: ancienRole, quartier: avant?.quartier },
      apres: { nom: d.nom, role: d.role, quartier },
    })
    return { ok: true }
  }

  async activer(me: Acteur, id: string, actif: boolean) {
    if (id === me.id) throw new Refus('pas_soi_meme', 409)
    const u = await this.kc.utilisateur(id)
    await this.verifierDernierAdmin(id, actif)
    await this.kc.activer(id, actif)
    if (!actif) await this.kc.deconnecter(id)
    await this.prisma.membre.upsert({
      where: { id },
      create: { id, email: u.email, nom: u.username, actif },
      update: { actif },
    })
    await this.journal(me, actif ? 'réactivation' : 'désactivation', u.email ?? u.username)
    return { ok: true }
  }

  async reinitialiser(me: Acteur, id: string) {
    const u = await this.kc.utilisateur(id)
    const motDePasse = provisoire()
    await this.kc.motDePasseProvisoire(id, motDePasse)
    await this.kc.deconnecter(id)
    await this.journal(me, 'réinitialisation du mot de passe', u.email ?? u.username)
    return { motDePasse }
  }

  journalRecent() {
    return this.prisma.adminJournal.findMany({ orderBy: { creeLe: 'desc' }, take: 200 })
  }
}

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('comptes')
  lister() {
    return this.service.lister()
  }

  @Post('comptes')
  creer(@ActeurCourant() me: Acteur, @Body() d: CreationDto) {
    return this.service.creer(me, d)
  }

  @Patch('comptes/:id')
  modifier(@ActeurCourant() me: Acteur, @Param('id') id: string, @Body() d: ProfilDto) {
    return this.service.modifier(me, id, d)
  }

  @Post('comptes/:id/actif')
  activer(@ActeurCourant() me: Acteur, @Param('id') id: string, @Body() d: ActifDto) {
    return this.service.activer(me, id, d.actif)
  }

  @Post('comptes/:id/mot-de-passe')
  reinitialiser(@ActeurCourant() me: Acteur, @Param('id') id: string) {
    return this.service.reinitialiser(me, id)
  }

  @Get('journal')
  journal() {
    return this.service.journalRecent()
  }
}
