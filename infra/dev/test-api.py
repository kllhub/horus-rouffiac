"""Tests de bout en bout de l'API HORUS contre la pile locale (docker-compose.dev.yml).

    python infra/dev/test-api.py

Prérequis : dev-comptes.sh lancé (comptes de test + direct grant autorisé en local).
Chaque vérification affiche ✓ ou ✗ ; le script sort en erreur au premier écart.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "http://localhost:8090/api"
KC = "http://localhost:8180/realms/horus/protocol/openid-connect/token"
MDP = "Horus-Test-2026!"
echecs = 0
import time
NOUVEAU = f"nouveau-{int(time.time())}@horus.test"


def jeton(email):
    corps = urllib.parse.urlencode({"grant_type": "password", "client_id": "horus-pwa", "username": email, "password": MDP}).encode()
    return json.load(urllib.request.urlopen(KC, corps))["access_token"]


def appel(methode, chemin, corps=None, tok=None):
    req = urllib.request.Request(API + chemin, method=methode, data=json.dumps(corps).encode() if corps is not None else None)
    req.add_header("Content-Type", "application/json")
    if tok:
        req.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def verifie(libelle, condition, detail=""):
    global echecs
    print(("  ✓ " if condition else "  ✗ ") + libelle + ("" if condition else f"   → {detail}"))
    if not condition:
        echecs += 1


T = {r: jeton(f"{r}@horus.test") for r in ["admin", "gend", "pm", "asvp", "moderateur"]}
T["refL"] = jeton("ref.louradou@horus.test")
T["refP"] = jeton("ref.pigassou@horus.test")

print("Administration")
s, comptes = appel("GET", "/admin/comptes", tok=T["admin"])
verifie("l'admin liste les comptes", s == 200 and len(comptes) >= 7, (s, comptes))
ids = {c["email"]: c["id"] for c in comptes}
for email, q, nom in [("ref.louradou@horus.test", "Louradou", "Marie L."), ("ref.pigassou@horus.test", "Pigassou", "Karim A.")]:
    s, r = appel("PATCH", f"/admin/comptes/{ids[email]}", {"nom": nom, "role": "referent", "quartier": q}, T["admin"])
    verifie(f"l'admin rattache {nom} à {q}", s == 200, (s, r))
s, r = appel("PATCH", f"/admin/comptes/{ids['gend@horus.test']}", {"nom": "Adj. Martinet", "role": "gend"}, T["admin"])
verifie("l'admin fixe le nom affiché d'un gendarme", s == 200, (s, r))
s, r = appel("PATCH", f"/admin/comptes/{ids['admin@horus.test']}", {"nom": "Karim Lahtil", "role": "gend"}, T["admin"])
verifie("l'admin ne peut pas se retirer son propre rôle", s == 409 and r["error"] == "pas_soi_meme", (s, r))
s, r = appel("GET", "/admin/comptes", tok=T["gend"])
verifie("un gendarme n'accède pas à l'administration", s == 403, (s, r))
s, r = appel("GET", "/signalements", tok=T["admin"])
verifie("l'admin n'accède à aucun signalement", s == 403, (s, r))
s, r = appel("POST", "/admin/comptes", {"email": "pas-un-email", "nom": "X", "role": "referent"}, T["admin"])
verifie("création refusée si e-mail invalide", s == 400, (s, r))
s, r = appel("POST", "/admin/comptes", {"email": NOUVEAU, "nom": "Nouveau R.", "role": "referent"}, T["admin"])
verifie("création refusée : référent sans quartier", s == 400, (s, r))
s, cree = appel("POST", "/admin/comptes", {"email": NOUVEAU, "nom": "Nouveau R.", "role": "referent", "quartier": "Charlary"}, T["admin"])
verifie("création d'un référent, mot de passe provisoire renvoyé", s == 201 and len(cree.get("motDePasse", "")) >= 12, (s, cree))
s, r = appel("POST", "/admin/comptes", {"email": NOUVEAU, "nom": "Doublon", "role": "pm"}, T["admin"])
verifie("doublon d'e-mail refusé", s == 409 and r["error"] == "email_existant", (s, r))

print("Signalement public (habitant, sans compte)")
s, r = appel("POST", "/public/signalements", {"rue": "Chemin de Pigassou", "numero": "12", "quartier": "Pigassou", "type": "👤 Rôdeur suspect",
                                               "description": "Homme seul <script>alert(1)</script> autour des voitures", "nom": "Jean H.", "contact": "06 00 00 00 01"})
verifie("un habitant soumet un signalement", s == 201, (s, r))
sid = r["id"]
s, r = appel("POST", "/public/signalements", {"rue": "X", "quartier": "Ailleurs", "type": "t", "description": "court"})
verifie("signalement invalide refusé (quartier inconnu, rue trop courte)", s == 400, (s, r))
s, r = appel("POST", "/public/signalements", {"rue": "Grande Rue", "quartier": "Centre-Bourg", "type": "📌 Autre", "description": "Champ inconnu", "statut": "approved"})
verifie("un champ non prévu (statut) est ignoré, pas appliqué", s == 201, (s, r))
sid2 = r["id"]
s, pub = appel("GET", "/public/alertes")
verifie("un signalement en attente n'apparaît pas dans le fil public", s == 200 and all(a["id"] not in (sid, sid2) for a in pub), pub)

print("Grille des rôles")
s, liste = appel("GET", "/signalements", tok=T["refL"])
verifie("le référent de Louradou ne voit pas Pigassou", s == 200 and all(x["quartier"] == "Louradou" for x in liste), liste)
s, liste = appel("GET", "/signalements", tok=T["refP"])
mien = next((x for x in liste if x["id"] == sid), None)
verifie("le référent de Pigassou le voit, sans les coordonnées du déclarant", mien is not None and "declarant" not in mien, mien)
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "validate"}, T["refL"])
verifie("le référent de Louradou ne peut pas le valider (403)", s == 403 and r["error"] == "hors_quartier", (s, r))
s, liste = appel("GET", "/signalements", tok=T["gend"])
mien = next(x for x in liste if x["id"] == sid)
verifie("le gendarme voit les coordonnées du déclarant", mien.get("declarant", {}).get("contact") == "06 00 00 00 01", mien)
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "take"}, T["moderateur"])
verifie("le modérateur ne prend pas en charge", s == 403, (s, r))
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "take"}, T["gend"])
verifie("le gendarme prend en charge", s == 201, (s, r))
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "take"}, T["pm"])
verifie("une seconde prise en charge est refusée (409)", s == 409, (s, r))
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "validate"}, T["refP"])
verifie("le référent du quartier valide", s == 201, (s, r))
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "resolve"}, T["asvp"])
verifie("l'ASVP ne clôture pas", s == 403, (s, r))
s, pub = appel("GET", "/public/alertes")
p = next((a for a in pub if a["id"] == sid), None)
verifie("validé → visible dans le fil public, sans numéro ni déclarant", p is not None and "numero" not in p and "declarant" not in p and p["rue"] == "Chemin de Pigassou", p)
s, r = appel("PATCH", f"/signalements/{sid}/fiche", {"plaque": "31-AZ-123", "nbTemoins": 2, "suites": "Patrouille"}, T["moderateur"])
verifie("le modérateur ne remplit pas la fiche FDO", s == 403, (s, r))
s, r = appel("PATCH", f"/signalements/{sid}/fiche", {"plaque": "31-AZ-123", "nbTemoins": 2, "suites": "Patrouille"}, T["pm"])
verifie("la police municipale remplit la fiche", s == 200, (s, r))
s, r = appel("POST", f"/signalements/{sid}/actions", {"action": "resolve"}, T["pm"])
verifie("la police municipale clôture", s == 201, (s, r))
s, r = appel("POST", "/signalements/999999/actions", {"action": "validate"}, T["gend"])
verifie("signalement inexistant → 404", s == 404, (s, r))

print("Main courante")
s, mc = appel("GET", "/main-courante", tok=T["moderateur"])
verifie("le modérateur n'y a pas accès", s == 403, (s, mc))
s, mc = appel("GET", "/main-courante", tok=T["gend"])
actions = [e["action"] for e in mc if e["signalementId"] == sid]
verifie("prise en charge et clôture FDO consignées, pas la validation du référent", sorted(actions) == ["Clôturé", "Pris en charge"], actions)
nums = [e["mcgNum"] for e in mc]
verifie("numéros MCG uniques au format MCG-AAAA-NNNNN", len(set(nums)) == len(nums) and all(n.startswith("MCG-2026-") and len(n) == 14 for n in nums), nums)
s, r = appel("PATCH", f"/main-courante/{mc[0]['id']}", {"suiteDonnee": "Transmis au procureur"}, T["gend"])
verifie("le gendarme met à jour la suite donnée", s == 200, (s, r))
s, r = appel("PATCH", f"/main-courante/{mc[0]['id']}", {"suiteDonnee": "N'importe quoi"}, T["gend"])
verifie("suite donnée hors liste refusée", s == 400, (s, r))

print("Messagerie")
s, r = appel("POST", "/messages", {"quartier": "Pigassou", "contenu": "Bonjour"}, T["refL"])
verifie("un référent n'écrit pas dans un autre quartier", s == 403, (s, r))
s, r = appel("POST", "/messages", {"quartier": "Louradou", "contenu": "Ronde ce soir ?"}, T["refL"])
verifie("le référent écrit dans son quartier", s == 201, (s, r))
s, r = appel("POST", "/messages", {"quartier": "Louradou", "contenu": "Oui, 22h."}, T["gend"])
verifie("le gendarme répond", s == 201, (s, r))
s, msgs = appel("GET", "/messages", tok=T["refP"])
verifie("le référent de Pigassou ne lit pas Louradou", s == 200 and all(m["quartier"] == "Pigassou" for m in msgs), msgs)
s, r = appel("GET", "/messages", tok=T["moderateur"])
verifie("le modérateur n'a pas de messagerie", s == 403, (s, r))

print("Désactivation")
s, r = appel("POST", f"/admin/comptes/{ids['ref.pigassou@horus.test']}/actif", {"actif": False}, T["admin"])
verifie("l'admin désactive un référent", s == 201, (s, r))
s, r = appel("GET", "/signalements", tok=T["refP"])
verifie("son jeton encore valide est refusé immédiatement", s == 403 and r["error"] == "compte_desactive", (s, r))
s, r = appel("POST", f"/admin/comptes/{ids['ref.pigassou@horus.test']}/actif", {"actif": True}, T["admin"])
verifie("réactivation", s == 201, (s, r))
s, j = appel("GET", "/admin/journal", tok=T["admin"])
verifie("le journal trace les actions", s == 200 and {"création", "désactivation", "réactivation"} <= {e["action"] for e in j}, [e["action"] for e in j])

print(f"\n{'✅ tout est conforme' if not echecs else f'❌ {echecs} écart(s)'}")
sys.exit(1 if echecs else 0)
