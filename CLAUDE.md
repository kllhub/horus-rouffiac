# HORUS — Mémoire du projet

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Il doit être mis à jour à la fin de chaque session de travail importante.
> Dernière mise à jour : 28 mai 2026

---

## Contexte général

**HORUS** est la plateforme de vigilance citoyenne de la commune de **Rouffiac-Tolosan** (31180, Haute-Garonne, ~2 500 habitants). C'est une PWA (Progressive Web App) — un seul fichier HTML autonome, installable sur mobile sans passer par les stores.

Le projet vise à s'aligner sur le dispositif officiel **"Participation citoyenne"** de la Gendarmerie nationale (et non sur le modèle commercial "Voisins Vigilants"), avec une doctrine stricte : les citoyens référents observent et signalent, ils ne se substituent jamais aux forces de l'ordre.

**Porteur du projet :** Karim Lahtil, adjoint au maire / conseiller municipal délégué de Rouffiac-Tolosan, également développeur sur le portail numérique municipal (elus-app).

---

## Stack technique

- **Frontend** : HTML/CSS/JS vanilla, un seul fichier `index.html` (pas de framework, pas de build tool)
- **Carte** : Leaflet.js + tuiles OpenStreetMap standard (`tile.openstreetmap.org`), pas de clé API requise
- **IA** : API Anthropic (Claude Sonnet) pour l'analyse automatique des signalements (catégorie, urgence, conseil)
- **PWA** : Service Worker (`sw.js`) avec cache offline, notifications push, manifest installable
- **Déploiement** : Fly.io, app name `horus-rouffiac`, via Dockerfile nginx minimaliste
- **Police** : Cinzel (titres) + Outfit (corps) — combo choisi après comparatif de 6 options
- **Palette** : nuit `#0D1117`, or `#C9A84C`, accent rouge `#E05555`

---

## Structure du dépôt

```
rouffiac-tolosan/
├── CLAUDE.md              ← ce fichier
├── horus-pwa/             ← PWA HORUS (priorité actuelle)
│   ├── index.html
│   ├── sw.js
│   ├── manifest.json
│   ├── offline.html
│   ├── icons/
│   ├── Dockerfile          (à créer si absent)
│   └── fly.toml            (à créer si absent)
├── site-mairie/            ← module HTML pour site web mairie (horus-module-mairie.html)
├── app-react/              ← prototype React initial (voisins-vigilants.jsx) — antérieur à la PWA
└── docs/
    └── guide-voisins-vigilants.docx  ← guide utilisateurs par rôle (à mettre à jour si rôles changent)
```

**Note** : `app-react/` était une première itération avant de basculer sur la PWA. Ne pas développer dessus sauf demande explicite — la PWA dans `horus-pwa/` est la version de référence.

---

## Rôles et droits (état actuel — référence)

| Rôle | Badge | Voir alertes en attente | Coordonnées déclarant | Confirmer | Clôturer | Avis officiel | Prise en charge | Historique complet |
|---|---|---|---|---|---|---|---|---|
| Habitant | 👤 | — | — | — | — | — | — | — |
| Référent ⭐ | ⭐ | — (son quartier) | — | ✓ | ✓ (son quartier) | — | — | — |
| Modérateur 🛡 | 🛡 | ✓ | — | ✓ | ✓ | — | — | ✓ |
| Gendarmerie / PN | ⚖️ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Police Municipale | 🔵 | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| ASVP | 🟡 | ✓ | ✓ | — | — | — | ✓ | — |

**6 quartiers** : Centre-Bourg, Louradou, Castelviel, Charlary, Tartaloche, Pigassou — chacun avec un référent dédié et des coordonnées GPS réelles (recherchées via Nominatim/OSM).

**Stats de délinquance** — accès différencié validé :
- Gendarmerie/PN : commune entière + historique + export
- PM : commune entière + export
- ASVP : commune entière, lecture seule
- Modérateur : commune entière + stats synthétiques conseil municipal
- Référent : son quartier uniquement
- Habitant : aucun accès

---

## Historique des décisions importantes

