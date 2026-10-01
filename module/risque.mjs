// ============================================================
// RISQUES (jets hors combat) — Dieux Ennemis
// Règles : Livret des héros p. 11, 17-20 ; écran du MJ « Les risques »
//   Dévotion appropriée + Historique approprié + dés-avantages
//   ou Hubris + Historique approprié + dés-avantages
//   Dieu hors de son domaine : au plus la moitié de la Dévotion (arrondi inférieur)
//   Réussite : nombre de succès ≥ difficulté (1, 2, 3, 4 ou 8)
// ============================================================

const { DialogV2 } = foundry.applications.api;
import { estAcolyte, appliquerAcolyte, desHtml, acolyteHtml } from "./acolyte.mjs";
import { blocDivin, filtrerMaledictions, lireDivin, consommerInspirations } from "./bonus-divins.mjs";

/** Malus de mouvement des armures équipées (Livret des héros p. 25). */
function malusArmure(actor) {
  return (actor?.items ?? [])
    .filter(i => i.type === "equipment" && i.system.equipe)
    .reduce((t, i) => t + Number(i.system.malusMouvement ?? 0), 0);
}

const DIFFICULTES_RISQUE = [
  { val: 0, label: "Aucune (jet libre / opposition)" },
  { val: 1, label: "Facile (1)" },
  { val: 2, label: "Normal (2)" },
  { val: 3, label: "Difficile (3)" },
  { val: 4, label: "Extrême (4)" },
  { val: 8, label: "Mythique (8)" }
];

const HUBRIS_XP_PAR_NIVEAU = 6;

/**
 * Ouvre la fenêtre d'un risque.
 * @param {Actor}  actor
 * @param {string} source  id du dieu (« champs-de-bataille »…) ou « hubris »
 */
