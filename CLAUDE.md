# HORUS — Mémoire du projet

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il doit être mis à jour à la fin de chaque session de travail importante.
> Dernière mise à jour : 21 juin 2026

---

## Contexte général

**HORUS** est la plateforme de vigilance citoyenne de la commune de **Rouffiac-Tolosan** (31180, Haute-Garonne, ~2 500 habitants). C'est une PWA (Progressive Web App) — deux fichiers HTML autonomes, installable sur mobile sans passer par les stores.

Le projet vise à s'aligner sur le dispositif officiel **"Participation citoyenne"** de la Gendarmerie nationale (et non sur le modèle commercial "Voisins Vigilants"), avec une doctrine stricte : les citoyens référents observent et signalent, ils ne se substituent jamais aux forces de l'ordre.

**Porteur du projet :** Karim Lahtil, adjoint au maire / conseiller municipal délégué de Rouffiac-Tolosan, également développeur sur le portail numérique municipal (elus-app).

---

## Stack technique

- **Frontend** : HTML/CSS/JS vanilla, deux fichiers HTML (pas de framework, pas de build tool)
- **Carte** : Leaflet.js + tuiles OpenStreetMap standard (`tile.openstreetmap.org`), pas de clé API requise
- **IA** : API Anthropic (Claude Sonnet) pour l'analyse automatique des signalements (catégorie, urgence, conseil)
- **PWA** : Service Worker (`sw.js`) avec cache offline (`horus-v3`), auto-reload sur mise à jour, notifications push, manifest installable
- **Déploiement** : Fly.io, app name `horus-rouffiac`, via Dockerfile nginx + `nginx.conf` personnalisé
- **Polices** : Open Sans (corps) + Roboto Mono (données) + Muse Sans (display) — chargées via Google Fonts
- **Palette** : nuit `#0D1117`, or `#C9A84C`, accent rouge `#E05555`

---

## Structure réelle du dépôt

⚠️ Le dépôt a une imbrication à 3 niveaux — source de confusion historique à ne pas reproduire.

```
horus-pwa/                        ← racine git (CWD pour flyctl deploy)
├── CLAUDE.md                     ← ce fichier
├── Dockerfile                    ← COPY horus-pwa/horus-pwa/ (depuis racine git)
├── fly.toml                      ← app = 'horus-rouffiac', region = cdg
├── nginx.conf                    ← Cache-Control no-cache pour sw.js, fallback SPA
├── index.html                    ← version mobile/prototype (NON déployée — ne pas modifier)
├── .github/workflows/
│   └── fly-deploy.yml            ← CI/CD : flyctl deploy --remote-only (depuis racine git)
└── horus-pwa/                    ← niveau intermédiaire (ne contient que le sous-dossier)
    └── horus-pwa/                ← ⬅ FICHIERS DÉPLOYÉS (ce qui tourne sur horus-rouffiac.fly.dev)
        ├── index.html            ← page publique citoyens (desktop-first)
        ├── fdo.html              ← espace FDO (PIN : 1234)
        ├── sw.js                 ← Service Worker (cache horus-v3, postMessage SW_UPDATED)
        ├── manifest.json
        ├── offline.html
        └── icons/
```

**Règle absolue** : toujours modifier les fichiers dans `horus-pwa/horus-pwa/horus-pwa/`, jamais ceux à la racine git.

**Déploiement manuel** : `flyctl deploy` depuis `horus-pwa/` (racine git). Ne jamais lancer depuis le dossier parent `Rouffiac-Tolosan/`.

**CI/CD GitHub Actions** : se déclenche automatiquement sur push `master`. Utilise la même racine git comme contexte Docker. Si le workflow échoue, vérifier que le Dockerfile utilise bien `COPY horus-pwa/horus-pwa/` (deux niveaux depuis la racine git).

---

## Les deux fichiers principaux

### `index.html` — Page publique citoyens

Interface desktop-first visible sur `horus-rouffiac.fly.dev/`. Contient :
- Hero + stats animées
- Grille des quartiers avec référents
- Feed d'alertes filtrable (catégorie + quartier)
- Carte Leaflet/OSM avec marqueurs urgence
- Formulaire de signalement (avec analyse IA + conduite à tenir contextuelle)
- Panneau "🛡 Conduite à tenir" (slide depuis la gauche)
- Panneau "❓ Guide citoyen" (slide depuis la droite)
- Messagerie référent ↔ FDO
- Lien vers `fdo.html` ("⚖️ Espace FDO")
- Service Worker auto-reload sur nouvelle version

### `fdo.html` — Espace Forces de l'Ordre

Accessible sur `horus-rouffiac.fly.dev/fdo.html`, protégé par PIN (`1234`). Contient :
- 4 onglets : Signalements | Main courante | Statistiques | Messages
- Gestion des signalements (valider, rejeter, prendre en charge, clôturer, avis officiel)
- **Main courante format MCG/NMCI** : numérotation `MCG-YYYY-XXXXX`, accordéon par entrée, sélecteur "Suite donnée", export PDF avec en-tête "République Française / Gendarmerie Nationale / Brigade de Toulouse-Est"
- Statistiques avec graphiques et filtres période/catégorie/quartier
- Messagerie FDO ↔ référents de quartier
- Rapport IA mensuel (API Anthropic)

