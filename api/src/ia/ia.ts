import Anthropic from '@anthropic-ai/sdk'
import { Body, Controller, HttpException, Injectable, Logger, Post, ServiceUnavailableException } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsString, Length } from 'class-validator'
import { Roles } from '../auth/auth'

/**
 * Rapport mensuel rédigé par Claude, à partir de STATISTIQUES AGRÉGÉES uniquement
 * (compteurs par quartier, catégorie, action) : aucune description, adresse ni déclarant
 * ne quitte le serveur. La clé Anthropic reste dans l'environnement de l'API.
 */
const SYSTEME =
  'Tu es un rédacteur de rapports officiels pour la Gendarmerie nationale française. ' +
  'Rédige un rapport mensuel structuré, professionnel et factuel, en français, à partir des statistiques fournies. ' +
  'Format : introduction, bilan chiffré, analyse par quartier, tendances, recommandations opérationnelles. ' +
  "Ton sobre et administratif. N'invente aucun chiffre absent des statistiques."

class RapportDto {
  @IsString() @Length(10, 8000) stats!: string
}

@Injectable()
export class IaService {
  private readonly log = new Logger('IA')
  private readonly client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

  async rapport(stats: string): Promise<{ texte: string }> {
    if (!this.client) throw new ServiceUnavailableException('ia_non_configuree')
    try {
      const response = await this.client.beta.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 16000,
        // Si le modèle décline, l'API rejoue la requête sur le modèle de repli recommandé.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEME,
        messages: [{ role: 'user', content: `Voici les statistiques :\n${stats}\n\nRédige le rapport mensuel officiel.` }],
      })
      if (response.stop_reason === 'refusal') throw new HttpException('refus_modele', 422)
      const texte = response.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('\n')
      return { texte }
    } catch (e) {
      if (e instanceof HttpException) throw e
      if (e instanceof Anthropic.RateLimitError) throw new HttpException('limite_ia', 429)
      if (e instanceof Anthropic.APIError) {
        this.log.error(`Anthropic ${e.status} ${e.message}`)
        throw new HttpException('erreur_ia', 502)
      }
      throw e
    }
  }
}

@Roles('gend', 'pn', 'pm', 'asvp')
@Controller('ia')
export class IaController {
  constructor(private readonly ia: IaService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('rapport')
  rapport(@Body() d: RapportDto) {
    return this.ia.rapport(d.stats)
  }
}
