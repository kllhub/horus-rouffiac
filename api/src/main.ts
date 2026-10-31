import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function main() {
  const app = await NestFactory.create(AppModule)

  // Derrière le nginx de l'hôte : on ne fait confiance qu'aux adresses privées pour
  // X-Forwarded-For, sinon chaque client choisirait son identité de comptage (limite de débit).
  const express = app.getHttpAdapter().getInstance() as { set?: (c: string, v: unknown) => void }
  express.set?.('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])

  // La PWA est servie par le même domaine que l'API : en production, aucune autre origine.
  const origines = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean)
  if (process.env.NODE_ENV === 'production' && !origines?.length) {
    throw new Error('CORS_ORIGIN est obligatoire en production (ex. https://horus.mairiederouffiac.fr).')
  }
  app.enableCors({ origin: origines ?? true })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }))
  app.enableShutdownHooks()

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  new Logger('horus-api').log(`écoute sur :${port} (préfixe /api)`)
}

main()