---

## localStorage — clés utilisées

| Clé | Contenu |
|---|---|
| `horus_signalements` | tableau des signalements citoyens |
| `horus_mc` | entrées de la main courante MCG |
| `horus_mcg_counter` | compteur auto-incrémenté pour numéros MCG |
| `horus_messages` | messagerie référents ↔ FDO |
| `horus_theme` | préférence thème clair/sombre |

---

## Rôles et droits (état actuel — référence)

| Rôle | Badge | Voir alertes en attente | Coordonnées déclarant | Confirmer | Clôturer | Avis officiel | Prise en charge | Historique complet |
|---|---|---|---|---|---|---|---|---|
| Habitant | 👤 | — | — | — | — | — | — | — |
| Référent ⭐ | ⭐ | son quartier | — | ✓ | ✓ (son quartier) | — | — | — |
| Modérateur 🛡 | 🛡 | ✓ | — | ✓ | ✓ | — | — | ✓ |
| Gendarmerie / PN | ⚖️ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Police Municipale | 🔵 | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| ASVP | 🟡 | ✓ | ✓ | — | — | — | ✓ | — |

**6 quartiers** : Centre-Bourg, Louradou, Castelviel, Charlary, Tartaloche, Pigassou.

**Noms des agents FDO (démo)** : `{gend:"Adj. Martinet", pm:"Agent Duval", asvp:"Agent Roussel"}`

---

## Historique des décisions importantes

1. **Nom du projet** : Argus rejeté (trop associé à L'Argus automobile) → **HORUS** retenu (œil égyptien, symbole de vigilance).
2. **Typographie** : 6 combos testés. **Open Sans + Roboto Mono + Muse Sans** retenus pour la version desktop déployée. (Note : `index.html` à la racine git utilise Cinzel+Outfit — c'est un prototype mobile non déployé, ne pas confondre.)
3. **Carte** : OpenStreetMap standard retenu. CartoDB/Voyager bloqués en sandbox Claude (pas un bug du code).
4. **PWA deux fichiers** : `index.html` (public) + `fdo.html` (FDO, PIN 1234) — architecture intentionnelle pour séparer les accès.
5. **Doctrine gendarmerie** : alignement sur "Participation citoyenne" (circulaire 2006). Main courante au format MCG/NMCI (arrêté 22 juin 2011).
6. **Déploiement** : le contexte Docker doit être la racine git (`horus-pwa/`). Lancer `flyctl deploy` depuis ailleurs casse le chemin COPY et sert la page par défaut nginx.
7. **Service Worker** : cache `horus-v3`. Auto-reload via `postMessage SW_UPDATED` depuis l'événement `activate`. Bumper la version à chaque déploiement fonctionnel majeur.

---

## Fonctionnalités implémentées et déployées

- [x] Feed d'alertes avec filtres catégorie + quartier
- [x] Carte Leaflet/OSM avec marqueurs urgence et badge FDO
- [x] Formulaire de signalement + analyse IA (catégorie, urgence, titre, conseil)
- [x] **Conduite à tenir contextuelle** dans la modale de signalement (fiche selon type d'incident)
- [x] **Panneau "Conduite à tenir"** (6 fiches situationnelles, filtres, doctrine PC)
- [x] Système de rôles complet (habitant, référent, modérateur, gendarmerie, PN, PM, ASVP)
- [x] Confirmation / clôture / prise en charge / avis officiel
- [x] Messages de prévention référents (avec suggestion IA)
- [x] Messagerie référent ↔ FDO (canal bidirectionnel)
- [x] **Main courante format MCG/NMCI** (numérotation, champs officiels, accordéon, suite donnée)
- [x] **Export PDF main courante** (en-tête République Française / Gendarmerie Nationale)
- [x] Statistiques avec graphiques, filtres période/catégorie/quartier, accès différencié
- [x] Rapport IA mensuel (API Anthropic)
- [x] Annuaire référents + FDO
- [x] Notifications in-app + push natif
- [x] PWA installable + Service Worker + mode offline + auto-reload sur mise à jour

## Prochaines étapes envisagées

- Tester l'installation PWA sur iPhone et Android réels
- Vérifier la carte OSM en conditions réelles (zoom 16, noms de rues Rouffiac)
- Voir avec la gendarmerie de Toulouse-Est si une présentation du dispositif est possible
- Statistiques de délinquance : accès différencié par rôle à affiner (graphiques Chart.js ?)
- Fiche incident structurée : champs plaque, nb témoins, suites données

---

## Conventions de travail

- Karim travaille en français, confirmation étape par étape pour les changements d'infrastructure
- **Toujours lire ce fichier ET les fichiers cibles avant de modifier quoi que ce soit**
- Modifier uniquement `horus-pwa/horus-pwa/horus-pwa/index.html` et `fdo.html` (jamais `horus-pwa/index.html` à la racine)
- Déployer avec `flyctl deploy` depuis `horus-pwa/` (racine git), jamais depuis le dossier parent
- Mettre à jour ce CLAUDE.md à la fin de chaque session importante
- Ne pas casser les rôles et droits existants sans demande explicite
- Conserver l'identité visuelle (palette nuit/or, Open Sans + Roboto Mono + Muse Sans)
