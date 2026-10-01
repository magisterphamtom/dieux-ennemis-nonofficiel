// ============================================================
// ACTIONS DIVINES — Dieux Ennemis
// Livret des dieux p. 2-12 · écran du MJ « Intervention divine »
// ============================================================
import { majActeur, creerItems } from "./relais.mjs";
import { reinitialiserUsages, iconeMalediction } from "./benedictions.mjs";

const { DialogV2 } = foundry.applications.api;
const FLAG = "dieux-ennemis-nonofficiel";

// ── Outils ────────────────────────────────────────────────────

function infoDieu(dieu) {
  const domaine = dieu.system.domaine ?? "champs-de-bataille";
  const god = (CONFIG.DIEUX?.gods ?? []).find(g => g.id === domaine);
  return { domaine, nomDomaine: god?.domaine ?? domaine };
}

/** Héros du monde, avec leur Dévotion envers le domaine du dieu. */
function herosDuMonde(dieu) {
  const { domaine } = infoDieu(dieu);
  return game.actors
    .filter(a => a.type === "heros")
    .map(a => ({
      actor: a,
      devotion: Number(a.system.devotions?.[domaine] ?? 0),
      hubris: Number(a.system.hubrisNiveau ?? 0)
    }));
}

function echapper(t) {
  return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function divinite(dieu) {
  return Number(dieu.system.divinite?.value ?? 0);
}

async function depenser(dieu, cout) {
  const dispo = divinite(dieu);
  if (cout > dispo) {
    ui.notifications.warn(`${dieu.name} n'a que ${dispo} point${dispo > 1 ? "s" : ""} de Divinité (il en faut ${cout}).`);
    return false;
  }
  await dieu.update({ "system.divinite.value": dispo - cout });
  return true;
}

function optionsHeros(liste, { vide = null, filtre = null, info = h => `Dév. ${h.devotion}` } = {}) {
  const l = filtre ? liste.filter(filtre) : liste;
  return (vide ? `<option value="">${vide}</option>` : "") +
    l.map(h => `<option value="${h.actor.id}">${h.actor.name} (${info(h)})</option>`).join("");
}

function desHtml(roll) {
  return (roll.dice[0]?.results ?? []).map(r =>
    `<span class="de-chat-die ${r.result >= 4 ? "de-chat-die-ok" : "de-chat-die-fail"}">${r.result}</span>`
  ).join("");
}

async function carte(dieu, titre, icone, corps, rolls = []) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: dieu }),
    content: `
<div class="de-chat-attaque de-chat-divin">
  <h3><i class="fas ${icone}"></i> ${titre}</h3>
  ${corps}
  <p class="de-chat-sub"><em>Divinité restante : ${divinite(dieu)}</em></p>
</div>`,
    rolls
  });
}

/** Fenêtre commune : contenu + calcul en direct + bouton. */
async function fenetre({ titre, icone, contenu, apercu, valider, label }) {
  return DialogV2.prompt({
    window: { title: titre, icon: `fas ${icone}` },
    classes: ["de-dialog-attaque"],
    position: { width: 460 },
    content: `<div class="de-atk de-divin">${contenu}
      <div class="de-divin-apercu"></div></div>`,
    render: (event, d) => {
      const root = (d?.element ?? d)?.querySelector?.(".de-divin");
      if (!root) return;
      const maj = () => { root.querySelector(".de-divin-apercu").innerHTML = apercu(root); };
      root.addEventListener("input", maj);
      root.addEventListener("change", maj);
      maj();
    },
    ok: { label, callback: (event, button) => valider(button.form) },
    rejectClose: false
  });
}

const champ = (label, icone, html) => `
  <div class="de-atk-section">
    <div class="de-atk-label"><i class="fas ${icone}"></i> ${label}</div>
    ${html}
  </div>`;

const ligneNombre = (label, icone, name, val = 1, min = 1, max = 99) => `
  <div class="de-atk-row">
    <div class="de-atk-label"><i class="fas ${icone}"></i> ${label}</div>
    <input type="number" name="${name}" value="${val}" min="${min}" max="${max}">
  </div>`;

const caseDomaine = (coche = true, texte = "Dans mon domaine") => `
  <label class="de-atk-check">
    <input type="checkbox" name="domaine"${coche ? " checked" : ""}>
    <span>${texte}</span>
  </label>`;

