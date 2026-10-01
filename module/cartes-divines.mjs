// ============================================================
// CARTES DIVINES PARTAGÉES — Dieux Ennemis
//  · Miracle : aide et entrave des autres dieux (Livret des dieux p. 7-8)
//  · Champion : canaliser un miracle, interférence doublée (p. 11-12)
//  · Contestation de domaine et convocation divine (p. 3-5)
// Chaque carte garde son état dans les flags du message ; les clics des joueurs passent
// par le MJ connecté (relais.mjs → operation), qui les applique un par un.
// ============================================================
import { enregistrerOperation, operation } from "./relais.mjs";

const { DialogV2 } = foundry.applications.api;
const SYS = () => game.system.id;

// ── Outils ────────────────────────────────────────────────────
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pluriel = (n, mot, pl = mot + "s") => `${n} ${n > 1 ? pl : mot}`;
const divinite = d => Number(d?.system?.divinite?.value ?? 0);
const domaineDe = d => d?.system?.domaine ?? "champs-de-bataille";

/** Dieux que l'utilisateur contrôle (le MJ les contrôle tous). */
function mesDieux(user = game.user) {
  return game.actors.filter(a => a.type === "dieu" && a.testUserPermission(user, "OWNER"));
}

/** Champion d'un dieu parmi les héros (Dévotion ≥ 6 envers son domaine). */
export function championDe(dieuOuDomaine) {
  const dom = typeof dieuOuDomaine === "string" ? dieuOuDomaine : domaineDe(dieuOuDomaine);
  return game.actors.filter(a => a.type === "heros")
    .map(a => ({ a, dev: Number(a.system.devotions?.[dom] ?? 0) }))
    .filter(x => x.dev >= 6)
    .sort((x, y) => y.dev - x.dev)[0]?.a ?? null;
}

async function ecrireCarte(message, cle, etat, html) {
  return message.update({ content: html(etat), [`flags.${SYS()}.${cle}`]: etat });
}

function choixDieu(liste, name = "dieuId") {
  return `<select name="${name}">${liste.map(d => `<option value="${d.id}">${esc(d.name)} (${divinite(d)} Divinité)</option>`).join("")}</select>`;
}

// ════════════════════════════════════════════════════════════
// MIRACLE
// ════════════════════════════════════════════════════════════

/** Dés par point pour un dieu qui intervient : Dévotion du héros ciblé envers lui (1 si aucun héros). */
function desParPoint(etat, dieu) {
  if (!etat.herosId) return 1;
  const h = game.actors.get(etat.herosId);
  return Number(h?.system?.devotions?.[domaineDe(dieu)] ?? 0);
}

/** Coût par point d'une intervention (×2 si moins de Divinité que le lanceur avant le miracle ; ×2 pour entraver au détriment de son champion). */
function coutParPoint(etat, dieu, sens) {
  let c = 1;
  if (divinite(dieu) < etat.diviniteAvant) c *= 2;
  if (sens < 0 && etat.cibleChampion) c *= 2;
  return c;
}

function totalMiracle(etat) {
  return Math.max(0, etat.desBase + etat.interventions.reduce((t, i) => t + i.sens * i.des, 0));
}

