// ============================================================
// DIEUX ENNEMIS — Système de combat
// ============================================================

const { DialogV2 }           = foundry.applications.api;
import { estAcolyte, appliquerAcolyte, desHtml, acolyteHtml } from "./acolyte.mjs";
import { blocDivin, lireDivin, consommerInspirations, protectionActive, consommerProtection, poserProtection, poserFaveurRound } from "./bonus-divins.mjs";
import { majActeur } from "./relais.mjs";
const { renderTemplate }     = foundry.applications.handlebars;

// ── Types d'adversaires ──────────────────────────────────────
const TYPE_FIGURANT    = "figurant";
const TYPE_PREMIER     = "premier-role";

// ── Utilitaires ──────────────────────────────────────────────

/** Compte les succès d6 (résultat ≥ 4). */
function countSuccesses(results) {
  return results.filter(r => r >= 4).length;
}

/** Formule de pool : NdS6 qui compte les résultats ≥ 4. */
/** Nom affiché d'un dieu (CONFIG.DIEUX), pour ne rien écrire en dur. */
function nomDieu(id) {
  return (CONFIG.DIEUX?.gods ?? []).find(g => g.id === id)?.name ?? id;
}

function buildFormula(nbDes) {
  return `${Math.max(1, nbDes)}d6cs>=4`;
}

// ── Initiative ───────────────────────────────────────────────

/**
 * Lance l'initiative d'un acteur (Dévotion Champs de Bataille).
 * Si l'acteur est dans le Combat en cours, met à jour son initiative.
 */
