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

// ── Coût d'attribution / de révocation (Livret des dieux p. 10-12) ──
// Attribuer : 5 points de Divinité (3 si le héros est le champion du dieu, Dévotion ≥ 6). Révoquer : 5 points.

/** Acteur Dieu qui gouverne ce domaine (s'il existe dans le monde). */
function dieuDuDomaine(dieuId) {
  return game.actors.find(a => a.type === "dieu" && a.system.domaine === dieuId) ?? null;
}

async function choisirDebit(titre, texte, cout, dieu) {
  const { DialogV2 } = foundry.applications.api;
  const dispo = Number(dieu.system.divinite?.value ?? 0);
  return DialogV2.wait({
    window: { title: titre, icon: "fas fa-hands-praying" },
    classes: ["de-dialog-attaque"],
    position: { width: 440 },
    content: `<div class="de-atk de-divin"><p class="de-divin-cout">${texte}<br>
      <strong>${dieu.name}</strong> dépense <strong>${cout} points de Divinité</strong> (${dispo} disponibles).</p></div>`,
    buttons: [
      { action: "debiter", label: `Débiter ${cout} points`, icon: "fas fa-check", default: true, disabled: dispo < cout },
      { action: "gratuit", label: "Sans débiter", icon: "fas fa-feather" },
      { action: "annuler", label: "Annuler", icon: "fas fa-times" }
    ],
    rejectClose: false
  }).then(choix => (choix === "debiter" && dispo < cout) ? "annuler" : choix);
}

/** Ajoute une bénédiction au héros en proposant de débiter le dieu concerné. Renvoie false si annulé. */
export async function accorderBenediction(actor, itemData) {
  const dieuId = itemData.system?.dieuSource;
  const dieu = dieuDuDomaine(dieuId);
  if (dieu && actor.type === "heros") {
    const champion = Number(actor.system.devotions?.[dieuId] ?? 0) >= 6;
    const cout = champion ? 3 : 5;
    const choix = await choisirDebit(`Accorder « ${itemData.name} »`,
      `${actor.name} reçoit une bénédiction de ${dieu.name}${champion ? " (son champion : coût réduit)" : ""}.`, cout, dieu);
    if (!choix || choix === "annuler") return false;
    if (choix === "debiter") {
      await majActeur(dieu, { "system.divinite.value": Number(dieu.system.divinite?.value ?? 0) - cout });
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: dieu }),
        content: `<div class="de-chat-attaque de-chat-divin"><h3><i class="fas fa-hands-praying"></i> ${dieu.name} bénit ${actor.name}</h3>
          <div class="de-roll-result"><span class="de-success">« ${itemData.name} »</span></div>
          <p class="de-chat-sub"><em>${cout} points de Divinité dépensés</em></p></div>` });
    }
  }
  await actor.createEmbeddedDocuments("Item", [itemData]);
  return true;
}

/** Retire une bénédiction en proposant la révocation payante par le dieu concerné. */
export async function revoquerBenediction(actor, item) {
  const dieu = dieuDuDomaine(item.system.dieuSource);
  if (dieu && actor.type === "heros") {
    const choix = await choisirDebit(`Révoquer « ${item.name} »`,
      `${dieu.name} retire sa bénédiction à ${actor.name}.`, 5, dieu);
    if (!choix || choix === "annuler") return;
    if (choix === "debiter") {
      await majActeur(dieu, { "system.divinite.value": Number(dieu.system.divinite?.value ?? 0) - 5 });
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: dieu }),
        content: `<div class="de-chat-attaque de-chat-divin"><h3><i class="fas fa-hand"></i> ${dieu.name} révoque une bénédiction</h3>
          <div class="de-roll-result"><span class="de-failure">${actor.name} perd « ${item.name} »</span></div>
          <p class="de-chat-sub"><em>5 points de Divinité dépensés</em></p></div>` });
    }
  }
  return item.delete();
}
