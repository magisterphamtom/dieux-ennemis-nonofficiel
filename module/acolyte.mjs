// ============================================================
// RANG DE FOI « ACOLYTE » — Livret des dieux p. 11
// Dévotion 4+ : quand le héros s'en remet à ce dieu, il peut relancer 1 dé par risque.
// Relancer un échec ne peut jamais faire perdre de succès : la relance est donc faite
// automatiquement sur le premier dé raté.
// ============================================================

export const SEUIL_ACOLYTE = 4;

/** Vrai si l'acteur est un héros acolyte (Dévotion ≥ 4) du dieu donné. */
export function estAcolyte(actor, godId) {
  if (actor?.type !== "heros" || !godId || godId === "hubris") return false;
  return Number(actor.system.devotions?.[godId] ?? 0) >= SEUIL_ACOLYTE;
}

/**
 * Applique la relance d'acolyte à un jet de pool (NdS6cs>=4).
 * @returns {Promise<{valeurs:number[], succes:number, relance:{avant:number, apres:number, idx:number}|null, rolls:Roll[]}>}
 */
export async function appliquerAcolyte(roll, actif) {
  const valeurs = (roll.dice[0]?.results ?? []).map(r => r.result);
  const rolls = [roll];
  let relance = null;
  if (actif) {
    const idx = valeurs.findIndex(v => v < 4);
    if (idx >= 0) {
      const r2 = new Roll("1d6");
      await r2.evaluate();
      relance = { avant: valeurs[idx], apres: r2.total, idx };
      valeurs[idx] = r2.total;
      rolls.push(r2);
    }
  }
  return { valeurs, succes: valeurs.filter(v => v >= 4).length, relance, rolls };
}

/** HTML des dés (le dé relancé est signalé). */
export function desHtml(valeurs, relance) {
  const marque = relance ? relance.idx : -1;
  return valeurs.map((v, i) =>
    `<span class="de-chat-die ${v >= 4 ? "de-chat-die-ok" : "de-chat-die-fail"}${i === marque ? " de-chat-die-relance" : ""}"${i === marque ? ` title="Relance d'acolyte (était ${relance.avant})"` : ""}>${v}</span>`
  ).join("");
}

/** Ligne d'explication pour la carte de chat. */
export function acolyteHtml(relance, nomDieu) {
  if (!relance) return "";
  return `<div class="de-chat-detail">✨ Acolyte (${nomDieu}) : un ${relance.avant} relancé → <strong>${relance.apres}</strong>${relance.apres >= 4 ? " (succès !)" : ""}</div>`;
}