function htmlMiracle(e) {
  const lignes = e.interventions.map(i =>
    `<li class="${i.sens > 0 ? "de-aide" : "de-entrave"}">${i.sens > 0 ? "＋" : "−"} <strong>${esc(i.nom)}</strong> ${i.sens > 0 ? "aide" : "entrave"} :
      ${i.sens > 0 ? "+" : "−"}${pluriel(i.des, "dé")} <small>(${pluriel(i.cout, "pt")})</small></li>`).join("");
  const total = totalMiracle(e);
  const res = e.resultat;
  const ampleur = { 5: "petite intervention", 7: "intervention majeure", 10: "intervention importante" }[e.diff] ?? "";
  return `
<div class="de-chat-attaque de-chat-divin de-miracle-carte">
  <h3><i class="fas fa-sun"></i> Miracle de ${esc(e.dieuNom)}${e.herosNom ? ` pour ${esc(e.herosNom)}` : ""}</h3>
  ${e.texte ? `<p class="de-miracle-texte">« ${esc(e.texte)} »</p>` : ""}
  <div class="de-chat-info">
    <span>Base : <strong>${pluriel(e.desBase, "dé")}</strong></span>
    <span>Diff. : <strong>${e.diff}</strong>${ampleur ? ` <small>(${ampleur})</small>` : ""}</span>
    <span>Total : <strong>${pluriel(total, "dé")}</strong></span>
  </div>
  <div class="de-chat-detail">${e.detail}</div>
  ${e.cibleChampion ? `<div class="de-chat-detail">👑 ${esc(e.herosNom)} est le champion de ${esc(e.dieuNom)} : l'entraver coûte le double.</div>` : ""}
  ${lignes ? `<ul class="de-miracle-interventions">${lignes}</ul>` : ""}
  ${e.statut === "attente" ? `
  <p class="de-chat-sub"><em>Les autres dieux peuvent aider ou entraver ce miracle (une fois chacun), puis ${esc(e.dieuNom)} le lance.</em></p>
  <div class="de-btn-row de-miracle-btns">
    <button type="button" data-de-miracle="aider"><i class="fas fa-hand-holding-heart"></i> Aider</button>
    <button type="button" data-de-miracle="entraver"><i class="fas fa-hand"></i> Entraver</button>
  </div>
  <div class="de-btn-row de-miracle-btns">
    <button type="button" data-de-miracle="lancer"><i class="fas fa-dice"></i> Lancer le miracle</button>
    <button type="button" data-de-miracle="annuler"><i class="fas fa-times"></i> Annuler</button>
  </div>` : ""}
  ${res ? `
  <div class="de-chat-info"><span>Pool : <strong>${res.des}</strong></span><span>Succès : <strong>${res.succes}</strong></span></div>
  <div class="de-chat-dice">${res.valeurs.map(v => `<span class="de-chat-die ${v >= 4 ? "de-chat-die-ok" : "de-chat-die-fail"}">${v}</span>`).join("")}</div>
  <div class="de-roll-result"><span class="${res.ok ? "de-success" : "de-failure"}">${res.ok ? "✔ Le miracle s'accomplit !" : "✘ Le miracle échoue."}</span></div>` : ""}
  ${e.statut === "annule" ? `<div class="de-roll-result"><span class="de-neutral">Miracle annulé — Divinité rendue.</span></div>` : ""}
</div>`;
}

/** Appelé par la fenêtre de miracle (dieu-actions.mjs) une fois le coût payé. */
export async function creerCarteMiracle(dieu, p) {
  const etat = {
    dieuId: dieu.id, dieuNom: dieu.name, herosId: p.herosId ?? null, herosNom: p.herosNom ?? "",
    texte: p.texte ?? "", desBase: p.des, diff: p.diff, cout: p.cout, detail: p.detail,
    diviniteAvant: p.diviniteAvant, cibleChampion: !!p.cibleChampion,
    interventions: [], statut: "attente", resultat: null
  };
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: dieu }),
    content: htmlMiracle(etat),
    flags: { [SYS()]: { miracle: etat } }
  });
}

async function cliquerMiracle(message, action) {
  const etat = message.getFlag(SYS(), "miracle");
  if (!etat || etat.statut !== "attente") return;
  const lanceur = game.actors.get(etat.dieuId);

  if (action === "aider" || action === "entraver") {
    const sens = action === "aider" ? 1 : -1;
    const dejas = new Set(etat.interventions.map(i => i.dieuId));
    const dispo = mesDieux().filter(d => d.id !== etat.dieuId && !dejas.has(d.id));
    if (!dispo.length) return ui.notifications.warn("Aucun de vos dieux ne peut encore intervenir sur ce miracle (un dieu n'intervient qu'une fois).");
    const calc = f => {
      const d = game.actors.get(f.querySelector("[name=dieuId]").value);
      const pts = Math.max(1, Number(f.querySelector("[name=pts]").value) || 1);
      const dpp = desParPoint(etat, d), cpp = coutParPoint(etat, d, sens);
      return { d, pts, dpp, cpp, des: pts * dpp, cout: pts * cpp };
    };
    const res = await DialogV2.prompt({
      window: { title: `${sens > 0 ? "Aider" : "Entraver"} le miracle de ${etat.dieuNom}`, icon: `fas ${sens > 0 ? "fa-hand-holding-heart" : "fa-hand"}` },
      classes: ["de-dialog-attaque"], position: { width: 440 },
      content: `<div class="de-atk de-divin">
        <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-sun"></i> Dieu qui intervient</div>${choixDieu(dispo)}</div>
        <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-star"></i> Points de Divinité</div><input type="number" name="pts" value="1" min="1" max="99"></div>
        <div class="de-divin-apercu"></div></div>`,
      render: (ev, dlg) => {
        const root = dlg.element.querySelector(".de-divin");
        const maj = () => { const c = calc(root);
          root.querySelector(".de-divin-apercu").innerHTML = `<p class="de-divin-cout">${sens > 0 ? "+" : "−"}<strong>${pluriel(c.des, "dé")}</strong>
            (${c.dpp} par point${etat.herosId ? ` : Dévotion de ${esc(etat.herosNom)}` : " : aucun héros ciblé"})
            pour <strong>${pluriel(c.cout, "point")}</strong>${c.cpp > 1 ? ` <small>(×${c.cpp} : ${[divinite(c.d) < etat.diviniteAvant ? "moins de Divinité que " + esc(etat.dieuNom) : "", sens < 0 && etat.cibleChampion ? "champion" : ""].filter(Boolean).join(", ")})</small>` : ""}.</p>`; };
        root.addEventListener("input", maj); root.addEventListener("change", maj); maj();
      },
      ok: { label: sens > 0 ? "Aider" : "Entraver", callback: (ev, b) => calc(b.form) },
      rejectClose: false
    });
    if (!res?.d) return;
    if (res.des <= 0) return ui.notifications.warn(`${etat.herosNom} n'a aucune Dévotion envers ${res.d.name} : son intervention ne change rien.`);
    return operation("miracle", { messageId: message.id, action: "intervenir", dieuId: res.d.id, sens, pts: res.pts });
  }

  // Lancer / annuler : le dieu du miracle ou le MJ
  if (!(lanceur?.isOwner || game.user.isGM)) return ui.notifications.warn(`Seul le joueur de ${etat.dieuNom} (ou le MJ) peut ${action === "lancer" ? "lancer" : "annuler"} ce miracle.`);
  if (action === "annuler") {
    const ok = await DialogV2.confirm({ window: { title: "Annuler le miracle" }, content: "<p>Annuler le miracle et rendre la Divinité dépensée à chaque dieu ?</p>", rejectClose: false });
    if (ok) return operation("miracle", { messageId: message.id, action: "annuler" });
    return;
  }
  return operation("miracle", { messageId: message.id, action: "lancer" });
}

