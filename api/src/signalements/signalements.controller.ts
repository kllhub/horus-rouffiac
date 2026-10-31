import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ActeurCourant, Public, Roles } from '../auth/auth'
import { Acteur } from '../domaine/regles'
import { ActionDto, CorrectionDto, FicheDto, NouveauSignalementDto, SuiteDto } from './dto'
import { SignalementsService } from './signalements.service'

@Controller()
export class SignalementsController {
  constructor(private readonly service: SignalementsService) {}

  // ── Public (habitants, sans compte) ────────────────────────────────
  @Public()
  @Get('public/alertes')
  alertes() {
    return this.service.alertesPubliques()
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/signalements')
  soumettre(@Body() d: NouveauSignalementDto) {
    return this.service.soumettre(d)
  }

  // ── Espace sécurisé ────────────────────────────────────────────────
  @Get('moi')
  moi(@ActeurCourant() a: Acteur) {
    return a
  }

  @Roles('referent', 'moderateur', 'gend', 'pn', 'pm', 'asvp')
  @Get('signalements')
  lister(@ActeurCourant() a: Acteur) {
    return this.service.lister(a)
  }

  @Roles('referent', 'moderateur', 'gend', 'pn', 'pm', 'asvp')
  @Post('signalements/:id/actions')
  agir(@ActeurCourant() a: Acteur, @Param('id', ParseIntPipe) id: number, @Body() d: ActionDto) {
    return this.service.agir(a, id, d.action)
  }

  @Roles('moderateur', 'gend', 'pn', 'pm', 'asvp')
  @Patch('signalements/:id')
  corriger(@ActeurCourant() a: Acteur, @Param('id', ParseIntPipe) id: number, @Body() d: CorrectionDto) {
    return this.service.corriger(a, id, d)
  }

  @Roles('gend', 'pn', 'pm', 'asvp')
  @Patch('signalements/:id/fiche')
  fiche(@ActeurCourant() a: Acteur, @Param('id', ParseIntPipe) id: number, @Body() d: FicheDto) {
    return this.service.fiche(a, id, d)
  }

  @Roles('gend', 'pn', 'pm', 'asvp')
  @Get('main-courante')
  mainCourante(@ActeurCourant() a: Acteur) {
    return this.service.mainCourante(a)
  }

  @Roles('gend', 'pn', 'pm', 'asvp')
  @Patch('main-courante/:id')
  majSuite(@ActeurCourant() a: Acteur, @Param('id', ParseIntPipe) id: number, @Body() d: SuiteDto) {
    return this.service.majSuite(a, id, d.suiteDonnee)
  }
}