// ── 1. Début de scénario ─────────────────────────────────────
// Livret des dieux p. 2 : Divinité conservée + somme des Dévotions des héros.
export async function nouveauScenario(dieu) {
  const { nomDomaine } = infoDieu(dieu);
  const liste = herosDuMonde(dieu);
  if (!liste.length) return ui.notifications.warn("Aucun héros dans le monde.");
  // Par défaut : seuls les héros appartenant à un joueur (les fiches de test du MJ sont ignorées).
  const auMoinsUnJoueur = liste.some(h => h.actor.hasPlayerOwner);
  const coche = h => auMoinsUnJoueur ? h.actor.hasPlayerOwner : true;
  const avant = divinite(dieu);

  const lignes = liste.map(h => `
      <label class="de-atk-check">
        <input type="checkbox" name="heros" value="${h.actor.id}" data-bonus="${h.devotion}"${coche(h) ? " checked" : ""}>
        <span>${h.actor.name}${h.actor.hasPlayerOwner ? "" : ` <small class="de-divin-pnj">(pas de joueur)</small>`}</span>
        <span class="de-atk-check-bonus">+${h.devotion}</span>
      </label>`).join("");

  const lire = f => {
    const cases = [...f.querySelectorAll("[name=heros]:checked")];
    const gain = cases.reduce((t, c) => t + (Number(c.dataset.bonus) || 0), 0);
    const detail = cases.map(c => liste.find(h => h.actor.id === c.value))
      .map(h => `${h.actor.name} ${h.devotion}`).join(", ") || "aucun héros";
    return { gain, detail };
  };

  const res = await DialogV2.prompt({
    window: { title: `Nouveau scénario — ${dieu.name}`, icon: "fas fa-sun" },
    classes: ["de-dialog-attaque"],
    position: { width: 460 },
    content: `
<div class="de-atk de-divin">
  <div class="de-atk-banner">
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Divinité actuelle</span>
      <span class="de-atk-stat-val">${avant}</span>
    </div>
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Dévotions</span>
      <span class="de-atk-stat-val de-ns-gain">+0</span>
    </div>
    <div class="de-atk-stat de-atk-pool">
      <span class="de-atk-stat-lbl">Nouveau total</span>
      <span class="de-atk-stat-val de-ns-total">${avant}</span>
    </div>
  </div>
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-users"></i> Héros qui vous vénèrent
      <span class="de-atk-hint">(Dévotion envers ${nomDomaine})</span>
    </div>
    <div class="de-atk-checklist">${lignes}</div>
  </div>
  <p class="de-divin-cout">La Divinité non dépensée est conservée et s'ajoute aux Dévotions des héros.
    Les cérémonies des prêtres et les bénédictions de ce dieu redeviennent disponibles.</p>
</div>`,
    render: (event, d) => {
      const root = (d?.element ?? d)?.querySelector?.(".de-divin");
      if (!root) return;
      const maj = () => {
        const { gain } = lire(root);
        root.querySelector(".de-ns-gain").textContent = `+${gain}`;
        root.querySelector(".de-ns-total").textContent = avant + gain;
      };
      root.addEventListener("change", maj);
      maj();
    },
    ok: { label: "Commencer le scénario", icon: "fas fa-sun", callback: (event, button) => lire(button.form) },
    rejectClose: false
  });
  if (!res) return;
  await dieu.update({ "system.divinite.value": divinite(dieu) + res.gain, [`flags.${FLAG}.ceremonies`]: [] });
  await reinitialiserUsages(infoDieu(dieu).domaine);
  return carte(dieu, `Nouveau scénario — ${dieu.name}`, "fa-sun",
    `<div class="de-chat-detail">${res.detail}</div>
     <div class="de-roll-result"><span class="de-success">+${res.gain} points de Divinité</span></div>`);
}

// ── 2. Autorité divine ───────────────────────────────────────
// Livret des dieux p. 3 : 1 point pour répondre à une question relevant du domaine.
export async function autorite(dieu) {
  const res = await fenetre({
    titre: `Autorité divine — ${dieu.name}`, icone: "fa-gavel", label: "Affirmer (1 pt)",
    contenu: champ("Question / réponse", "fa-comment",
      `<input type="text" name="texte" placeholder="Qui a l'avantage ? — L'armée de la Lune jaune.">`),
    apercu: () => `<p class="de-divin-cout">Coût : <strong>1</strong> point de Divinité. Si le MJ met son veto, le point est rendu.</p>`,
    valider: f => ({ texte: f.querySelector("[name=texte]").value.trim() })
  });
  if (!res || !await depenser(dieu, 1)) return;
  return carte(dieu, `${dieu.name} affirme son autorité`, "fa-gavel",
    res.texte ? `<p>« ${echapper(res.texte)} »</p>` : "");
}

