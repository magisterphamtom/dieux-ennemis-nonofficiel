// ============================================================
// MAGIE STELLAIRE — Arcanes du Monde p. 49-50
// Un stellaire a 1 sceau par point de magie stellaire. Pour en utiliser un, il le trace
// (durée du sceau) et lance autant de dés que de sceaux possédés contre la difficulté du sceau.
// En cas d'échec, ce sceau est inutilisable jusqu'à la nuit suivante.
// ============================================================
import { SCEAUX, sceau, peupleDe } from "./peuples.mjs";
import { majActeur } from "./relais.mjs";
import { appliquerAcolyte, desHtml } from "./acolyte.mjs";

const { DialogV2 } = foundry.applications.api;

export function estStellaire(actor) {
  return !!peupleDe(actor)?.magieStellaire;
}

export function sceauxConnus(actor) {
  return (actor.system.sceaux ?? []).map(sceau).filter(Boolean);
}

/** Vue des sceaux pour la fiche. */
export function sceauxVue(actor) {
  const epuises = new Set(actor.system.sceauxEpuises ?? []);
  const n = (actor.system.sceaux ?? []).length;
  return {
    actif: estStellaire(actor),
    liste: sceauxConnus(actor).map(s => ({ ...s, diffTxt: s.diff ?? "au choix", epuise: epuises.has(s.id) })),
    disponibles: SCEAUX.filter(s => !(actor.system.sceaux ?? []).includes(s.id)),
    nombre: n,
    xp: Number(actor.system.xpStellaire ?? 0),
    seuilXp: 3 * Math.max(1, n)
  };
}

/** Fenêtre de choix d'un nouveau sceau. Renvoie l'id ou null. */
export async function choisirSceau(actor, titre = `Nouveau sceau — ${actor.name}`) {
  const dispo = SCEAUX.filter(s => !(actor.system.sceaux ?? []).includes(s.id));
  if (!dispo.length) { ui.notifications.info(`${actor.name} connaît déjà tous les sceaux.`); return null; }
  return DialogV2.prompt({
    window: { title: titre, icon: "fas fa-star" },
    classes: ["de-dialog-attaque"],
    position: { width: 480 },
    content: `<div class="de-atk de-divin">
      <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-star"></i> Sceau appris</div>
      <select name="sceau">${dispo.map(s => `<option value="${s.id}">${s.nom} (${s.temps}, diff. ${s.diff ?? "au choix"}) — ${s.effet}</option>`).join("")}</select></div></div>`,
    ok: { label: "Apprendre", icon: "fas fa-check", callback: (ev, b) => b.form.querySelector("[name=sceau]").value },
    rejectClose: false
  });
}

export async function apprendreSceau(actor, id) {
  if (!id) return;
  await majActeur(actor, { "system.sceaux": [...(actor.system.sceaux ?? []), id] });
}

/** Points d'expérience de magie stellaire ; à 3 × le nombre de sceaux, un nouveau sceau. */
export async function ajouterXPStellaire(actor, n = 1) {
  const nb = (actor.system.sceaux ?? []).length;
  let xp = Number(actor.system.xpStellaire ?? 0) + n;
  if (xp >= 3 * Math.max(1, nb)) {
    const id = await choisirSceau(actor);
    if (id) {
      await majActeur(actor, { "system.sceaux": [...(actor.system.sceaux ?? []), id], "system.xpStellaire": 0 });
      return `<li><strong>${actor.name}</strong> — magie stellaire : <span class="de-success">nouveau sceau, ${sceau(id).nom} !</span></li>`;
    }
  }
  await majActeur(actor, { "system.xpStellaire": xp });
  return `<li><strong>${actor.name}</strong> — magie stellaire : ${xp} / ${3 * Math.max(1, nb)} XP</li>`;
}

/** Jet d'un sceau. */
export async function lancerSceau(actor, id) {
  const s = sceau(id);
  if (!s) return;
  const nb = (actor.system.sceaux ?? []).length;
  if ((actor.system.sceauxEpuises ?? []).includes(id))
    return ui.notifications.warn(`Le sceau de ${s.nom} est épuisé jusqu'à la nuit.`);

  const res = await DialogV2.prompt({
    window: { title: `Sceau de ${s.nom} — ${actor.name}`, icon: "fas fa-star" },
    classes: ["de-dialog-attaque"],
    position: { width: 440 },
    content: `<div class="de-atk de-divin">
      <p class="de-divin-cout"><strong>${s.temps}</strong> pour tracer le sceau. ${s.effet}</p>
      <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-dice"></i> Dés (1 par sceau connu)</div>
        <input type="number" name="des" value="${nb}" min="0" max="30"></div>
      <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-plus-circle"></i> Dés-avantages (situation)</div>
        <input type="number" name="desav" value="0" min="0" max="30"></div>
      <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-bullseye"></i> Difficulté${s.diff == null ? " (choisie : Blessures infligées)" : ""}</div>
        <input type="number" name="diff" value="${s.diff ?? 1}" min="1" max="15"${s.diff == null ? "" : " readonly"}></div></div>`,
    ok: { label: "Tracer le sceau", icon: "fas fa-star", callback: (ev, b) => ({
      des: Math.max(0, Number(b.form.querySelector("[name=des]").value) || 0),
      desav: Math.max(0, Number(b.form.querySelector("[name=desav]").value) || 0),
      diff: Math.max(1, Number(b.form.querySelector("[name=diff]").value) || 1) }) },
    rejectClose: false
  });
  if (!res) return;
  const total = res.des + res.desav;
  if (total <= 0) return ui.notifications.warn("Aucun dé à lancer.");
  const roll = new Roll(`${total}d6`);
  await roll.evaluate();
  const aco = await appliquerAcolyte(roll, false);
  const ok = aco.succes >= res.diff;
  const maj = {};
  if (!ok) maj["system.sceauxEpuises"] = [...(actor.system.sceauxEpuises ?? []), id];
  // Sceau d'Ara : le stellaire s'épuise (1 Blessure)
  let araTxt = "";
  if (ok && id === "ara") {
    const bl = actor.system.blessures ?? { value: 0, max: 10 };
    maj["system.blessures.value"] = Math.min(Number(bl.max ?? 10), Number(bl.value ?? 0) + 1);
    araTxt = `<div class="de-chat-detail">La cible subit <strong>${res.diff} Blessure${res.diff > 1 ? "s" : ""}</strong> ; ${actor.name} s'épuise (+1 Blessure).</div>`;
  }
  if (Object.keys(maj).length) await majActeur(actor, maj);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: aco.rolls,
    content: `<div class="de-chat-attaque de-chat-divin">
      <h3><i class="fas fa-star"></i> Sceau de ${s.nom} — ${actor.name}</h3>
      <div class="de-chat-info"><span>Pool : <strong>${total}</strong></span><span>Diff. : <strong>${res.diff}</strong></span><span>Succès : <strong>${aco.succes}</strong></span></div>
      <div class="de-chat-dice">${desHtml(aco.valeurs, aco.relance)}</div>
      <div class="de-roll-result"><span class="${ok ? "de-success" : "de-failure"}">${ok ? `✔ ${s.effet}` : "✘ Le sceau échoue : inutilisable jusqu'à la nuit."}</span></div>
      ${araTxt}</div>`
  });
}

/** La nuit tombe : tous les sceaux redeviennent utilisables. */
export async function nouvelleNuit(actor) {
  await majActeur(actor, { "system.sceauxEpuises": [] });
  ui.notifications.info(`${actor.name} : les sceaux sont de nouveau utilisables.`);
}
