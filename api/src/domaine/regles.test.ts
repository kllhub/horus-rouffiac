import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Acteur, formatMcg, perimetreLecture, planAction, peutEcrire, quartiersMessagerie, Refus } from './regles'

const t0 = new Date('2026-10-11T10:00:00Z')
const sig = (o: Partial<Parameters<typeof planAction>[1]> = {}) => ({
  statut: 'pending' as const, quartier: 'Louradou', clotureLe: null, fdoKey: null, fdoNom: null, ...o,
})
const acteur = (role: Acteur['role'], quartier: string | null = null): Acteur => ({ id: 'u-' + role, role, nom: 'Nom ' + role, quartier })
const code = (fn: () => unknown) => {
  try { fn(); return 'ok' } catch (e) { return (e as Refus).code }
}

test('un référent ne lit et ne traite que son quartier', () => {
  const ref = acteur('referent', 'Louradou')
  assert.deepEqual(perimetreLecture(ref), { quartier: 'Louradou' })
  assert.equal(code(() => planAction(ref, sig({ quartier: 'Pigassou' }), 'validate', t0)), 'hors_quartier')
  assert.equal(planAction(ref, sig(), 'validate', t0).patch.statut, 'approved')
})

test('un référent sans quartier ne voit rien', () => {
  assert.equal(code(() => perimetreLecture(acteur('referent'))), 'non_autorise')
})

test("l'administrateur n'a accès à aucun signalement", () => {
  assert.equal(code(() => perimetreLecture(acteur('admin'))), 'non_autorise')
  assert.equal(code(() => planAction(acteur('admin'), sig(), 'validate', t0)), 'non_autorise')
})

test('seules les FDO prennent en charge, et cela part en main courante', () => {
  assert.equal(code(() => planAction(acteur('moderateur'), sig(), 'take', t0)), 'non_autorise')
  assert.equal(code(() => planAction(acteur('referent', 'Louradou'), sig(), 'take', t0)), 'non_autorise')
  const r = planAction(acteur('gend'), sig(), 'take', t0)
  assert.equal(r.patch.statut, 'taken')
  assert.equal(r.patch.fdoKey, 'gend')
  assert.equal(r.mainCourante, 'Pris en charge')
})

test("l'ASVP ne clôture pas ; les autres FDO oui, et seulement un signalement validé", () => {
  const valide = sig({ statut: 'approved' })
  assert.equal(code(() => planAction(acteur('asvp'), valide, 'resolve', t0)), 'non_autorise')
  assert.deepEqual(planAction(acteur('pm'), valide, 'resolve', t0).patch, { clotureLe: t0 })
  assert.equal(code(() => planAction(acteur('pm'), sig(), 'resolve', t0)), 'statut_invalide')
  assert.equal(code(() => planAction(acteur('pm'), sig({ statut: 'approved', clotureLe: t0 }), 'resolve', t0)), 'statut_invalide')
})

test('une validation par un modérateur ne crée pas de main courante ni ne réécrit la FDO', () => {
  const r = planAction(acteur('moderateur'), sig({ statut: 'taken', fdoKey: 'gend', fdoNom: 'Adj. Martinet' }), 'validate', t0)
  assert.equal(r.mainCourante, null)
  assert.equal(r.patch.fdoKey, 'gend')
  assert.equal(r.patch.fdoNom, 'Adj. Martinet')
})

test('on ne valide pas deux fois', () => {
  assert.equal(code(() => planAction(acteur('gend'), sig({ statut: 'rejected' }), 'validate', t0)), 'statut_invalide')
})

test('messagerie : un référent écrit seulement dans son quartier', () => {
  assert.equal(peutEcrire(acteur('referent', 'Louradou'), 'Louradou'), true)
  assert.equal(peutEcrire(acteur('referent', 'Louradou'), 'Pigassou'), false)
  assert.equal(peutEcrire(acteur('moderateur'), 'Louradou'), false)
  assert.equal(peutEcrire(acteur('pm'), 'Pigassou'), true)
  assert.deepEqual(quartiersMessagerie(acteur('referent', 'Charlary')), ['Charlary'])
  assert.deepEqual(quartiersMessagerie(acteur('admin')), [])
})

test('numéro MCG', () => {
  assert.equal(formatMcg(2026, 42), 'MCG-2026-00042')
})