enregistrerOperation("miracle", async ({ messageId, action, dieuId, sens, pts }, user) => {
  const message = game.messages.get(messageId);
  const etat = message?.getFlag(SYS(), "miracle");
  if (!etat || etat.statut !== "attente") return;
  const e = foundry.utils.deepClone(etat);

  if (action === "intervenir") {
    const d = game.actors.get(dieuId);
    if (!d || !d.testUserPermission(user, "OWNER") || d.id === e.dieuId) return;
    if (e.interventions.some(i => i.dieuId === d.id)) return;
    const n = Math.max(1, Number(pts) || 1);
    const cout = n * coutParPoint(e, d, sens), des = n * desParPoint(e, d);
    if (divinite(d) < cout) {
      game.socket.emit("system." + SYS(), { type: "info", userId: user.id, txt: `${d.name} n'a que ${divinite(d)} points de Divinité (il en faut ${cout}).` });
      if (user.isSelf) ui.notifications.warn(`${d.name} n'a que ${divinite(d)} points de Divinité (il en faut ${cout}).`);
      return;
    }
    await d.update({ "system.divinite.value": divinite(d) - cout });
    e.interventions.push({ dieuId: d.id, nom: d.name, sens: sens > 0 ? 1 : -1, pts: n, cout, des });
    return ecrireCarte(message, "miracle", e, htmlMiracle);
  }

  if (action === "annuler") {
    const lanceur = game.actors.get(e.dieuId);
    if (!(lanceur?.testUserPermission(user, "OWNER") || user.isGM)) return;
    if (lanceur) await lanceur.update({ "system.divinite.value": divinite(lanceur) + e.cout });
    for (const i of e.interventions) {
      const d = game.actors.get(i.dieuId);
      if (d) await d.update({ "system.divinite.value": divinite(d) + i.cout });
    }
    e.statut = "annule";
    return ecrireCarte(message, "miracle", e, htmlMiracle);
  }

  if (action === "lancer") {
    const lanceur = game.actors.get(e.dieuId);
    if (!(lanceur?.testUserPermission(user, "OWNER") || user.isGM)) return;
    const des = totalMiracle(e);
    let valeurs = [];
    if (des > 0) {
      const roll = new Roll(`${des}d6`);
      await roll.evaluate();
      valeurs = roll.dice[0].results.map(r => r.result);
      if (game.dice3d) game.dice3d.showForRoll(roll, user, true).catch(() => {});
    }
    const succes = valeurs.filter(v => v >= 4).length;
    e.statut = "lance";
    e.resultat = { des, valeurs, succes, ok: succes >= e.diff };
    return ecrireCarte(message, "miracle", e, htmlMiracle);
  }
});

