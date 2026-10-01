// ============================================================
// EXPÉRIENCE DE FIN DE SCÉNARIO — Livret des héros p. 14
// Le héros reçoit 2 points (sur une ou deux Dévotions), son dieu 2 points à donner aux héros
// (sur la Dévotion envers lui). Quand l'expérience d'une Dévotion atteint 3 × sa valeur,
// la Dévotion monte de 1 et cette expérience est effacée. Un point peut aussi réduire
// de 1 la force d'une malédiction (Livret des dieux p. 10).
// ============================================================
import { majActeur } from "./relais.mjs";

const { DialogV2 } = foundry.applications.api;
const DEV_MAX = 10;

function dieux() { return CONFIG.DIEUX?.gods ?? []; }
function nomDieu(id) { return dieux().find(g => g.id === id)?.name ?? id; }

/** Calcule (sans l'appliquer) l'effet de n points d'expérience sur une Dévotion. */
export function calculerXP(actor, godId, n = 1) {
  let dev = Number(actor.system.devotions?.[godId] ?? 0);
  let xp  = Number(actor.system.xpDevotions?.[godId] ?? 0) + n;
  let monte = 0;
  while (dev < DEV_MAX && xp >= 3 * Math.max(1, dev)) { dev += 1; xp = 0; monte += 1; }
  return { dev, xp, monte };
}

/** Ajoute de l'expérience à une Dévotion (via le MJ si besoin) et renvoie le résultat. */
export async function ajouterXP(actor, godId, n = 1) {
  const r = calculerXP(actor, godId, n);
  await majActeur(actor, { [`system.devotions.${godId}`]: r.dev, [`system.xpDevotions.${godId}`]: r.xp });
  return r;
}

function ligneResultat(actor, godId, r) {
  return r.monte
    ? `<li><strong>${actor.name}</strong> — ${nomDieu(godId)} : <span class="de-success">Dévotion ${r.dev} !</span></li>`
    : `<li><strong>${actor.name}</strong> — ${nomDieu(godId)} : ${r.xp} / ${3 * Math.max(1, r.dev)} XP</li>`;
}

async function carte(speakerActor, titre, lignes) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: speakerActor }),
    content: `<div class="de-chat-attaque de-chat-divin"><h3><i class="fas fa-graduation-cap"></i> ${titre}</h3>
      <ul class="de-chat-xp">${lignes.join("")}</ul></div>`
  });
}

const choixHtml = (name, options) => `
  <div class="de-atk-row">
    <div class="de-atk-label"><i class="fas fa-star"></i> ${name === "p1" ? "Premier point" : "Second point"}</div>
    <select name="${name}" class="de-xp-select">${options}</select>
  </div>`;

/** Fenêtre du héros : 2 points à placer sur ses Dévotions (ou pour réduire une malédiction). */
export async function finDeScenarioHeros(actor) {
  const devs = actor.system.devotions ?? {};
  const xps  = actor.system.xpDevotions ?? {};
  const maled = actor.items.filter(i => i.type === "malediction" && i.system.force > 0);
  const options = dieux().map(g => {
    const d = Number(devs[g.id] ?? 0);
    return `<option value="dev:${g.id}">${g.name} — Dévotion ${d} (${xps[g.id] ?? 0}/${3 * Math.max(1, d)} XP)</option>`;
  }).join("") + maled.map(m =>
    `<option value="mal:${m.id}">Réduire « ${m.name} » (force ${m.system.force})</option>`).join("");

  const res = await DialogV2.prompt({
    window: { title: `Fin de scénario — ${actor.name}`, icon: "fas fa-graduation-cap" },
    classes: ["de-dialog-attaque"],
    position: { width: 480 },
    content: `<div class="de-atk de-divin">
      <p class="de-divin-cout">Votre héros reçoit <strong>2 points d'expérience</strong> : sur une seule Dévotion ou sur deux.
        Une Dévotion monte de 1 quand son expérience atteint 3 fois sa valeur. Un point peut aussi réduire une malédiction.</p>
      ${choixHtml("p1", options)}${choixHtml("p2", options)}</div>`,
    ok: { label: "Attribuer les 2 points", icon: "fas fa-check",
          callback: (ev, button) => [button.form.querySelector("[name=p1]").value, button.form.querySelector("[name=p2]").value] },
    rejectClose: false
  });
  if (!res) return;

  // Regrouper les points par cible (2 points sur la même Dévotion = +2 d'un coup)
  const compte = res.reduce((m, v) => (m[v] = (m[v] ?? 0) + 1, m), {});
  const lignes = [];
  for (const [cible, n] of Object.entries(compte)) {
    const [type, id] = cible.split(":");
    if (type === "dev") lignes.push(ligneResultat(actor, id, await ajouterXP(actor, id, n)));
    else {
      const item = actor.items.get(id);
      if (!item) continue;
      const force = Math.max(0, item.system.force - n);
      if (force <= 0) { await item.delete(); lignes.push(`<li>« ${item.name} » est levée.</li>`); }
      else { await item.update({ "system.force": force }); lignes.push(`<li>« ${item.name} » : force ${force}.</li>`); }
    }
  }
  return carte(actor, `Fin de scénario — ${actor.name}`, lignes);
}

/** Fenêtre du dieu : 2 points à donner aux héros, sur leur Dévotion envers lui. */
export async function finDeScenarioDieu(dieu) {
  const domaine = dieu.system.domaine ?? "champs-de-bataille";
  const tous = game.actors.filter(a => a.type === "heros");
  const joueurs = tous.filter(a => a.hasPlayerOwner);
  const heros = joueurs.length ? joueurs : tous;
  if (!heros.length) return ui.notifications.warn("Aucun héros dans le monde.");
  const options = heros.map(a => {
    const d = Number(a.system.devotions?.[domaine] ?? 0);
    return `<option value="${a.id}">${a.name} — Dévotion ${d} (${a.system.xpDevotions?.[domaine] ?? 0}/${3 * Math.max(1, d)} XP)</option>`;
  }).join("");

  const res = await DialogV2.prompt({
    window: { title: `Fin de scénario — ${dieu.name}`, icon: "fas fa-graduation-cap" },
    classes: ["de-dialog-attaque"],
    position: { width: 480 },
    content: `<div class="de-atk de-divin">
      <p class="de-divin-cout">${dieu.name} accorde <strong>2 points d'expérience</strong> : les deux à un héros, ou un à chacun de deux héros.
        Ils s'ajoutent à leur Dévotion envers ${nomDieu(domaine)}.</p>
      ${choixHtml("p1", options)}${choixHtml("p2", options)}</div>`,
    ok: { label: "Accorder les 2 points", icon: "fas fa-check",
          callback: (ev, button) => [button.form.querySelector("[name=p1]").value, button.form.querySelector("[name=p2]").value] },
    rejectClose: false
  });
  if (!res) return;
  const compte = res.reduce((m, v) => (m[v] = (m[v] ?? 0) + 1, m), {});
  const lignes = [];
  for (const [id, n] of Object.entries(compte)) {
    const a = game.actors.get(id);
    if (a) lignes.push(ligneResultat(a, domaine, await ajouterXP(a, domaine, n)));
  }
  return carte(dieu, `${dieu.name} récompense ses fidèles`, lignes);
}
