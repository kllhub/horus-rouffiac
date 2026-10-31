import { Body, Controller, Get, Injectable, Post } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsIn, IsString, Length } from 'class-validator'
import { ActeurCourant, Roles } from '../auth/auth'
import { Acteur, estFdo, peutEcrire, QUARTIERS, quartiersMessagerie, Refus } from '../domaine/regles'
import { PrismaService } from '../prisma.service'

class EnvoiDto {
  @IsIn(QUARTIERS) quartier!: string
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @Length(1, 2000) contenu!: string
}
class LusDto {
  @IsIn(QUARTIERS) quartier!: string
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  lister(a: Acteur) {
    return this.prisma.message.findMany({
      where: { quartier: { in: [...quartiersMessagerie(a)] } },
      orderBy: { creeLe: 'asc' },
      take: 2000,
      select: { id: true, creeLe: true, quartier: true, role: true, auteurNom: true, contenu: true, luFdo: true, luRef: true },
    })
  }

  async envoyer(a: Acteur, quartier: string, contenu: string) {
    if (!peutEcrire(a, quartier)) throw new Refus(a.role === 'referent' ? 'hors_quartier' : 'non_autorise')
    const fdo = estFdo(a.role)
    await this.prisma.message.create({
      data: { quartier, auteurId: a.id, role: a.role, auteurNom: a.nom, contenu, luFdo: fdo, luRef: !fdo },
    })
    return { ok: true }
  }

  /** Marque un fil lu « de mon côté » : les FDO lisent les référents, et inversement. */
  async marquerLus(a: Acteur, quartier: string) {
    if (!quartiersMessagerie(a).includes(quartier)) throw new Refus('non_autorise')
    if (estFdo(a.role)) await this.prisma.message.updateMany({ where: { quartier, luFdo: false }, data: { luFdo: true } })
    else await this.prisma.message.updateMany({ where: { quartier, luRef: false }, data: { luRef: true } })
    return { ok: true }
  }
}

@Roles('referent', 'gend', 'pn', 'pm', 'asvp')
@Controller('messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get()
  lister(@ActeurCourant() a: Acteur) {
    return this.service.lister(a)
  }

  @Post()
  envoyer(@ActeurCourant() a: Acteur, @Body() d: EnvoiDto) {
    return this.service.envoyer(a, d.quartier, d.contenu)
  }

  @Post('lus')
  lus(@ActeurCourant() a: Acteur, @Body() d: LusDto) {
    return this.service.marquerLus(a, d.quartier)
  }
}
