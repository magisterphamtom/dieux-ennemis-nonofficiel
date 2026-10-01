// ============================================================
// BONUS DIVINS DANS LES JETS — Dieux Ennemis
//  • Inspiration divine en attente (drapeau posé par un dieu) : dés en plus, consommés au jet.
//  • Malédictions (objets « malediction ») : dés de pénalité dans le domaine du dieu (Livret des dieux p. 9).
// ============================================================
import { majActeur } from "./relais.mjs";

const FLAG = "dieux-ennemis-nonofficiel";

/** HTML des cases à cocher. `domaineFixe` : domaine imposé (attaque), sinon suit la source choisie. */
export function blocDivin(actor, domaineFixe = null) {
  const insp = actor.getFlag?.(FLAG, "inspiration") ?? [];
  const mal  = (actor.items ?? [])
    .filter(i => i.type === "malediction" && i.system.force > 0 && i.system.malusDes > 0
              && (!domaineFixe || i.system.dieuSource === domaineFixe));
  if (!insp.length && !mal.length) return "";
  return `
  <div class="de-atk-section de-bloc-divin">
    <div class="de-atk-label"><i class="fas fa-star"></i> Faveurs et malédictions</div>
    <div class="de-atk-checklist">
      ${insp.map((i, idx) => `
      <label class="de-atk-check">
        <input type="checkbox" name="insp" value="${idx}" data-bonus="${i.des}" checked>
        <span>Inspiration de ${i.dieuNom}</span>
        <span class="de-atk-check-bonus">+${i.des}</span>
      </label>`).join("")}
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
  if (!idxs?.length) return;
  const reste = (actor.getFlag(FLAG, "inspiration") ?? []).filter((_, i) => !idxs.includes(i));
  await majActeur(actor, { [`flags.${FLAG}.inspiration`]: reste });
}