// ════════════════════════════════════════════════════════════
// CONTESTATION DE DOMAINE / CONVOCATION DIVINE
// ════════════════════════════════════════════════════════════

export function enregistrerReglagesContestation() {
  game.settings.register(game.system.id, "convocationVariante", {
    name: "Convocation divine : règle de vote",
    hint: "Livre : chaque dieu paie 1 point de Divinité pour voter. XII Singes : vote gratuit, seul le dieu qui obtient gain de cause paie 1 point.",
    scope: "world", config: true, type: String, default: "livre",
    choices: { livre: "Livre (1 point pour voter)", xii: "Variante des XII Singes (vote gratuit, le gagnant paie 1)" }
  });
}

const variante = () => { try { return game.settings.get(game.system.id, "convocationVariante"); } catch { return "livre"; } };

function htmlContestation(e) {
  const claims = [...e.claims].sort((a, b) => b.pts - a.pts);
  const nbVotes = Object.keys(e.votes ?? {}).length;
  const lignes = claims.map(c => {
    const voix = e.phase === "close" && e.mode === "assemblee" ? Object.values(e.votes).filter(v => v === c.dieuId).length : null;
    return `<li><strong>${esc(c.nom)}</strong>${e.mode === "assemblee" ? "" : ` — ${pluriel(c.pts, "point")}`}${c.position ? ` : « ${esc(c.position)} »` : ""}${voix !== null ? ` — <strong>${pluriel(voix, "voix", "voix")}</strong>` : ""}</li>`;
  }).join("");
  const regle = e.variante === "xii" ? "vote gratuit, le dieu qui l'emporte paie 1 point" : "1 point de Divinité pour voter";
  return `
<div class="de-chat-attaque de-chat-divin de-contestation-carte">
  <h3><i class="fas fa-scale-balanced"></i> ${e.mode === "assemblee" ? "Convocation divine" : "Contestation de domaine"}</h3>
  <p class="de-miracle-texte">« ${esc(e.question)} »</p>
  <ul class="de-miracle-interventions">${lignes}</ul>
  ${e.phase === "revendication" ? `
  <p class="de-chat-sub"><em>Chaque dieu peut revendiquer la question en dépensant de la Divinité. Celui qui en dépense le plus affirme son autorité — ou bien on convoque l'assemblée des dieux.</em></p>
  <div class="de-btn-row de-miracle-btns">
    <button type="button" data-de-contest="revendiquer"><i class="fas fa-hand-fist"></i> Revendiquer</button>
    <button type="button" data-de-contest="convoquer"><i class="fas fa-landmark"></i> Convoquer l'assemblée</button>
  </div>
  <div class="de-btn-row de-miracle-btns">
    <button type="button" data-de-contest="trancher"><i class="fas fa-gavel"></i> Trancher (MJ)</button>
  </div>` : ""}
  ${e.phase === "assemblee" ? `
  <p class="de-chat-sub"><em>Les mortels sont suspendus : les dieux débattent, puis votent en secret (${regle}). ${pluriel(nbVotes, "vote")} pour l'instant.</em></p>
  <div class="de-btn-row de-miracle-btns">
    <button type="button" data-de-contest="voter"><i class="fas fa-check-to-slot"></i> Voter</button>
    <button type="button" data-de-contest="clore"><i class="fas fa-gavel"></i> Clore le vote (MJ)</button>
  </div>` : ""}
  ${e.resultat ? `<div class="de-roll-result"><span class="${e.gagnant ? "de-success" : "de-neutral"}">${e.resultat}</span></div>` : ""}
</div>`;
}

