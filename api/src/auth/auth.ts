import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Acteur, Role, ROLES } from '../domaine/regles'
import { PrismaService } from '../prisma.service'

/**
 * ⛔ DEUX URLs, parce qu'il y a deux points de vue (même règle que plateforme-commune) :
 * - KEYCLOAK_ISSUER_URL : ce que joint le NAVIGATEUR, donc l'`iss` du jeton → ce qu'on valide ;
 * - KEYCLOAK_INTERNAL_URL : ce que joint le SERVEUR pour les clés (JWKS).
 */
const ISSUER = process.env.KEYCLOAK_ISSUER_URL ?? 'http://localhost:8080/realms/horus'
const INTERNE = process.env.KEYCLOAK_INTERNAL_URL ?? ISSUER
const CLIENT = process.env.KEYCLOAK_CLIENT_ID ?? 'horus-pwa'
const JWKS = createRemoteJWKSet(new URL(`${INTERNE}/protocol/openid-connect/certs`))

/** ⛔ La seule échappatoire, et elle est ÉCRITE : une route sans rien est protégée. */
export const PUBLIC = 'horus:public'
export const Public = () => SetMetadata(PUBLIC, true)

/** Rôles admis sur une route. Absent = tout acteur authentifié et actif. */
export const ROLES_KEY = 'horus:roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

/** L'acteur courant, posé par le garde. */
export const ActeurCourant = createParamDecorator((_: unknown, ctx: ExecutionContext): Acteur => {
  return ctx.switchToHttp().getRequest().acteur
})

// Miroir JIT : au plus une écriture par compte et par fenêtre.
const JIT_TTL_MS = 5 * 60_000
const vus = new Map<string, number>()

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, cibles)) return true

    const req = ctx.switchToHttp().getRequest()
    const header: string = req.headers['authorization'] ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('jeton_manquant')

    let payload: Record<string, unknown>
    try {
      ;({ payload } = await jwtVerify(token, JWKS, { issuer: ISSUER }))
    } catch {
      throw new UnauthorizedException('jeton_invalide')
    }
    // Le jeton doit avoir été émis pour la PWA HORUS, pas pour un autre client du realm.
    if (payload.azp !== CLIENT) throw new UnauthorizedException('jeton_invalide')

    const sub = String(payload.sub)
    const tokenRoles = ((payload.realm_access as { roles?: string[] })?.roles ?? []).filter((r) =>
      (ROLES as readonly string[]).includes(r),
    ) as Role[]
    // Un compte HORUS a exactement un rôle : l'écran d'administration le garantit.
    if (tokenRoles.length !== 1) throw new ForbiddenException(tokenRoles.length ? 'roles_multiples' : 'sans_role')
    const role = tokenRoles[0]

    const email = payload.email as string | undefined
    const nomJeton = (payload.name as string | undefined) || (payload.preferred_username as string) || 'Compte HORUS'
    const maintenant = Date.now()
    let membre = await this.prisma.membre.findUnique({ where: { id: sub } })
    if (!membre || (vus.get(sub) ?? 0) < maintenant - JIT_TTL_MS) {
      membre = await this.prisma.membre.upsert({
        where: { id: sub },
        create: { id: sub, email, nom: nomJeton.slice(0, 80), derniereConnexion: new Date() },
        update: { email, derniereConnexion: new Date() },
      })
      vus.set(sub, maintenant)
    }
    // ⛔ Désactivation immédiate : on n'attend pas l'expiration du jeton (5 min).
    if (!membre.actif) throw new ForbiddenException('compte_desactive')

    const acteur: Acteur = { id: sub, role, nom: membre.nom, quartier: membre.quartier }
    req.acteur = acteur

    const admis = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, cibles)
    if (admis && !admis.includes(role)) throw new ForbiddenException('non_autorise')
    return true
  }
}