export async function rollRisque(actor, source = "champs-de-bataille") {
  const gods = CONFIG.DIEUX?.gods ?? [];
  const devs = actor.system.devotions ?? {};
  const hubris = Number(actor.system.hubrisNiveau ?? 0);

  const optionsSource = [
    ...gods.map(g => {
      const v = Number(devs[g.id] ?? 0);
      return `<option value="${g.id}" data-des="${v}"${g.id === source ? " selected" : ""}>${g.name} — ${g.domaine} (${v})</option>`;
    }),
    ...(actor.type === "heros"
      ? [`<option value="hubris" data-des="${hubris}"${source === "hubris" ? " selected" : ""}>Hubris — ses propres talents (${hubris})</option>`]
      : [])
  ].join("");

  const historiques = (actor.items ?? [])
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

  const malus = malusArmure(actor);

  const optionsDiff = DIFFICULTES_RISQUE.map(d =>
    `<option value="${d.val}"${d.val === 2 ? " selected" : ""}>${d.label}</option>`
  ).join("");

  const content = `
<div class="de-atk de-risque">

  <div class="de-atk-banner">
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl de-rq-source-lbl">Dévotion</span>
      <span class="de-atk-stat-val de-rq-source-val">0</span>
    </div>
    <div class="de-atk-stat">
      <span class="de-atk-stat-lbl">Dés-avantages</span>
      <span class="de-atk-stat-val de-atk-desav-val">0</span>
    </div>
    <div class="de-atk-stat de-atk-pool">
      <span class="de-atk-stat-lbl">Dés à lancer</span>
      <span class="de-atk-stat-val de-atk-pool-val">0</span>
      <span class="de-atk-pool-detail"></span>
    </div>
  </div>

  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-hands-praying"></i> À qui fais-tu appel ?
    </div>
    <select name="source">${optionsSource}</select>
    <label class="de-atk-check de-rq-hors">
      <input type="checkbox" name="horsDomaine">
      <span>Hors du domaine de ce dieu (moitié de la Dévotion)</span>
    </label>
    <div class="de-rq-warn" hidden>
      ⚠ Les dieux abhorrent l'Hubris : chacun peut tenter une malédiction contre le héros.
    </div>
  </div>

  ${historiques.length > 0 ? `
  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-scroll"></i> Historique
      <span class="de-atk-hint">(un seul, le plus favorable)</span>
    </div>
    <div class="de-atk-checklist">${optionsHistoriques}</div>
  </div>` : ""}

  ${malus > 0 ? `
  <label class="de-atk-check de-atk-check-malus">
    <input type="checkbox" name="useMalus" data-malus="${malus}"${source === "champs-de-bataille" ? " checked" : ""}>
    <span>Action de mouvement (gênée par l'armure)</span>
    <span class="de-atk-check-bonus">−${malus}</span>
  </label>` : ""}

  <div class="de-atk-row">
    <div class="de-atk-label">
      <i class="fas fa-dice"></i> Dés-avantages (dés en plus)
    </div>
    <input type="number" name="desAvantages" value="0" min="0" max="30">
  </div>

  ${blocDivin(actor)}

  <div class="de-atk-section">
    <div class="de-atk-label">
      <i class="fas fa-mountain"></i> Difficulté
    </div>
    <select name="difficulte">${optionsDiff}</select>
  </div>

</div>`;

  /** Calcule le pool à partir du formulaire (utilisé pour l'affichage ET le jet). */
  const lirePool = (root) => {
    const sel     = root.querySelector("[name=source]");
    const src     = sel.value;
    const isHub   = src === "hubris";
    const brut    = Number(sel.selectedOptions[0]?.dataset.des) || 0;
    const hors    = !isHub && root.querySelector("[name=horsDomaine]")?.checked;
    const base    = hors ? Math.floor(brut / 2) : brut;
    const histEl  = root.querySelector("[name=historiqueId]:checked");
    const hist    = Number(histEl?.dataset.bonus) || 0;
    const desav   = Math.max(0, Number(root.querySelector("[name=desAvantages]")?.value) || 0);
    const diff    = Number(root.querySelector("[name=difficulte]")?.value) || 0;
    const malus   = Number(root.querySelector("[name=useMalus]:checked")?.dataset.malus) || 0;
    filtrerMaledictions(root, src);
    const div     = lireDivin(root);
    return { src, isHub, brut, hors, base, hist, histId: histEl?.value ?? "", desav, diff, malus,
             insp: div.plus, maled: div.moins, inspIdx: div.inspIdx,
             total: Math.max(0, base + hist + desav + div.plus - malus - div.moins) };
  };

  const result = await DialogV2.prompt({
    window: { title: `Risque — ${actor.name}`, icon: "fas fa-dice-d6" },
    classes: ["de-dialog-attaque"],
    position: { width: 480 },
    content,
    render: (event, dialogOrHtml) => {
      const root = (dialogOrHtml?.element ?? dialogOrHtml)?.querySelector?.(".de-risque");
      if (!root) return;
      const maj = () => {
        const p = lirePool(root);
        root.querySelector(".de-rq-source-lbl").textContent = p.isHub ? "Hubris" : "Dévotion";
        root.querySelector(".de-rq-source-val").textContent = p.base;
        root.querySelector(".de-atk-desav-val").textContent = p.desav;
        root.querySelector(".de-atk-pool-val").textContent  = p.total;
        const parts = [`${p.base}`];
        if (p.hors)  parts[0] = `${p.brut}÷2=${p.base}`;
        if (p.hist)  parts.push(`+${p.hist} hist.`);
        if (p.desav) parts.push(`+${p.desav} dés-av.`);
        if (p.insp)  parts.push(`+${p.insp} inspir.`);
        if (p.malus) parts.push(`−${p.malus} armure`);
        if (p.maled) parts.push(`−${p.maled} malédiction`);
        root.querySelector(".de-atk-pool-detail").textContent = parts.length > 1 || p.hors ? parts.join(" ") : "";
        root.querySelector(".de-rq-hors").hidden = p.isHub;
        root.querySelector(".de-rq-warn").hidden = !p.isHub;
      };
      root.addEventListener("input", maj);
      root.addEventListener("change", maj);
      maj();
    },
    ok: {
      label: "Lancer",
      callback: (event, button) => lirePool(button.form)
    },
    rejectClose: false
  });

  if (!result) return;
  return _resoudreRisque(actor, result);
}

async function _resoudreRisque(actor, p) {
  const gods = CONFIG.DIEUX?.gods ?? [];
  const god  = gods.find(g => g.id === p.src);
  const hist = p.histId ? actor.items.get(p.histId) : null;

  if (p.total <= 0) {
    ui.notifications.warn("Aucun dé à lancer : ajoute un historique ou des dés-avantages.");
    return;
  }

  const roll = new Roll(`${p.total}d6cs>=4`);
  await roll.evaluate();

  // Acolyte (Dévotion ≥ 4 envers le dieu invoqué) : relance d'un échec
  const aco = await appliquerAcolyte(roll, estAcolyte(actor, p.src));
  await consommerInspirations(actor, p.inspIdx);
  const succes = aco.succes;

  // Détail du pool
  const detail = [p.isHub
    ? `Hubris ${p.base}`
    : `${god?.name ?? p.src} ${p.hors ? `${p.brut}÷2=${p.base} (hors domaine)` : p.base}`];
  if (p.hist)  detail.push(`+${p.hist} ${hist?.name ?? "historique"}`);
  if (p.desav) detail.push(`+${p.desav} dés-avantages`);
  if (p.insp)  detail.push(`+${p.insp} inspiration divine`);
  if (p.malus) detail.push(`−${p.malus} armure`);
  if (p.maled) detail.push(`−${p.maled} malédiction`);

  // Verdict (succès ≥ difficulté)
  let verdictHtml;
  if (p.diff > 0) {
    verdictHtml = succes >= p.diff
      ? `<span class="de-success">✔ Réussite (${succes} / ${p.diff} requis)</span>`
      : `<span class="de-failure">✘ Échec (${succes} / ${p.diff} requis)</span>`;
  } else {
    verdictHtml = `<span class="de-neutral"><strong>${succes}</strong> succès
      <br><em>Opposition : plus de succès que l'adversaire = succès modéré ; au moins le double = succès complet.</em></span>`;
  }

  // Hubris : +1 expérience, 6 points = +1 niveau et +1 point d'historique
  let hubrisHtml = "";
  if (p.isHub && "hubrisExp" in actor.system) {
    let exp = Number(actor.system.hubrisExp ?? 0) + 1;
    let niv = Number(actor.system.hubrisNiveau ?? 0);
    let monte = false;
    if (exp >= HUBRIS_XP_PAR_NIVEAU) { exp -= HUBRIS_XP_PAR_NIVEAU; niv = Math.min(10, niv + 1); monte = true; }
    await actor.update({ "system.hubrisExp": exp, "system.hubrisNiveau": niv });
    hubrisHtml = `<div class="de-chat-detail">⚠ Recours à l'Hubris : les dieux peuvent tenter une malédiction.
      Expérience d'Hubris : ${exp}/${HUBRIS_XP_PAR_NIVEAU}.
      ${monte ? `<strong>L'Hubris passe à ${niv} — +1 point d'historique !</strong>` : ""}</div>`;
  }

  const diceHtml = desHtml(aco.valeurs, aco.relance) + acolyteHtml(aco.relance, god?.name ?? "");

  const titre = p.isHub ? "Hubris" : (god ? `${god.name} — ${god.domaine}` : "Risque");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
<div class="de-chat-attaque">
  <h3><i class="fas fa-dice-d6"></i> ${titre}</h3>
  <div class="de-chat-info">
    <span>Pool : <strong>${p.total} dé${p.total > 1 ? "s" : ""}</strong></span>
    ${p.diff > 0 ? `<span>Diff. : <strong>${p.diff}</strong></span>` : ""}
    <span>Succès : <strong>${succes}</strong></span>
  </div>
  <div class="de-chat-detail">${detail.join(" ")}</div>
  <div class="de-chat-dice">${diceHtml}</div>
  <div class="de-roll-result">${verdictHtml}</div>
  ${hubrisHtml}
</div>`,
    rolls: aco.rolls
  });
}