/** Ouvre une contestation depuis la fiche d'un dieu (première revendication incluse). */
export async function contestation(dieu) {
  const res = await DialogV2.prompt({
    window: { title: `Contestation de domaine — ${dieu.name}`, icon: "fas fa-scale-balanced" },
    classes: ["de-dialog-attaque"], position: { width: 460 },
    content: `<div class="de-atk de-divin">
      <p class="de-divin-cout">Quand on ne sait pas à quel dieu revient une question, chacun peut dépenser de la Divinité pour la revendiquer : celui qui en dépense le plus l'emporte. On peut aussi convoquer l'assemblée des dieux et voter.</p>
      <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-question"></i> Question disputée</div>
        <input type="text" name="question" placeholder="Les trolls ont-ils le droit de reprendre leurs terres ?"></div>
      <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-comment"></i> Position de ${esc(dieu.name)}</div>
        <input type="text" name="position" placeholder="Oui : c'est justice."></div>
      <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-star"></i> Points de Divinité (0 = attendre les autres)</div>
        <input type="number" name="pts" value="1" min="0" max="99"></div></div>`,
    ok: { label: "Ouvrir la contestation", icon: "fas fa-scale-balanced", callback: (ev, b) => ({
      question: b.form.querySelector("[name=question]").value.trim() || "Question disputée",
      position: b.form.querySelector("[name=position]").value.trim(),
      pts: Math.max(0, Number(b.form.querySelector("[name=pts]").value) || 0) }) },
    rejectClose: false
  });
  if (!res) return;
  if (res.pts > divinite(dieu)) return ui.notifications.warn(`${dieu.name} n'a que ${divinite(dieu)} points de Divinité.`);
  if (res.pts) await dieu.update({ "system.divinite.value": divinite(dieu) - res.pts });
  const etat = { question: res.question, phase: "revendication", mode: "enchere", variante: variante(),
    claims: res.pts || res.position ? [{ dieuId: dieu.id, nom: dieu.name, pts: res.pts, position: res.position }] : [],
    votes: {}, resultat: "", gagnant: null };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: dieu }), content: htmlContestation(etat),
    flags: { [SYS()]: { contestation: etat } } });
}

