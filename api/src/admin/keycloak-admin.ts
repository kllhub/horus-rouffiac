import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { Refus } from '../domaine/regles'

/**
 * Client de l'Admin API Keycloak, limité au realm `horus` (compte de service `horus-admin`,
 * grant client_credentials, droits realm-management minimaux : view-users, manage-users,
 * query-users, view-realm). Écrit en fetch brut, comme dans plateforme-commune : une poignée
 * de routes ne justifie pas une dépendance.
 */
const REALM_URL = process.env.KEYCLOAK_INTERNAL_URL ?? process.env.KEYCLOAK_ISSUER_URL ?? 'http://localhost:8080/realms/horus'
const ADMIN_URL = REALM_URL.replace(/\/realms\/([^/]+)\/?$/, '/admin/realms/$1')
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? 'horus-admin'
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ?? ''

export type KcUser = {
  id: string
  username: string
  email?: string
  enabled: boolean
  createdTimestamp?: number
  requiredActions?: string[]
  totp?: boolean
}

@Injectable()
export class KeycloakAdmin {
  private readonly log = new Logger('KeycloakAdmin')
  private jeton: { valeur: string; expire: number } | null = null

  private async token(): Promise<string> {
    if (!CLIENT_SECRET) throw new ServiceUnavailableException('admin_non_configure')
    if (this.jeton && this.jeton.expire > Date.now() + 10_000) return this.jeton.valeur
    const res = await fetch(`${REALM_URL}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    })
    if (!res.ok) {
      this.log.error(`jeton de service refusé (${res.status})`)
      throw new ServiceUnavailableException('admin_non_configure')
    }
    const j = (await res.json()) as { access_token: string; expires_in: number }
    this.jeton = { valeur: j.access_token, expire: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  private async appel<T = unknown>(methode: string, chemin: string, corps?: unknown): Promise<{ data: T; res: Response }> {
    const envoyer = async () =>
      fetch(`${ADMIN_URL}${chemin}`, {
        method: methode,
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      })
    let res = await envoyer()
    // Jeton de service périmé (rotation du secret ou des clés Keycloak) : on l'oublie et on réessaie une fois.
    if (res.status === 401) {
      this.jeton = null
      res = await envoyer()
    }
    if (res.status === 409) throw new Refus('email_existant', 409)
    if (res.status === 404) throw new Refus('introuvable', 404)
    if (!res.ok) {
      this.log.error(`${methode} ${chemin} → ${res.status} ${(await res.text()).slice(0, 200)}`)
      throw new ServiceUnavailableException('keycloak_erreur')
    }
    const texte = await res.text()
    return { data: (texte ? JSON.parse(texte) : null) as T, res }
  }

  async utilisateurs(): Promise<KcUser[]> {
    return (await this.appel<KcUser[]>('GET', '/users?max=1000&briefRepresentation=false')).data
  }

  async utilisateur(id: string): Promise<KcUser> {
    return (await this.appel<KcUser>('GET', `/users/${encodeURIComponent(id)}`)).data
  }

  async membresDuRole(role: string): Promise<{ id: string }[]> {
    return (await this.appel<{ id: string }[]>('GET', `/roles/${role}/users?max=1000&briefRepresentation=true`)).data
  }

  async creer(email: string, motDePasse: string, actions: string[]): Promise<string> {
    const { res } = await this.appel('POST', '/users', {
      username: email,
      email,
      enabled: true,
      emailVerified: true,
      requiredActions: actions,
      credentials: [{ type: 'password', value: motDePasse, temporary: true }],
    })
    const id = res.headers.get('location')?.split('/').pop()
    if (!id) throw new ServiceUnavailableException('keycloak_erreur')
    return id
  }

  async supprimer(id: string) {
    await this.appel('DELETE', `/users/${encodeURIComponent(id)}`)
  }

  async activer(id: string, enabled: boolean) {
    await this.appel('PUT', `/users/${encodeURIComponent(id)}`, { enabled })
  }

  async deconnecter(id: string) {
    await this.appel('POST', `/users/${encodeURIComponent(id)}/logout`)
  }

  async motDePasseProvisoire(id: string, valeur: string) {
    await this.appel('PUT', `/users/${encodeURIComponent(id)}/reset-password`, { type: 'password', value: valeur, temporary: true })
  }

  /** Remplace le rôle HORUS d'un compte (un seul rôle par compte). */
  async definirRole(id: string, role: string, tousLesRoles: readonly string[]) {
    const { data: actuels } = await this.appel<{ id: string; name: string }[]>(
      'GET', `/users/${encodeURIComponent(id)}/role-mappings/realm`,
    )
    const aRetirer = actuels.filter((r) => tousLesRoles.includes(r.name) && r.name !== role)
    if (aRetirer.length) await this.appel('DELETE', `/users/${encodeURIComponent(id)}/role-mappings/realm`, aRetirer)
    if (!actuels.some((r) => r.name === role)) {
      const { data: rep } = await this.appel<{ id: string; name: string }>('GET', `/roles/${role}`)
      await this.appel('POST', `/users/${encodeURIComponent(id)}/role-mappings/realm`, [rep])
    }
  }
}
