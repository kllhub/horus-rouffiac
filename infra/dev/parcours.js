// Usage : cd infra/dev && npm i playwright-core@1 && node parcours.js   (pile locale démarrée + dev-comptes.sh)
// Parcours navigateur réels contre la pile locale (http://localhost:8090 + Keycloak :8180).
const { chromium } = require('playwright-core')
const OUT = require('os').tmpdir()
const MDP = 'Horus-Test-2026!'
let echecs = 0
const MARQUE = 'Véhicule inconnu ' + Date.now().toString(36)
const ok = (l, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + l + (c ? '' : '  → ' + d)); if (!c) echecs++ }

async function connecter(page, url, email) {
  await page.goto(url)
  await page.click('#login-btn')
  await page.waitForURL(/localhost:8180/)
  await page.fill('#username', email)
  await page.fill('#password', MDP)
  await page.click('#kc-login')
  await page.waitForURL(/localhost:8090/)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const erreurs = []

  console.log('Page publique')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => erreurs.push('index: ' + e.message))
    await page.goto('http://localhost:8090/index.html?action=x')
    await page.waitForTimeout(1500)
    const cartes = await page.locator('#alerts-grid .alert-card').count()
    const vide = await page.locator('#alerts-grid').innerText()
    ok('le fil public se charge depuis l\'API (pas de données de démo)', !vide.includes('Individu suspect ch. du Moulin'), vide.slice(0, 120))
    await page.click('text=Signaler un incident >> nth=0')
    await page.selectOption('#f-rue', 'Grande Rue')
    await page.fill('#f-numero', '7')
    await page.selectOption('#f-type', { index: 1 })
    await page.fill('#f-desc', MARQUE + ' stationné devant l\'école depuis ce matin.')
    await page.fill('#f-nom', 'Habitant test')
    await page.click('text=Envoyer le signalement')
    await page.waitForTimeout(800)
    const toast = await page.locator('#toast').innerText()
    ok('un habitant envoie un signalement via le formulaire', toast.includes('Signalement transmis'), toast)
    await ctx.close()
  }

  console.log('Espace sécurisé — gendarme')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => erreurs.push('fdo: ' + e.message))
    await connecter(page, 'http://localhost:8090/fdo.html', 'gend@horus.test')
    await page.waitForSelector('#dashboard', { state: 'visible' })
    await page.waitForTimeout(800)
    const pill = await page.locator('#role-pill').innerText()
    ok('connexion Keycloak puis retour dans HORUS, rôle affiché', pill.includes('Gendarmerie'), pill)
    ok('l\'URL ne garde pas le code de connexion', !page.url().includes('code='), page.url())
    const carte = page.locator('.sig-card', { hasText: MARQUE })
    ok('le signalement de l\'habitant est reçu', (await carte.count()) === 1)
    ok('les coordonnées du déclarant sont visibles du gendarme', (await carte.innerText()).includes('Habitant test'))
    await carte.locator('text=Prendre en charge').click()
    await page.waitForTimeout(800)
    ok('prise en charge depuis l\'interface', (await page.locator('.sig-card', { hasText: MARQUE }).innerText()).includes('Pris en charge'))
    await page.click('.page-tab:has-text("Main courante")')
    await page.waitForTimeout(500)
    ok('la main courante affiche l\'entrée MCG', (await page.locator('#mc-entries').innerText()).includes('MCG-2026-'))
    await page.screenshot({ path: OUT + '/fdo-gend.png' })
    await ctx.close()
  }

  console.log('Espace sécurisé — référent')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => erreurs.push('fdo-ref: ' + e.message))
    await connecter(page, 'http://localhost:8090/fdo.html', 'ref.louradou@horus.test')
    await page.waitForSelector('#dashboard', { state: 'visible' })
    await page.waitForTimeout(800)
    const texte = await page.locator('#cards-list').innerText()
    ok('le référent de Louradou ne voit pas le signalement de Centre-Bourg', !texte.includes(MARQUE))
    ok('pas d\'onglet main courante pour un référent', !(await page.locator('.page-tab', { hasText: 'Main courante' }).isVisible()))
    await ctx.close()
  }

  console.log('Administration')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => erreurs.push('admin: ' + e.message))
    await connecter(page, 'http://localhost:8090/admin.html', 'admin@horus.test')
    await page.waitForSelector('#app', { state: 'visible' })
    await page.waitForTimeout(800)
    ok('la liste des comptes vient de Keycloak', (await page.locator('#comptes').innerText()).includes('gend@horus.test'))
    await page.click('text=＋ Nouveau compte')
    const nouvel = 'asvp-' + Date.now().toString(36) + '@horus.test'
    await page.fill('#f-email', nouvel)
    await page.fill('#f-nom', 'Agent Test')
    await page.selectOption('#f-role', 'asvp')
    await page.click('#form-submit')
    await page.waitForSelector('#overlay-secret.open')
    const secret = await page.locator('#secret-value').innerText()
    ok('création d\'un compte, mot de passe provisoire affiché une fois', secret.length >= 12, secret)
    await page.click('text=J\'ai noté le mot de passe')
    await page.waitForTimeout(500)
    ok('le nouveau compte apparaît dans la liste', (await page.locator('#comptes').innerText()).includes(nouvel))
    await page.screenshot({ path: OUT + '/admin.png' })
    // Un gendarme qui ouvre admin.html est refusé
    const ctx2 = await browser.newContext()
    const p2 = await ctx2.newPage()
    await connecter(p2, 'http://localhost:8090/admin.html', 'gend@horus.test')
    await p2.waitForTimeout(800)
    ok('un gendarme est refusé sur l\'administration', (await p2.locator('#login-error').innerText()).includes('pas administrateur'))
    await ctx2.close()
    await ctx.close()
  }

  ok('aucune erreur JavaScript dans les pages', erreurs.length === 0, erreurs.join(' | '))
  await browser.close()
  console.log(echecs ? `\n❌ ${echecs} écart(s)` : '\n✅ parcours conformes')
  process.exit(echecs ? 1 : 0)
})()
