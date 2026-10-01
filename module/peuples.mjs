// ============================================================
// PEUPLES ET MAGIE STELLAIRE — supplément « Arcanes du Monde » (p. 36-54)
// Données de jeu : la version non officielle remplace PEUPLES et SCEAUX par des listes vides.
// ============================================================

/**
 * Peuples jouables. Champs de jeu :
 *  - devotionsDepart : Dévotions de départ à l'étape 2 de la création (absent = 1 partout, règle de base)
 *  - blessuresBonus  : Blessures en plus d'un humain
 *  - seuilBonus      : ajouté à « Dévotion Champs de bataille + 5 » pour le seuil de défaite
 *  - blessuresInfligees : Blessures infligées par un coup réussi
 *  - particularites  : rappel affiché sur la fiche (auto = géré automatiquement)
 */
export const PEUPLES = [];   // contenu du supplément, absent de la version non officielle

/** Sceaux de magie stellaire. diff: null = au choix (Sceau d'Ara). */
export const SCEAUX = [];

/** Peuple d'un acteur (null = humain ou non renseigné). */
export function peupleDe(actor) {
  const id = actor?.system?.peuple ?? "";
  return id ? PEUPLES.find(p => p.id === id) ?? null : null;
}

export function estHumain(actor) {
  return !peupleDe(actor);
}

/** Blessures maximales d'un héros (10 + bonus du peuple). */
export function blessuresMax(actor) {
  return 10 + (peupleDe(actor)?.blessuresBonus ?? 0);
}

/** Bonus au seuil de défaite (géant : +6 au lieu de +5). */
export function bonusSeuil(actor) {
  return peupleDe(actor)?.seuilBonus ?? 0;
}

export function blessuresInfligees(actor) {
  return peupleDe(actor)?.blessuresInfligees ?? 1;
}

export function sceau(id) {
  return SCEAUX.find(s => s.id === id) ?? null;
}