// ── 3. Inspiration divine ────────────────────────────────────
// Livret des dieux p. 6 : dans le domaine, 1 pt = Dévotion du héros en dés ; hors domaine, 1 pt = 1 dé.
export async function inspirer(dieu) {
  const liste = herosDuMonde(dieu);
  if (!liste.length) return ui.notifications.warn("Aucun héros dans le monde.");
  const calc = f => {
    const h = liste.find(x => x.actor.id === f.querySelector("[name=heros]").value);
    const pts = Math.max(1, Number(f.querySelector("[name=points]").value) || 1);
    const dom = f.querySelector("[name=domaine]").checked;
    return { h, pts, dom, des: dom ? pts * (h?.devotion ?? 0) : pts };
  };
  const res = await fenetre({
    titre: `Inspiration divine — ${dieu.name}`, icone: "fa-feather", label: "Inspirer",
    contenu: champ("Héros inspiré", "fa-user", `<select name="heros">${optionsHeros(liste)}</select>`)
      + caseDomaine(true, "L'action relève de mon domaine")
      + ligneNombre("Points de Divinité dépensés", "fa-star", "points"),
    apercu: r => { const c = calc(r);
      return `<p class="de-divin-cout">${c.pts} pt${c.pts > 1 ? "s" : ""} → <strong>${c.des} dé${c.des > 1 ? "s" : ""}</strong> en plus
        ${c.dom ? `(${c.pts} × Dévotion ${c.h?.devotion ?? 0})` : "(hors domaine : 1 dé par point)"}.<br>
        <em>Les dés s'ajoutent automatiquement au prochain jet du héros.</em></p>`; },
    valider: calc
  });
  if (!res?.h) return;
  if (res.des <= 0) return ui.notifications.warn(`${res.h.actor.name} n'a aucune Dévotion envers ce dieu : hors domaine, 1 dé par point.`);
  if (!await depenser(dieu, res.pts)) return;
  const liste2 = [...(res.h.actor.getFlag(FLAG, "inspiration") ?? []), { dieuNom: dieu.name, des: res.des }];
  await majActeur(res.h.actor, { [`flags.${FLAG}.inspiration`]: liste2 });
  return carte(dieu, `${dieu.name} inspire ${res.h.actor.name}`, "fa-feather",
    `<div class="de-roll-result"><span class="de-success">+${res.des} dé${res.des > 1 ? "s" : ""} pour son prochain jet</span></div>
     <div class="de-chat-detail">${res.pts} point${res.pts > 1 ? "s" : ""} de Divinité${res.dom ? "" : " (hors domaine)"}</div>`);
}

