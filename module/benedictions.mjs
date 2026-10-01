// ============================================================
// BÉNÉDICTIONS — limite d'usage par scénario (Livret des dieux p. 10)
// Par scénario, un héros peut invoquer autant de bénédictions d'un dieu que sa Dévotion
// envers ce dieu (toutes bénédictions de ce dieu confondues). Les bénédictions permanentes
// (vœux, effets toujours actifs) ne comptent pas. Compteur : drapeau « usagesBenedictions ».
// ============================================================
import { majActeur } from "./relais.mjs";

const FLAG = "dieux-ennemis-nonofficiel";

function tousLesDieux() {
  return [...(CONFIG.DIEUX?.gods ?? []), ...(CONFIG.DIEUX?.dechus ?? [])];
}

/** Limite par scénario pour un dieu (null = non suivie, ex. dieux déchus). */
export function limiteBenedictions(actor, dieuId) {
  const sept = (CONFIG.DIEUX?.gods ?? []).some(g => g.id === dieuId);
  if (!sept || actor.type !== "heros") return null;
  return Number(actor.system.devotions?.[dieuId] ?? 0);
}

export function usagesBenedictions(actor, dieuId) {
  return Number(actor.getFlag(FLAG, "usagesBenedictions")?.[dieuId] ?? 0);
}

/** Invoque une bénédiction : vérifie la limite, compte l'usage, annonce l'effet. */
export async function invoquerBenediction(actor, item) {
  const dieuId = item.system.dieuSource;
  const dieu   = tousLesDieux().find(g => g.id === dieuId);
  const limite = item.system.permanente ? null : limiteBenedictions(actor, dieuId);
  const deja   = usagesBenedictions(actor, dieuId);
  if (limite !== null && deja >= limite) {
    return ui.notifications.warn(`${actor.name} a déjà invoqué ${deja} bénédiction${deja > 1 ? "s" : ""} (${dieu?.name ?? dieuId}) ce scénario (limite : Dévotion ${limite}).`);
  }
  if (limite !== null) {
    await majActeur(actor, { [`flags.${FLAG}.usagesBenedictions.${dieuId}`]: deja + 1 });
  }
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  const effet = await TE.enrichHTML(item.system.effet ?? "", { relativeTo: item });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
<div class="de-chat-attaque de-chat-divin">
  <h3><i class="fas fa-hands-praying"></i> ${item.name}</h3>
  <div class="de-chat-detail">Bénédiction — ${dieu?.name ?? "?"}${item.system.conditions ? ` — ${item.system.conditions}` : ""}</div>
  <div class="de-chat-benediction">${effet}</div>
  ${limite !== null ? `<p class="de-chat-sub"><em>Bénédictions (${dieu?.name}) ce scénario : ${deja + 1} / ${limite}</em></p>` : ""}
</div>`
  });
}

/** Début de scénario : remet à zéro les usages des bénédictions d'un dieu chez tous les héros. */
export async function reinitialiserUsages(dieuId) {
  for (const a of game.actors.filter(x => x.type === "heros")) {
    if (usagesBenedictions(a, dieuId) > 0) {
      await majActeur(a, { [`flags.${FLAG}.usagesBenedictions.${dieuId}`]: 0 });
    }
  }
}

/** Icône de malédiction du dieu (assets/maledictions/malediction-<domaine>.svg). */
export function iconeMalediction(dieuId) {
  const sept = (CONFIG.DIEUX?.gods ?? []).some(g => g.id === dieuId);
  return sept ? `systems/${game.system.id}/assets/maledictions/malediction-${dieuId}.svg` : "icons/svg/skull.svg";
}
