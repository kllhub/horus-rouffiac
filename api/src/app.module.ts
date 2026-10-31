import {
  ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Logger, Module,
} from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerException, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { Prisma } from '@prisma/client'
import { Response } from 'express'
import { AdminController, AdminService } from './admin/admin'
import { KeycloakAdmin } from './admin/keycloak-admin'
import { AuthGuard, Public } from './auth/auth'
import { Refus } from './domaine/regles'
import { IaController, IaService } from './ia/ia'
import { MessagesController, MessagesService } from './messages/messages'
import { PrismaService } from './prisma.service'
import { SignalementsController } from './signalements/signalements.controller'
import { SignalementsService } from './signalements/signalements.service'

@Controller()
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** La seule route publique sans données : sert aux sondes et au déploiement. */
  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', service: 'horus-api', ts: new Date().toISOString() }
  }
}

/** Traduit les refus métier et les erreurs de base en réponses HTTP aux codes stables. */
@Catch()
class Erreurs implements ExceptionFilter {
  private readonly log = new Logger('Erreurs')

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (e instanceof Refus) return res.status(e.statut).json({ error: e.code })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return res.status(404).json({ error: 'introuvable' })
    }
    if (e instanceof ThrottlerException) return res.status(429).json({ error: 'trop_de_requetes' })
    if (e instanceof HttpException) {
      const r = e.getResponse()
      const code = typeof r === 'string' ? r : ((r as { message?: unknown }).message ?? e.message)
      return res.status(e.getStatus()).json({ error: Array.isArray(code) ? 'requete_invalide' : code, details: Array.isArray(code) ? code : undefined })
    }
    this.log.error(e instanceof Error ? e.stack : String(e))
    return res.status(500).json({ error: 'erreur_interne' })
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [HealthController, SignalementsController, MessagesController, IaController, AdminController],
  providers: [
    PrismaService, SignalementsService, MessagesService, IaService, AdminService, KeycloakAdmin,
    // ⛔ L'ORDRE est l'ordre d'exécution : débit d'abord, puis authentification.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: Erreurs },
  ],
})
export class AppModule {}