// ── 4. Miracle ───────────────────────────────────────────────
// Livret des dieux p. 7-8 : 1 pt = Dévotion du héros ciblé en dés (1 dé sans héros) ;
// hors domaine, coût doublé ; aide/entrave des autres dieux ; difficulté 5 / 7 / 10.
export async function miracle(dieu) {
  const liste = herosDuMonde(dieu);
  const calc = f => {
    const id = f.querySelector("[name=heros]").value;
    const h = liste.find(x => x.actor.id === id) ?? null;
    const pts = Math.max(1, Number(f.querySelector("[name=points]").value) || 1);
    const dom = f.querySelector("[name=domaine]").checked;
    const autres = Number(f.querySelector("[name=autres]").value) || 0;
    const diff = Number(f.querySelector("[name=diff]").value) || 5;
    const base = h ? pts * h.devotion : pts;
    return { h, pts, dom, autres, diff, cout: dom ? pts : pts * 2, des: Math.max(0, base + autres) };
  };
  const res = await fenetre({
    titre: `Miracle — ${dieu.name}`, icone: "fa-sun", label: "Accomplir le miracle",
    contenu: champ("Héros ciblé", "fa-user",
        `<select name="heros">${optionsHeros(liste, { vide: "— Aucun héros ciblé (1 dé par point) —" })}</select>`)
      + caseDomaine(true, "Le miracle relève de mon domaine")
      + ligneNombre("Points de Divinité (base)", "fa-star", "points")
      + champ("Ampleur", "fa-mountain", `<select name="diff">
          <option value="5">Petite intervention (5)</option>
          <option value="7">Intervention majeure (7)</option>
          <option value="10">Intervention importante (10)</option></select>`)
      + ligneNombre("Dés ajoutés (+) ou retirés (−) par d'autres dieux", "fa-people-arrows", "autres", 0, -99, 99),
    apercu: r => { const c = calc(r);
      return `<p class="de-divin-cout">Coût : <strong>${c.cout}</strong> point${c.cout > 1 ? "s" : ""}${c.dom ? "" : " (doublé hors domaine)"}
        → <strong>${c.des} dé${c.des > 1 ? "s" : ""}</strong>, difficulté ${c.diff}.</p>`; },
    valider: calc
  });
  if (!res) return;
  if (res.des <= 0) return ui.notifications.warn("Aucun dé à lancer pour ce miracle.");
  if (!await depenser(dieu, res.cout)) return;
  const roll = new Roll(`${res.des}d6cs>=4`);
  await roll.evaluate();
  const ok = roll.total >= res.diff;
  return carte(dieu, `Miracle de ${dieu.name}${res.h ? ` pour ${res.h.actor.name}` : ""}`, "fa-sun",
    `<div class="de-chat-info"><span>Pool : <strong>${res.des}</strong></span><span>Diff. : <strong>${res.diff}</strong></span><span>Succès : <strong>${roll.total}</strong></span></div>
     <div class="de-chat-dice">${desHtml(roll)}</div>
     <div class="de-roll-result"><span class="${ok ? "de-success" : "de-failure"}">${ok ? "✔ Le miracle s'accomplit !" : "✘ Le miracle échoue."}</span></div>
     <div class="de-chat-detail">${res.cout} point${res.cout > 1 ? "s" : ""} de Divinité${res.autres ? ` · ${res.autres > 0 ? "+" : ""}${res.autres} dés d'autres dieux` : ""}</div>`,
    [roll]);
}

// ── 5. Malédiction ───────────────────────────────────────────
// Livret des dieux p. 8-9 : 1 pt = Hubris du héros en dés ; réussite si succès > Dévotion envers ce dieu ;
// force = nombre de succès ; en général 1 dé de pénalité dans le domaine du dieu.
export async function maudire(dieu) {
  const { domaine, nomDomaine } = infoDieu(dieu);
  const liste = herosDuMonde(dieu);
  if (!liste.length) return ui.notifications.warn("Aucun héros dans le monde.");
  const calc = f => {
    const h = liste.find(x => x.actor.id === f.querySelector("[name=heros]").value);
    const pts = Math.max(1, Number(f.querySelector("[name=points]").value) || 1);
    return { h, pts, des: pts * (h?.hubris ?? 0), effet: f.querySelector("[name=effet]").value.trim() };
  };
  const res = await fenetre({
    titre: `Malédiction — ${dieu.name}`, icone: "fa-skull", label: "Maudire",
    contenu: champ("Héros maudit", "fa-user",
        `<select name="heros">${optionsHeros(liste, { info: h => `Hubris ${h.hubris}, Dév. ${h.devotion}` })}</select>`)
      + ligneNombre("Points de Divinité dépensés", "fa-star", "points")
      + champ("Effet", "fa-scroll",
        `<input type="text" name="effet" value="1 dé de pénalité pour les actions du domaine ${nomDomaine}">`),
    apercu: r => { const c = calc(r);
      return `<p class="de-divin-cout">${c.pts} pt${c.pts > 1 ? "s" : ""} × Hubris ${c.h?.hubris ?? 0} → <strong>${c.des} dé${c.des > 1 ? "s" : ""}</strong>.
        Il faut <strong>plus de ${c.h?.devotion ?? 0}</strong> succès (Dévotion du héros envers vous).</p>`; },
    valider: calc
  });
  if (!res?.h) return;
  if (res.des <= 0) return ui.notifications.warn(`${res.h.actor.name} n'a pas d'Hubris : la malédiction n'a aucune prise.`);
  if (!await depenser(dieu, res.pts)) return;
  const roll = new Roll(`${res.des}d6cs>=4`);
  await roll.evaluate();
  const force = roll.total;
  const ok = force > res.h.devotion;
  if (ok) {
    await creerItems(res.h.actor, [{
      name: `Malédiction de ${dieu.name}`,
      type: "malediction",
      img: iconeMalediction(domaine),
      system: { dieuSource: domaine, force, malusDes: 1, effet: `<p>${echapper(res.effet)}</p>` }
    }]);
  }
  return carte(dieu, `${dieu.name} maudit ${res.h.actor.name}`, "fa-skull",
    `<div class="de-chat-info"><span>Pool : <strong>${res.des}</strong></span><span>Seuil : <strong>&gt; ${res.h.devotion}</strong></span><span>Succès : <strong>${force}</strong></span></div>
     <div class="de-chat-dice">${desHtml(roll)}</div>
     <div class="de-roll-result">${ok
       ? `<span class="de-failure">☠ Malédiction réussie — force ${force}</span>`
       : `<span class="de-neutral">La malédiction glisse sur ${res.h.actor.name}.</span>`}</div>
     ${ok ? `<div class="de-chat-detail">${res.effet}<br>Le joueur peut choisir de baisser de 1 sa Dévotion envers ${dieu.name}.
       Pour s'en défaire : 1 point d'expérience ou 1 point d'Hubris = −1 de force.</div>` : ""}`,
    [roll]);
}

