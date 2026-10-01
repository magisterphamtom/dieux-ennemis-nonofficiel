// ============================================================
// BONUS DIVINS DANS LES JETS — Dieux Ennemis
//  • Inspiration divine en attente (drapeau posé par un dieu) : dés en plus, consommés au jet.
//  • Malédictions (objets « malediction ») : dés de pénalité dans le domaine du dieu (Livret des dieux p. 9).
// ============================================================
import { majActeur } from "./relais.mjs";

const FLAG = "dieux-ennemis-nonofficiel";

/**
 * Une faveur « pour ce round » (intervention de combat) porte {combat, round} : elle reste active
 * pendant tout le round du combat en cours. Sans combat lancé, elle sert une seule fois.
 */
export function pourCeRound() {
  const c = game.combat;
  return c?.started ? { combat: c.id, round: c.round } : { combat: null, round: null };
}
function estDeRound(e) { return e?.combat != null && e?.round != null; }
function estActive(e) {
  if (!estDeRound(e)) return true;
  const c = game.combat;
  return !!c && c.id === e.combat && c.round === e.round;
}

/** HTML des cases à cocher. `domaineFixe` : domaine imposé (attaque), sinon suit la source choisie. */
export function blocDivin(actor, domaineFixe = null) {
  const insp = actor.getFlag?.(FLAG, "inspiration") ?? [];
  const inspActives = insp.filter(estActive);
  const mal  = (actor.items ?? [])
    .filter(i => i.type === "malediction" && i.system.force > 0 && i.system.malusDes > 0
              && (!domaineFixe || i.system.dieuSource === domaineFixe));
  if (!inspActives.length && !mal.length) return "";
  return `
  <div class="de-atk-section de-bloc-divin">
    <div class="de-atk-label"><i class="fas fa-star"></i> Faveurs et malédictions</div>
    <div class="de-atk-checklist">
      ${insp.map((i, idx) => estActive(i) ? `
      <label class="de-atk-check">
        <input type="checkbox" name="insp" value="${idx}" data-bonus="${i.des}" checked>
        <span>${i.libelle ?? `Inspiration de ${i.dieuNom}`}${estDeRound(i) ? " <small>(ce round)</small>" : ""}</span>
        <span class="de-atk-check-bonus">+${i.des}</span>
      </label>` : "").join("")}
      ${mal.map(m => `
      <label class="de-atk-check de-atk-check-malus" data-domaine="${m.system.dieuSource}">
        <input type="checkbox" name="maled" data-malus="${m.system.malusDes}" checked>
        <span>${m.name} <small>(force ${m.system.force})</small></span>
        <span class="de-atk-check-bonus">−${m.system.malusDes}</span>
      </label>`).join("")}
    </div>
  </div>`;
}

/** Affiche seulement les malédictions du domaine choisi (fenêtre de risque). */
export function filtrerMaledictions(root, domaine) {
  root.querySelectorAll(".de-bloc-divin [data-domaine]").forEach(l => { l.hidden = l.dataset.domaine !== domaine; });
  const bloc = root.querySelector(".de-bloc-divin");
  if (bloc) bloc.hidden = ![...bloc.querySelectorAll(".de-atk-check")].some(l => !l.hidden);
}

/** Lit les cases cochées (et visibles). */
export function lireDivin(root) {
  const vis = el => !el.closest("[hidden]");
  const insp = [...root.querySelectorAll("[name=insp]:checked")].filter(vis);
  const mal  = [...root.querySelectorAll("[name=maled]:checked")].filter(vis);
  return {
    plus:  insp.reduce((t, c) => t + (Number(c.dataset.bonus) || 0), 0),
    moins: mal.reduce((t, c) => t + (Number(c.dataset.malus) || 0), 0),
    inspIdx: insp.map(c => Number(c.value))
  };
}

/** Retire les inspirations utilisées. */
export async function consommerInspirations(actor, idxs) {
  idxs = idxs ?? [];
  const avant = actor.getFlag(FLAG, "inspiration") ?? [];
  // Les faveurs « pour ce round » restent tant que le round dure ; les expirées sont nettoyées.
  const reste = avant.filter((e, i) => estActive(e) && (estDeRound(e) || !idxs.includes(i)));
  if (reste.length !== avant.length) await majActeur(actor, { [`flags.${FLAG}.inspiration`]: reste });
}

// ── Protection du défenseur (intervention de la déesse du Foyer) ──
/** Bonus de difficulté actif contre ce défenseur (0 si aucun). */
export function protectionActive(actor) {
  const p = actor?.getFlag?.(FLAG, "protection");
  return p && estActive(p) ? p : null;
}
export async function poserProtection(actor, donnees) {
  await majActeur(actor, { [`flags.${FLAG}.protection`]: { ...donnees, ...pourCeRound() } });
}
/** Après une attaque : retire une protection à usage unique (hors combat) ou expirée. */
export async function consommerProtection(actor) {
  const p = actor?.getFlag?.(FLAG, "protection");
  if (p && (!estDeRound(p) || !estActive(p))) await majActeur(actor, { [`flags.${FLAG}.-=protection`]: null });
}
/** Ajoute une faveur de dés « pour ce round » (intervention du dieu des Champs de bataille). */
export async function poserFaveurRound(actor, faveur) {
  const liste = (actor.getFlag(FLAG, "inspiration") ?? []).filter(estActive);
  await majActeur(actor, { [`flags.${FLAG}.inspiration`]: [...liste, { ...faveur, ...pourCeRound() }] });
}