async function cliquerContestation(message, action) {
  const e = message.getFlag(SYS(), "contestation");
  if (!e) return;
  const mes = mesDieux();
  if (action === "revendiquer") {
    if (!mes.length) return ui.notifications.warn("Vous ne jouez aucun dieu.");
    const res = await DialogV2.prompt({
      window: { title: "Revendiquer la question", icon: "fas fa-hand-fist" },
      classes: ["de-dialog-attaque"], position: { width: 440 },
      content: `<div class="de-atk de-divin">
        <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-sun"></i> Dieu</div>${choixDieu(mes)}</div>
        <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-comment"></i> Position</div><input type="text" name="position"></div>
        <div class="de-atk-row"><div class="de-atk-label"><i class="fas fa-star"></i> Points de Divinité ajoutés</div><input type="number" name="pts" value="1" min="1" max="99"></div></div>`,
      ok: { label: "Revendiquer", callback: (ev, b) => ({ dieuId: b.form.querySelector("[name=dieuId]").value,
        position: b.form.querySelector("[name=position]").value.trim(), pts: Math.max(1, Number(b.form.querySelector("[name=pts]").value) || 1) }) },
      rejectClose: false
    });
    if (res) return operation("contestation", { messageId: message.id, action, ...res });
    return;
  }
  if (action === "voter") {
    const deja = new Set(Object.keys(e.votes ?? {}));
    const libres = mes.filter(d => !deja.has(d.id));
    if (!libres.length) return ui.notifications.warn("Vos dieux ont déjà voté.");
    if (!e.claims.length) return ui.notifications.warn("Aucune position à départager.");
    const res = await DialogV2.prompt({
      window: { title: "Vote de l'assemblée divine", icon: "fas fa-check-to-slot" },
      classes: ["de-dialog-attaque"], position: { width: 440 },
      content: `<div class="de-atk de-divin">
        <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-sun"></i> Dieu qui vote</div>${choixDieu(libres)}</div>
        <div class="de-atk-section"><div class="de-atk-label"><i class="fas fa-check"></i> Donner raison à</div>
          <select name="pour">${e.claims.map(c => `<option value="${c.dieuId}">${esc(c.nom)}${c.position ? ` — « ${esc(c.position)} »` : ""}</option>`).join("")}</select></div>
        <p class="de-divin-cout">${e.variante === "xii" ? "Vote gratuit (le dieu qui l'emporte paiera 1 point)." : "Voter coûte 1 point de Divinité."} Le vote reste secret jusqu'à la clôture.</p></div>`,
      ok: { label: "Voter", callback: (ev, b) => ({ dieuId: b.form.querySelector("[name=dieuId]").value, pour: b.form.querySelector("[name=pour]").value }) },
      rejectClose: false
    });
    if (res) return operation("contestation", { messageId: message.id, action, ...res });
    return;
  }
  if ((action === "trancher" || action === "clore") && !game.user.isGM) return ui.notifications.warn("C'est au MJ de trancher.");
  if (action === "convoquer" && e.claims.length < 1) return ui.notifications.warn("Il faut au moins une position revendiquée.");
  return operation("contestation", { messageId: message.id, action });
}