async function rollInitiative(actor) {
  // Livret des héros p. 22 : Dévotion Champs de bataille uniquement
  const devoChamps = devoCombat(actor);
  const pool = Math.max(1, devoChamps);

  const roll = new Roll(buildFormula(pool));
  await roll.evaluate();

  // Acolyte du dieu des Champs de bataille : relance d'un échec
  const aco = await appliquerAcolyte(roll, estAcolyte(actor, "champs-de-bataille"));
  const successes = aco.succes;
  const diceHtml = desHtml(aco.valeurs, aco.relance) + acolyteHtml(aco.relance, nomDieu("champs-de-bataille"));

  // Carte de chat sombre
  const chatHtml = `
<div class="de-chat-attaque">
  <h3><i class="fas fa-running"></i> Initiative — ${actor.name}</h3>
  <div class="de-chat-info">
    <span>Pool : <strong>${pool} dé${pool > 1 ? "s" : ""}</strong></span>
    <span>Dévotion : <strong>${devoChamps}</strong></span>
  </div>
  <div class="de-chat-dice">${diceHtml}</div>
  <div class="de-roll-result">
    <span class="${successes >= 3 ? "de-success" : successes >= 1 ? "de-neutral" : "de-failure"}">
      <strong>${successes}</strong> succès — <em>${successes} action${successes > 1 ? "s" : ""} ce round</em>
    </span>
  </div>
</div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chatHtml,
    rolls: aco.rolls
  });

  // Mettre à jour l'initiative dans le combat en cours
  const combatant = game.combat?.combatants.find(c => c.actorId === actor.id);
  if (combatant) await combatant.update({ initiative: successes });

  return successes;
}

// ── Outils de lecture des acteurs ────────────────────────────

/** Dévotion Champs de bataille (les figurants ont un champ à part). */
function devoCombat(actor) {
  if (!actor) return 0;
  if (actor.type === TYPE_FIGURANT) return Number(actor.system.devotionCombat ?? 1);
  return Number(actor.system.devotions?.["champs-de-bataille"] ?? 1);
}

/** Dés-avantages acquis en combat (attaques réussies) — perdus en cas d'échec. */
function desAvAcquis(actor) {
  return Number(actor?.system?.desAvantages ?? 0);
}

/** Dés-avantages des armes/objets équipés (permanents, jamais perdus). */
function desAvEquipement(actor) {
  return (actor?.items ?? [])
    .filter(i => i.type === "equipment" && i.system.equipe)
    .reduce((t, i) => t + Number(i.system.desAvantages ?? 0), 0);
}

/** Malus de mouvement des armures équipées (règle des XII singes, Livret des héros p. 25). */
function malusArmure(actor) {
  return (actor?.items ?? [])
    .filter(i => i.type === "equipment" && i.system.equipe)
    .reduce((t, i) => t + Number(i.system.malusMouvement ?? 0), 0);
}

/** Avantages défensifs (armures, boucliers équipés). */
function avantagesDefensifs(actor) {
  return (actor?.items ?? [])
    .filter(i => i.type === "equipment" && i.system.equipe)
    .reduce((t, i) => t + Number(i.system.bonusDefensif ?? 0), 0);
}

// ── Jet d'attaque ─────────────────────────────────────────────

/**
 * Ouvre le dialog de jet d'attaque.
 * Règles (Livret des héros p. 17-24) :
 *   pool = Dévotion Champs de bataille + UN historique (le plus favorable) + dés-avantages
 *   Les dés-avantages sont des dés SUPPLÉMENTAIRES (armes, situation, attaques réussies).
 * @param {Actor} attaquant
 */
async function rollAttaque(attaquant) {
  // Cible sélectionnée dans Foundry (un seul jeton ciblé)
  const ciblesSet = game.user.targets;
  const cibleDefault = ciblesSet.size === 1 ? [...ciblesSet][0].actor : null;

  // Cibles possibles : figurants, premiers rôles, et héros (un PNJ peut attaquer un héros)
  const acteursCibles = game.actors.filter(a =>
    [TYPE_FIGURANT, TYPE_PREMIER, "heros"].includes(a.type) && a.id !== attaquant.id
  );

  const devo     = devoCombat(attaquant);
  const desEquip = desAvEquipement(attaquant);
  const desAcq   = desAvAcquis(attaquant);
  const malus    = malusArmure(attaquant);

  const historiques = (attaquant.items ?? [])
    .filter(i => i.type === "historique")
    .sort((a, b) => Number(b.system?.valeur ?? 0) - Number(a.system?.valeur ?? 0));

  const optionsHistoriques = [
    `<label class="de-atk-check">
      <input type="radio" name="historiqueId" value="" data-bonus="0" checked>
      <span>Aucun historique</span>
      <span class="de-atk-check-bonus"></span>
    </label>`,
    ...historiques.map(h => {
      const v = Number(h.system?.valeur ?? 1);
      return `<label class="de-atk-check">
      <input type="radio" name="historiqueId" value="${h.id}" data-bonus="${v}">
      <span>${h.name}</span>
      <span class="de-atk-check-bonus">+${v} dé${v > 1 ? "s" : ""}</span>
    </label>`;
    })
  ].join("");

  const typeLabel = { [TYPE_FIGURANT]: "Figurant", [TYPE_PREMIER]: "Premier Rôle", heros: "Héros" };
  const optionsCibles = acteursCibles.map(a => {
    const def = a.type === TYPE_FIGURANT ? "" : ` — Déf. ${devoCombat(a) + avantagesDefensifs(a)}`;
    const label = `${a.name} (${typeLabel[a.type]}${def})`;
    return `<option value="${a.id}"${a.id === cibleDefault?.id ? " selected" : ""}>${label}</option>`;
  }).join("");

  const content = `
<div class="de-atk" data-devo="${devo}">

  <!-- Bandeau stats : 3 cases -->
  <div class="de-atk-banner">
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Dévotion Combat</span>
      <span class="de-atk-stat-val">${devo}</span>
    </div>
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Dés-avantages</span>
      <span class="de-atk-stat-val de-atk-desav-val">0</span>
    </div>
    <div class="de-atk-stat de-atk-pool">
      <span class="de-atk-stat-lbl">Dés à lancer</span>
      <span class="de-atk-stat-val de-atk-pool-val">${devo}</span>
      <span class="de-atk-pool-detail"></span>
    </div>
  </div>

  <!-- Cible -->
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-crosshairs"></i> Qui attaques-tu ?
    </div>
    <select name="cibleId">
      <option value="">— Pas de cible définie —</option>
      ${optionsCibles}
    </select>
  </div>

  ${historiques.length > 0 ? `
  <!-- Historique : un seul, le plus favorable -->
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-scroll"></i> Historique
      <span class="de-atk-hint">(un seul, le plus favorable)</span>
    </div>
    <div class="de-atk-checklist">
      ${optionsHistoriques}
    </div>
  </div>` : ""}

  <!-- Dés-avantages -->
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-dice"></i> Dés-avantages
      <span class="de-atk-hint">(dés en plus)</span>
    </div>
    <div class="de-atk-checklist">
      ${desEquip > 0 ? `
      <label class="de-atk-check">
        <input type="checkbox" name="useEquip" data-bonus="${desEquip}" checked>
        <span>Armes et objets équipés</span>
        <span class="de-atk-check-bonus">+${desEquip}</span>
      </label>` : ""}
      ${desAcq > 0 ? `
      <label class="de-atk-check">
        <input type="checkbox" name="useAcquis" data-bonus="${desAcq}" checked>
        <span>Acquis par les attaques réussies</span>
        <span class="de-atk-check-bonus">+${desAcq}</span>
      </label>` : ""}
    </div>
    <div class="de-atk-row">
      <div class="de-atk-label">
        <i class="fas fa-plus-circle"></i> Situation (terrain, soleil, allié…)
      </div>
      <input type="number" name="desSituation" value="0" min="0" max="30">
    </div>
  </div>

  <div class="de-atk-row">
    <div class="de-atk-label">
      <i class="fas fa-hand-holding"></i> Dés de Dévotion accordés par le dieu
      <span class="de-atk-hint">(vide = tous)</span>
    </div>
    <input type="number" name="accordes" min="0" max="20" placeholder="tous">
  </div>

  ${blocDivin(attaquant, "champs-de-bataille")}

  ${malus > 0 ? `
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-shield-halved"></i> Armure
      <span class="de-atk-hint">(gêne tous les mouvements, attaque comprise)</span>
    </div>
    <label class="de-atk-check de-atk-check-malus">
      <input type="checkbox" name="useMalus" data-malus="${malus}" checked>
      <span>Malus de l'armure portée</span>
      <span class="de-atk-check-bonus">−${malus}</span>
    </label>
  </div>` : ""}

</div>
`;

  const result = await DialogV2.prompt({
    window: { title: `Attaque — ${attaquant.name}`, icon: "fas fa-sword" },
    classes: ["de-dialog-attaque"],
    position: { width: 480 },
    content,
    render: (event, dialogOrHtml) => {
      // v13/v14 : (event, dialog) ; on accepte aussi un élément HTML par sécurité
      const root = (dialogOrHtml?.element ?? dialogOrHtml)?.querySelector?.(".de-atk");
      if (!root) return;
      const majPool = () => {
        const devoMax = Number(root.dataset.devo) || 0;
        const acc   = (root.querySelector("[name=accordes]")?.value ?? "").trim();
        const devoV = acc === "" ? devoMax : Math.min(devoMax, Math.max(0, Number(acc) || 0));
        const hist  = Number(root.querySelector("[name=historiqueId]:checked")?.dataset.bonus) || 0;
        const desav = [...root.querySelectorAll("[name=useEquip]:checked, [name=useAcquis]:checked")]
          .reduce((t, c) => t + (Number(c.dataset.bonus) || 0), 0)
          + (Number(root.querySelector("[name=desSituation]")?.value) || 0);
        const mal   = Number(root.querySelector("[name=useMalus]:checked")?.dataset.malus) || 0;
        const div   = lireDivin(root);
        root.querySelector(".de-atk-desav-val").textContent = desav;
        root.querySelector(".de-atk-pool-val").textContent = Math.max(1, devoV + hist + desav + div.plus - mal - div.moins);
        const parts = [devoV < devoMax ? `${devoV}/${devoMax} accordés` : `${devoV}`];
        if (hist)  parts.push(`+${hist} hist.`);
        if (desav) parts.push(`+${desav} dés-av.`);
        if (div.plus)  parts.push(`+${div.plus} inspir.`);
        if (mal)   parts.push(`−${mal} armure`);
        if (div.moins) parts.push(`−${div.moins} malédiction`);
        root.querySelector(".de-atk-pool-detail").textContent = parts.length > 1 || devoV < devoMax ? parts.join(" ") : "";
      };
      root.addEventListener("input", majPool);
      root.addEventListener("change", majPool);
      majPool();
    },
    ok: {
      label: "Lancer l'attaque",
      callback: (event, button, dialog) => {
        const form = button.form;
        return {
          cibleId:      form.querySelector("[name=cibleId]").value,
          historiqueId: form.querySelector("[name=historiqueId]:checked")?.value ?? "",
          useEquip:     form.querySelector("[name=useEquip]")?.checked ?? false,
          useAcquis:    form.querySelector("[name=useAcquis]")?.checked ?? false,
          desSituation: Number(form.querySelector("[name=desSituation]")?.value) || 0,
          accordes:     (form.querySelector("[name=accordes]")?.value ?? "").trim(),
          useMalus:     form.querySelector("[name=useMalus]")?.checked ?? false,
          divin:        lireDivin(form)
        };
      }
    },
    rejectClose: false
  });

  if (!result) return;

  await _resoudreAttaque(attaquant, result);
}

// ── Résolution de l'attaque ──────────────────────────────────

async function _resoudreAttaque(attaquant, opts) {
  const { cibleId, historiqueId, useEquip, useAcquis, desSituation, useMalus } = opts;
  const divin = opts.divin ?? { plus: 0, moins: 0, inspIdx: [] };

  const cible = cibleId ? game.actors.get(cibleId) : null;

  // Pool : Dévotion + 1 historique + dés-avantages (tout s'ADDITIONNE)
  const devoMax = devoCombat(attaquant);
  // Le joueur du dieu des Champs de bataille peut accorder moins de dés que la Dévotion
  const devo = (opts.accordes ?? "") === "" ? devoMax : Math.min(devoMax, Math.max(0, Number(opts.accordes) || 0));
  const hist = historiqueId ? attaquant.items.get(historiqueId) : null;
  const desHist  = hist ? Number(hist.system?.valeur ?? 1) : 0;
  const desEquip = useEquip  ? desAvEquipement(attaquant) : 0;
  const desAcq   = useAcquis ? desAvAcquis(attaquant)     : 0;
  const desSit   = Math.max(0, Number(desSituation) || 0);
  const malus    = useMalus ? malusArmure(attaquant) : 0;

  const totalDes = Math.max(1, devo + desHist + desEquip + desAcq + desSit + divin.plus - malus - divin.moins);

  const detailPool = [devo < devoMax ? `Dévotion ${devo}/${devoMax} accordés` : `Dévotion ${devo}`];
  if (desHist)  detailPool.push(`+${desHist} ${hist.name}`);
  if (desEquip) detailPool.push(`+${desEquip} équipement`);
  if (desAcq)   detailPool.push(`+${desAcq} acquis`);
  if (desSit)   detailPool.push(`+${desSit} situation`);
  if (divin.plus)  detailPool.push(`+${divin.plus} inspiration divine`);
  if (malus)    detailPool.push(`−${malus} armure`);
  if (divin.moins) detailPool.push(`−${divin.moins} malédiction`);

  // Difficulté selon le type de cible
  let protectionTxt = "";
  let difficulte = 0;
  let typeCombat = "libre";
  let seuil = 0;

  if (cible) {
    if (cible.type === TYPE_FIGURANT) {
      typeCombat = "figurant";
    } else {
      // Premier rôle ou héros : difficulté = Dévotion CdB + avantages défensifs
      difficulte = devoCombat(cible) + avantagesDefensifs(cible);
      // Protection divine du défenseur (déesse du Foyer) pour ce round
      const prot = protectionActive(cible);
      if (prot) { difficulte += Number(prot.bonus) || 0; protectionTxt = `+${prot.bonus} protection de ${prot.dieuNom}`; }
      seuil      = devoCombat(cible) + 5;   // Livret des héros p. 24
      typeCombat = "opposition";
    }
  }

  // Jet
  const roll = new Roll(buildFormula(totalDes));
  await roll.evaluate();

  // Acolyte du dieu des Champs de bataille (Dévotion Champs de bataille ≥ 4) : relance d'un échec
  const aco = await appliquerAcolyte(roll, estAcolyte(attaquant, "champs-de-bataille"));
  await consommerInspirations(attaquant, divin.inspIdx);
  if (cible) await consommerProtection(cible);
  const successes = aco.succes;
  const reussite  = typeCombat === "figurant" ? successes >= 1 : successes >= difficulte;
  const defaite   = typeCombat === "opposition" && successes >= seuil;

  // Résultats individuels des dés
  const diceHtml = desHtml(aco.valeurs, aco.relance);

  // Construire la carte de chat
  let résultatHtml = "";
  let boutons = "";

  if (typeCombat === "figurant") {
    résultatHtml = reussite
      ? `<span class="de-success">✔ ${successes} succès — <strong>${successes} figurant${successes > 1 ? "s" : ""} au tapis</strong></span>`
      : `<span class="de-failure">✘ Aucun succès — aucun figurant touché</span>`;
  } else if (typeCombat === "opposition") {
    if (defaite) {
      résultatHtml = `<span class="de-success de-defaite">💀 COMBAT REMPORTÉ ! (${successes} ≥ ${seuil})<br>${cible.name} est vaincu — le vainqueur décide de son sort.</span>`;
    } else if (reussite) {
      résultatHtml = `<span class="de-success">✔ ${successes} succès ≥ ${difficulte} → <strong>1 Blessure</strong> pour ${cible.name}, <strong>+1 dé-avantage</strong> pour ${attaquant.name}</span>`;
      boutons = `
<div class="de-btn-row">
  <button type="button" class="de-apply-hit"
    data-cible-id="${cible.id}"
    data-attaquant-id="${attaquant.id}">
    <i class="fas fa-check"></i> Appliquer (1 Blessure + 1 dé-avantage)
  </button>
</div>`;
    } else {
      résultatHtml = `<span class="de-failure">✘ Échec (${successes}/${difficulte} succès requis)<br><em>${attaquant.name} perd les dés-avantages acquis par ses attaques (pas ceux des armes ni des historiques).</em></span>`;
      if (desAvAcquis(attaquant) > 0) boutons = `
<div class="de-btn-row">
  <button type="button" class="de-lose-desavantages" data-actor-id="${attaquant.id}">
    <i class="fas fa-times"></i> Perdre les dés-avantages acquis
  </button>
</div>`;
    }
  } else {
    résultatHtml = `<span class="de-neutral">${successes} succès</span>`;
  }

  const nomCible = cible?.name ?? "cible libre";
  const chatHtml = `
<div class="de-chat-attaque">
  <h3><i class="fas fa-sword"></i> Attaque — ${attaquant.name}</h3>
  <div class="de-chat-info">
    <span>Pool : <strong>${totalDes} dé${totalDes > 1 ? "s" : ""}</strong></span>
    ${cible ? `<span>→ <strong>${nomCible}</strong></span>` : ""}
    ${difficulte > 0 ? `<span>Diff. : <strong>${difficulte}</strong>${protectionTxt ? ` <small>(${protectionTxt})</small>` : ""}</span>` : ""}
    <span>Succès : <strong>${successes}</strong></span>
  </div>
  <div class="de-chat-detail">${detailPool.join(" ")}</div>
  <div class="de-chat-dice">${diceHtml}</div>
  ${acolyteHtml(aco.relance, nomDieu("champs-de-bataille"))}
  <div class="de-roll-result">${résultatHtml}</div>
  ${boutons}
  <div class="de-intervention-row">
    <button type="button" class="de-intervention" data-type="falvren" data-actor-id="${attaquant.id}">
      <i class="fas fa-fire"></i> ${nomDieu("champs-de-bataille")} (offensif)
    </button>
    <button type="button" class="de-intervention" data-type="manna" data-actor-id="${cible?.id ?? ""}">
      <i class="fas fa-shield-alt"></i> ${nomDieu("foyer")} (défensif)
    </button>
  </div>
</div>`;

  // Créer le message de chat
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attaquant }),
    content: chatHtml,
    rolls: aco.rolls
  });
}

// ── Hook renderChatMessageHTML — boutons dans les cartes ─────
Hooks.on("renderChatMessageHTML", (message, html) => {
  // Appliquer blessure + dés-avantage
  html.querySelectorAll(".de-apply-hit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cible     = game.actors.get(btn.dataset.cibleId);
      const attaquant = game.actors.get(btn.dataset.attaquantId);
      if (!cible) return;
      const bl    = cible.system.blessures ?? { value: 0, max: 10 };
      const maxBl = Number(bl.max ?? 10);
      const newBl = Math.min(maxBl, Number(bl.value ?? 0) + 1);
      await majActeur(cible, { "system.blessures.value": newBl });
      let msg = `${cible.name} : +1 Blessure → ${newBl}/${maxBl}`;
      if (newBl >= maxBl) msg += ` — un dieu doit dépenser 1 Divinité ou ${cible.name} s'effondre !`;
      if (attaquant && "desAvantages" in attaquant.system) {
        const newDa = desAvAcquis(attaquant) + 1;
        await majActeur(attaquant, { "system.desAvantages": newDa });
        msg += ` · ${attaquant.name} : ${newDa} dé${newDa > 1 ? "s" : ""}-avantage${newDa > 1 ? "s" : ""} acquis`;
      }
      ui.notifications.info(msg);
      btn.disabled = true;
      btn.textContent = "✔ Appliqué";
    });
  });

  // Échec : l'attaquant perd les dés-avantages acquis par ses attaques
  html.querySelectorAll(".de-lose-desavantages").forEach(btn => {
    btn.addEventListener("click", async () => {
      const actor = game.actors.get(btn.dataset.actorId);
      if (!actor) return;
      // Seuls les dés-avantages acquis sont stockés dans system.desAvantages ;
      // ceux des armes et historiques sont calculés à part et ne sont pas touchés.
      await majActeur(actor, { "system.desAvantages": 0 });
      ui.notifications.info(`${actor.name} : dés-avantages acquis perdus.`);
      btn.disabled = true;
      btn.textContent = "✔ Perdus";
    });
  });

  // Interventions divines
  html.querySelectorAll(".de-intervention").forEach(btn => {
    btn.addEventListener("click", async () => {
      const type    = btn.dataset.type;   // "falvren" | "manna"
      const actorId = btn.dataset.actorId;
      await _interventionDivine(type, actorId);
    });
  });
});