// ── 6. Soins ─────────────────────────────────────────────────
// Livret des héros p. 26 : 1 point de Divinité soigne toutes les blessures d'un héros.
export async function soigner(dieu) {
  const liste = herosDuMonde(dieu);
  if (!liste.length) return ui.notifications.warn("Aucun héros dans le monde.");
  const res = await fenetre({
    titre: `Soins divins — ${dieu.name}`, icone: "fa-heart", label: "Soigner (1 pt)",
    contenu: champ("Héros soigné", "fa-user", `<select name="heros">${optionsHeros(liste,
      { info: h => `${h.actor.system.blessures?.value ?? 0} blessure${(h.actor.system.blessures?.value ?? 0) > 1 ? "s" : ""}` })}</select>`),
    apercu: () => `<p class="de-divin-cout">Coût : <strong>1</strong> point — toutes les blessures disparaissent.
      Un héros à 10 blessures s'effondre si aucun dieu ne dépense ce point.</p>`,
    valider: f => liste.find(x => x.actor.id === f.querySelector("[name=heros]").value)
  });
  if (!res || !await depenser(dieu, 1)) return;
  const avant = Number(res.actor.system.blessures?.value ?? 0);
  await majActeur(res.actor, { "system.blessures.value": 0 });
  return carte(dieu, `${dieu.name} soigne ${res.actor.name}`, "fa-heart",
    `<div class="de-roll-result"><span class="de-success">${avant} blessure${avant > 1 ? "s" : ""} → 0</span></div>`);
}

// ── 7. Cérémonie d'un prêtre ─────────────────────────────────
// Livret des dieux p. 11 : prêtre (Dévotion ≥ 5), une fois par scénario ;
// le dieu gagne autant de Divinité que la Dévotion du prêtre. Le prêtre est épuisé.
export async function ceremonie(dieu) {
  const faites = dieu.getFlag(FLAG, "ceremonies") ?? [];
  const pretres = herosDuMonde(dieu).filter(h => h.devotion >= 5 && !faites.includes(h.actor.id));
  if (!pretres.length) return ui.notifications.info("Aucun prêtre disponible (Dévotion 5+, une cérémonie par scénario).");
  const res = await fenetre({
    titre: `Cérémonie — ${dieu.name}`, icone: "fa-fire-flame-curved", label: "Célébrer",
    contenu: champ("Prêtre officiant", "fa-user", `<select name="heros">${optionsHeros(pretres)}</select>`),
    apercu: r => { const h = pretres.find(x => x.actor.id === r.querySelector("[name=heros]").value);
      return `<p class="de-divin-cout">Le rite dure toute la nuit : <strong>+${h?.devotion ?? 0}</strong> points de Divinité.
        Le prêtre est épuisé (avantage pour ses adversaires).</p>`; },
    valider: f => pretres.find(x => x.actor.id === f.querySelector("[name=heros]").value)
  });
  if (!res) return;
  await dieu.update({
    "system.divinite.value": divinite(dieu) + res.devotion,
    [`flags.${FLAG}.ceremonies`]: [...faites, res.actor.id]
  });
  return carte(dieu, `Cérémonie de ${res.actor.name}`, "fa-fire-flame-curved",
    `<div class="de-roll-result"><span class="de-success">+${res.devotion} points de Divinité pour ${dieu.name}</span></div>
     <div class="de-chat-detail">${res.actor.name} est épuisé par la nuit de rites.</div>`);
}

export const ACTIONS_DIVINES = { nouveauScenario, autorite, inspirer, miracle, maudire, soigner, ceremonie };