enregistrerOperation("contestation", async ({ messageId, action, dieuId, pts, position, pour }, user) => {
  const message = game.messages.get(messageId);
  const etat = message?.getFlag(SYS(), "contestation");
  if (!etat || etat.phase === "close") return;
  const e = foundry.utils.deepClone(etat);
  const d = dieuId ? game.actors.get(dieuId) : null;
  if (d && !d.testUserPermission(user, "OWNER")) return;
  const refuser = txt => { if (user.isSelf) ui.notifications.warn(txt); else game.socket.emit("system." + SYS(), { type: "info", userId: user.id, txt }); };

  if (action === "revendiquer" && e.phase === "revendication" && d) {
    const n = Math.max(1, Number(pts) || 1);
    if (divinite(d) < n) return refuser(`${d.name} n'a que ${divinite(d)} points de Divinité.`);
    await d.update({ "system.divinite.value": divinite(d) - n });
    const c = e.claims.find(x => x.dieuId === d.id);
    if (c) { c.pts += n; if (position) c.position = position; }
    else e.claims.push({ dieuId: d.id, nom: d.name, pts: n, position: position ?? "" });
  }
  else if (action === "trancher" && user.isGM && e.phase === "revendication") {
    const max = Math.max(0, ...e.claims.map(c => c.pts));
    const tete = e.claims.filter(c => c.pts === max && max > 0);
    e.phase = "close";
    if (tete.length === 1) { e.gagnant = tete[0].dieuId; e.resultat = `⚖ ${esc(tete[0].nom)} affirme son autorité (${pluriel(max, "point")}).`; }
    else e.resultat = tete.length ? `Égalité entre ${tete.map(c => esc(c.nom)).join(" et ")} : au MJ de trancher, ou convoquez l'assemblée.` : "Personne n'a revendiqué la question : le MJ décide.";
  }
  else if (action === "convoquer" && e.phase === "revendication") {
    e.phase = "assemblee"; e.mode = "assemblee"; e.variante = variante(); e.votes = {};
  }
  else if (action === "voter" && e.phase === "assemblee" && d) {
    if (e.votes[d.id]) return;
    if (!e.claims.some(c => c.dieuId === pour)) return;
    if (e.variante !== "xii") {
      if (divinite(d) < 1) return refuser(`${d.name} n'a plus de Divinité pour voter.`);
      await d.update({ "system.divinite.value": divinite(d) - 1 });
    }
    e.votes[d.id] = pour;
  }
  else if (action === "clore" && user.isGM && e.phase === "assemblee") {
    const voix = e.claims.map(c => ({ c, n: Object.values(e.votes).filter(v => v === c.dieuId).length }));
    const max = Math.max(0, ...voix.map(v => v.n));
    const tete = voix.filter(v => v.n === max && max > 0);
    e.phase = "close";
    if (tete.length === 1) {
      const g = tete[0].c; e.gagnant = g.dieuId;
      e.resultat = `🏛 L'assemblée donne raison à ${esc(g.nom)} (${pluriel(max, "voix", "voix")}), qui obtient autorité sur la question.`;
      if (e.variante === "xii") {
        const gd = game.actors.get(g.dieuId);
        if (gd) { await gd.update({ "system.divinite.value": Math.max(0, divinite(gd) - 1) }); e.resultat += " Il paie 1 point de Divinité."; }
      }
    } else e.resultat = tete.length ? `Égalité de voix entre ${tete.map(v => esc(v.c.nom)).join(" et ")} : au MJ de trancher.` : "Aucun vote : le MJ décide.";
  }
  else return;
  return ecrireCarte(message, "contestation", e, htmlContestation);
});

// ════════════════════════════════════════════════════════════
// CHAMPION : une seule Dévotion au-dessus de 5 (Livret des dieux p. 11)
// ════════════════════════════════════════════════════════════
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "heros" || userId !== game.user.id) return;
  const nouv = foundry.utils.getProperty(changes, "system.devotions");
  if (!nouv) return;
  const devs = { ...actor.system.devotions, ...nouv };
  const montee = Object.entries(nouv).find(([, v]) => Number(v) >= 6)?.[0];
  if (!montee) return;
  const baisses = Object.entries(devs).filter(([g, v]) => g !== montee && Number(v) > 5);
  for (const [g] of baisses) foundry.utils.setProperty(changes, `system.devotions.${g}`, 5);
  const nom = id => CONFIG.DIEUX?.gods?.find(x => x.id === id)?.name ?? id;
  if (baisses.length) ui.notifications.info(`${actor.name} devient champion de ${nom(montee)} : ses autres Dévotions sont ramenées à 5.`);
  const rival = game.actors.find(a => a.type === "heros" && a.id !== actor.id && Number(a.system.devotions?.[montee] ?? 0) >= 6);
  if (rival) ui.notifications.warn(`${nom(montee)} a déjà un champion parmi les héros : ${rival.name}. Un dieu n'a qu'un champion à la fois.`);
});

// ── Boutons des cartes ────────────────────────────────────────
Hooks.on("renderChatMessageHTML", (message, html) => {
  html.querySelectorAll("[data-de-miracle]").forEach(b =>
    b.addEventListener("click", ev => { ev.preventDefault(); cliquerMiracle(message, b.dataset.deMiracle); }));
  html.querySelectorAll("[data-de-contest]").forEach(b =>
    b.addEventListener("click", ev => { ev.preventDefault(); cliquerContestation(message, b.dataset.deContest); }));
});