// ── Intervention divine ──────────────────────────────────────

async function _interventionDivine(type, cibleId) {
  // Livret des héros p. 24 : le dieu des Champs de bataille (attaquant) et la déesse du Foyer (défenseur) ont toujours autorité
  const offensif = type === "falvren";
  const domaine  = offensif ? "champs-de-bataille" : "foyer";
  const cible    = cibleId ? game.actors.get(cibleId) : null;
  const effet    = offensif ? devoCombat(cible) : Number(cible?.system?.devotions?.foyer ?? 0);

  const dieux = game.actors.filter(a => a.type === "dieu")
    .sort((x, y) => (y.system.domaine === domaine) - (x.system.domaine === domaine));
  if (!dieux.length) return ui.notifications.warn("Aucun acteur Dieu dans le monde.");
  const optsDieux = dieux.map(d =>
    `<option value="${d.id}" data-div="${d.system.divinite?.value ?? 0}">${d.name}${d.system.domaine === domaine ? " ★" : ""} (Divinité : ${d.system.divinite?.value ?? 0})</option>`
  ).join("");

  const content = `
<div class="de-atk de-divin">
  <div class="de-atk-banner">
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Coût</span>
      <span class="de-atk-stat-val">1</span>
    </div>
    <div class="de-atk-stat de-atk-pool">
      <span class="de-atk-stat-lbl">${offensif ? "Dés-avantages" : "Difficulté"}</span>
      <span class="de-atk-stat-val">+${cible ? effet : "?"}</span>
    </div>
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Divinité</span>
      <span class="de-atk-stat-val de-iv-div">0</span>
    </div>
  </div>

  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas ${offensif ? "fa-fire" : "fa-shield-alt"}"></i>
      ${offensif ? `${nomDieu("champs-de-bataille")} — attiser le carnage` : `${nomDieu("foyer")} — protéger le défenseur`}
    </div>
    <p class="de-divin-cout">${offensif
      ? `Pour ce round, ${cible ? `<strong>${cible.name}</strong>` : "l'attaquant"} gagne autant de dés-avantages que sa Dévotion au dieu des Champs de bataille${cible ? ` (<strong>${effet}</strong>)` : ""}.`
      : `Pour ce round, la difficulté pour frapper ${cible ? `<strong>${cible.name}</strong>` : "le défenseur"} augmente de sa Dévotion à la déesse du Foyer${cible ? ` (<strong>${effet}</strong>)` : ""}.`}</p>
  </div>

  <div class="de-atk-section">
    <div class="de-atk-label"><i class="fas fa-star"></i> Dieu qui intervient <span class="de-atk-hint">(★ = domaine concerné)</span></div>
    <select name="dieuId">${optsDieux}</select>
  </div>
</div>`;

  const result = await DialogV2.prompt({
    window: { title: "Intervention divine", icon: "fas fa-star" },
    classes: ["de-dialog-attaque"],
    position: { width: 460 },
    content,
    render: (event, d) => {
      const root = (d?.element ?? d)?.querySelector?.(".de-divin");
      if (!root) return;
      const maj = () => {
        const opt = root.querySelector("[name=dieuId]").selectedOptions[0];
        root.querySelector(".de-iv-div").textContent = opt?.dataset.div ?? 0;
      };
      root.addEventListener("change", maj);
      maj();
    },
    ok: {
      label: "Intervenir (1 pt)",
      icon: offensif ? "fas fa-fire" : "fas fa-shield-alt",
      callback: (event, button) => button.form.querySelector("[name=dieuId]").value
    },
    rejectClose: false
  });

  if (!result) return;
  const dieu = game.actors.get(result);
  if (!dieu) return;

  const diviniteActuelle = Number(dieu.system.divinite?.value ?? 0);
  if (diviniteActuelle < 1) return ui.notifications.warn(`${dieu.name} n'a plus de Divinité !`);
  await dieu.update({ "system.divinite.value": diviniteActuelle - 1 });

  const effetHtml = offensif
    ? `<span class="de-success">${cible ? cible.name : "L'attaquant"} : +${cible ? effet : "(Dévotion Champs de bataille)"} dés-avantages ce round</span>`
    : `<span class="de-success">Difficulté pour frapper ${cible ? cible.name : "le défenseur"} : +${cible ? effet : "(Dévotion Foyer)"} ce round</span>`;

  // Effet appliqué automatiquement pendant le round (ou au prochain jet sans combat lancé)
  let auto = false;
  if (cible && effet > 0) {
    if (offensif) await poserFaveurRound(cible, { dieuNom: dieu.name, des: effet, libelle: `Faveur de ${dieu.name}` });
    else await poserProtection(cible, { dieuNom: dieu.name, bonus: effet });
    auto = true;
  }
  const enCombat = !!game.combat?.started;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: dieu }),
    content: `
<div class="de-chat-attaque de-chat-divin">
  <h3><i class="fas ${offensif ? "fa-fire" : "fa-shield-alt"}"></i> ${dieu.name} ${offensif ? "attise le carnage" : "protège"}</h3>
  <div class="de-roll-result">${effetHtml}</div>
  <div class="de-chat-detail">${auto
    ? (offensif ? "Ajouté automatiquement à ses attaques" : "Ajouté automatiquement à la difficulté pour le frapper")
      + (enCombat ? " jusqu'à la fin du round." : " (prochaine attaque).")
    : (offensif ? "À ajouter en « Situation » lors de ses attaques." : "À ajouter à la difficulté des attaques contre lui.")}</div>
  <p class="de-chat-sub"><em>${dieu.name} dépense 1 Divinité (reste : ${diviniteActuelle - 1})</em></p>
</div>`
  });
}

// ── Bouton de combat dans les fiches ────────────────────────

/**
 * Ajoute un bouton « ⚔ Attaquer » dans la fiche d'un acteur Héros.
 * Appelé depuis _onRender dans la fiche concernée.
 */
function bindCombatButton(element, actor) {
  element.querySelectorAll("[data-action=rollAttaque]").forEach(btn => {
    btn.addEventListener("click", () => rollAttaque(actor));
  });
  element.querySelectorAll("[data-action=rollInitiative]").forEach(btn => {
    btn.addEventListener("click", () => rollInitiative(actor));
  });
}

export { rollInitiative, rollAttaque, bindCombatButton, _interventionDivine };