1. **Nom du projet** : hésitation entre Argus (rejeté — trop associé à L'Argus automobile) et HORUS (retenu — œil égyptien, symbole universel de vigilance).
2. **Typographie** : 6 combos testés dans une page de comparaison HTML dédiée. **Combo 3 retenu : Cinzel (titres) + Outfit (corps)**.
3. **Carte** : plusieurs tuiles testées (CartoDB Dark, Voyager) — bloquées dans la sandbox de prévisualisation Claude. **Décision : OpenStreetMap standard**, qui fonctionnera correctement une fois déployé sur Fly.io (le blocage venait de la sandbox, pas du code).
4. **PWA plutôt que app native + site séparé** : décision de simplifier vers un seul livrable PWA installable, plus simple à maintenir qu'une app native iOS/Android + un site web séparé.
5. **Doctrine gendarmerie** : recherche effectuée sur le dispositif officiel "Participation citoyenne" et le format réel de la Main Courante Gendarmerie (MCG/NMCI). Ces recherches ont guidé l'ajout des fonctionnalités "Conduite à tenir" et "Main courante format gendarmerie".

---

## Fonctionnalités déjà implémentées (dans horus-pwa/index.html)

- [x] Feed d'alertes avec filtres par catégorie et quartier
- [x] Carte Leaflet/OSM avec marqueurs par urgence et badge FDO
- [x] Formulaire de signalement avec analyse IA (catégorie, urgence, titre, conseil)
- [x] Système de rôles complet (habitant, référent, modérateur, gendarmerie, PN, PM, ASVP)
- [x] Confirmation d'alerte par les référents
- [x] Clôture d'alerte
- [x] Prise en charge FDO avec badge visible
- [x] Avis officiel publiable par Gendarmerie/PN/PM
- [x] Messages de prévention par les référents (avec suggestion IA)
- [x] Annuaire des référents et des FDO
- [x] Notifications in-app + push natif
- [x] Manifest PWA installable + Service Worker + mode offline
- [x] Sélecteur de rôle pour démo/test

## Fonctionnalités en cours / à valider après prochain déploiement

- [ ] **Dockerfile + fly.toml** — à créer si pas déjà fait, pour déploiement sur Fly.io (app `horus-rouffiac`)
- [ ] **Main courante format gendarmerie** — champs MCG/NMCI (numéro MCG-2026-XXXXX, date faits vs date enregistrement, unité traitante, mention légale arrêté du 22 juin 2011)
- [ ] **Conduite à tenir** — 6 fiches situationnelles (délit flagrant, individu suspect, démarchage, absence prolongée, troubles voisinage, personne vulnérable) + bandeau permanent rappelant le rôle non substitutif du citoyen
- [ ] **Export PDF main courante** — mise en page façon document officiel (en-tête République Française / Gendarmerie Nationale / Brigade de Toulouse-Est)
- [ ] **Statistiques de délinquance** — graphiques Chart.js, accès différencié par rôle (voir tableau ci-dessus)
- [ ] **Fiche incident structurée** — champs plaque relevée, nombre de témoins, suites données
- [ ] **Canal messagerie référent ↔ gendarmerie**
- [ ] **Rapport mensuel automatique** — généré via API Anthropic à partir des stats

## Prochaines étapes envisagées (non encore lancées)

- Vérifier le rendu réel de la carte OSM une fois en ligne (zoom 16, noms de rues)
- Tester l'installation PWA sur iPhone et Android réels
- Voir avec la gendarmerie de Toulouse-Est si une présentation du dispositif est possible une fois la main courante + conduite à tenir en place

---

## Conventions de travail

- Karim travaille en français, utilise Claude Code en mode confirmation étape par étape pour les changements d'infrastructure
- Toujours consulter ce fichier ET lire `horus-pwa/index.html` avant de modifier quoi que ce soit
- Mettre à jour la section "Fonctionnalités déjà implémentées" après chaque session
- Ne pas casser les rôles et droits existants sans demande explicite
- Conserver l'identité visuelle (palette nuit/or, Cinzel + Outfit) sur tout nouvel élément
