// ============================================================
// DIEUX ENNEMIS — Point d'entrée principal
// ============================================================
import { HerosDataModel, DieuDataModel, FigurantDataModel, PremierRoleDataModel,
         HistoriqueDataModel, EquipementDataModel, BenedictionDataModel, PouvoirDataModel,
         MaledictionDataModel }
  from "./module/data-models.mjs";
import { DiEActor, DiEItem } from "./module/documents.mjs";
import { HerosSheet, DieuSheet, PnjSheet } from "./module/sheets.mjs";
import { EquipementSheet, HistoriqueSheet, BenedictionSheet, PouvoirSheet, MaledictionSheet } from "./module/item-sheets.mjs";
import { migrerMonde } from "./module/migration.mjs";
import { enregistrerReglagesCarte, carteAuLancement, boutonCarte } from "./module/carte.mjs";
import { rollInitiative, bindCombatButton, _interventionDivine } from "./module/combat.mjs";
import { initRelais } from "./module/relais.mjs";
import { enregistrerReglagesContestation } from "./module/cartes-divines.mjs";

// ── Liste des dieux ──────────────────────────────────────────
const GODS = [
  { id: "champs-de-bataille", name: "Le Guerrier",    domaine: "Champs de Bataille", color: "#8b1a1a" },
  { id: "artisanat",          name: "L'Artisan",  domaine: "Artisanat",          color: "#5c3a1e" },
  { id: "fortune",            name: "Le Hasard", domaine: "Fortune",            color: "#b8860b" },
  { id: "foyer",              name: "La Gardienne",    domaine: "Foyer",              color: "#2e6e3e" },
  { id: "justice",            name: "Le Juge",     domaine: "Justice",            color: "#1a3a6e" },
  { id: "amour",              name: "L'Amante",   domaine: "Amour",              color: "#7a1a4a" },
  { id: "sagesse",            name: "Le Sage",     domaine: "Sagesse",            color: "#3a1a6e" }
];

// ── Dieux déchus (Livret des secrets) ────────────────────────
const DECHUS = [];   // dieux déchus : contenu des livres, absent de la version non officielle

// Table de difficulté (nombre de succès à atteindre)
const DIFFICULTES = {
  "Facile (1)":         1,
  "Normal (2)":         2,
  "Difficile (3)":      3,
  "Très difficile (4)": 4,
  "Héroïque (5)":       5,
  "Légendaire (6+)":    6
};

// ── ID du compendium wiki ─────────────────────────────────────
const WIKI_PACK_ID = "dieux-ennemis-nonofficiel.wiki";

// ── INIT ─────────────────────────────────────────────────────
Hooks.once("init", () => {
  console.log("Dieux Ennemis | Initialisation du système");

  CONFIG.DIEUX = { gods: GODS, dechus: DECHUS, difficultes: DIFFICULTES };

  CONFIG.Actor.dataModels = {
    heros:          HerosDataModel,
    dieu:           DieuDataModel,
    figurant:       FigurantDataModel,
    "premier-role": PremierRoleDataModel
  };
  CONFIG.Item.dataModels = {
    historique:  HistoriqueDataModel,
    equipment:   EquipementDataModel,
    benediction: BenedictionDataModel,
    pouvoir:     PouvoirDataModel,
    malediction: MaledictionDataModel
  };

  CONFIG.Actor.documentClass = DiEActor;
  CONFIG.Item.documentClass  = DiEItem;

  // Sheets Acteurs (AppV2 / v14)
  const { Actors: ActorsCollection } = foundry.documents.collections;
  ActorsCollection.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  ActorsCollection.registerSheet("dieux-ennemis-nonofficiel", HerosSheet, {
    types: ["heros"], makeDefault: true, label: "Fiche Héros"
  });
  ActorsCollection.registerSheet("dieux-ennemis-nonofficiel", DieuSheet, {
    types: ["dieu"], makeDefault: true, label: "Fiche Dieu"
  });
  ActorsCollection.registerSheet("dieux-ennemis-nonofficiel", PnjSheet, {
    types: ["figurant", "premier-role"], makeDefault: true, label: "Fiche PNJ"
  });

  // Sheets Items (AppV2 / v14)
  const { Items: ItemsCollection } = foundry.documents.collections;
  ItemsCollection.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  ItemsCollection.registerSheet("dieux-ennemis-nonofficiel", EquipementSheet, {
    types: ["equipment"], makeDefault: true, label: "Fiche Équipement"
  });
  ItemsCollection.registerSheet("dieux-ennemis-nonofficiel", HistoriqueSheet, {
    types: ["historique"], makeDefault: true, label: "Fiche Historique"
  });
  ItemsCollection.registerSheet("dieux-ennemis-nonofficiel", BenedictionSheet, {
    types: ["benediction"], makeDefault: true, label: "Fiche Bénédiction"
  });
  ItemsCollection.registerSheet("dieux-ennemis-nonofficiel", MaledictionSheet, {
    types: ["malediction"], makeDefault: true, label: "Fiche Malédiction"
  });
  ItemsCollection.registerSheet("dieux-ennemis-nonofficiel", PouvoirSheet, {
    types: ["pouvoir"], makeDefault: true, label: "Fiche Pouvoir Divin"
  });

  // Carte du monde (image, ouverture au lancement)
  enregistrerReglagesCarte();
  enregistrerReglagesContestation();

  // Noms des dieux personnalisables (Configuration → Paramètres du système)
  for (const g of GODS) {
    game.settings.register(game.system.id, `nomDieu.${g.id}`, {
      name: `Nom du dieu : ${g.domaine}`,
      hint: "Nom affiché sur les fiches, les fenêtres de jet et dans le chat.",
      scope: "world", config: true, type: String, default: g.name,
      requiresReload: true
    });
  }

  // Handlebars helpers
  Handlebars.registerHelper("nomDieu",    (id) => [...GODS, ...DECHUS].find(g => g.id === id)?.name ?? id);
  Handlebars.registerHelper("domaineDieu",(id) => [...GODS, ...DECHUS].find(g => g.id === id)?.domaine ?? id);
  Handlebars.registerHelper("range",  (n) => Array.from({ length: n }, (_, i) => i));
  Handlebars.registerHelper("times",  (n, opts) => { let o=""; for(let i=0;i<n;i++) o+=opts.fn(i); return o; });
  Handlebars.registerHelper("ifEq",   (a, b, opts) => a == b ? opts.fn(this) : opts.inverse(this));
  Handlebars.registerHelper("add",    (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper("lt",     (a, b) => a < b);
  Handlebars.registerHelper("lte",    (a, b) => a <= b);
  Handlebars.registerHelper("gt",     (a, b) => a > b);
  Handlebars.registerHelper("or",     (a, b) => a || b);

  foundry.applications.handlebars.loadTemplates([
    "systems/dieux-ennemis-nonofficiel/templates/actors/heros-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/actors/dieu-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/actors/pnj-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/wiki/wiki.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/items/equipment-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/items/historique-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/items/benediction-sheet.hbs",
    "systems/dieux-ennemis-nonofficiel/templates/items/pouvoir-sheet.hbs",
  ]);
});

// ── Chat message buttons ──────────────────────────────────────
Hooks.on("renderChatMessageHTML", (message, html) => {
  html.querySelectorAll("[data-action='intervention-divine']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const actor = game.actors.get(btn.dataset.actorId);
      if (actor) await _interventionDivine(actor);
    });
  });
});

// ── Viewer Wiki — ApplicationV2 avec data-action (même arch. que T&T) ──
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

class WikiViewer extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:       "de-wiki-viewer",
    classes:  ["de-wiki"],
    position: { width: 800, height: 640 },
    window:   { resizable: true, title: "📖 Wiki — Dieux Ennemis" },
    actions: {
      navEntry: WikiViewer._onNavEntry,
      navPage:  WikiViewer._onNavPage,
    }
  };

  static PARTS = {
    main: { template: "systems/dieux-ennemis-nonofficiel/templates/wiki/wiki.hbs" }
  };

  // Singleton
  static _instance = null;
  static open(entries) {
    if (!WikiViewer._instance) WikiViewer._instance = new WikiViewer(entries);
    WikiViewer._instance.render(true);
  }

  constructor(entries = [], options = {}) {
    super(options);
    this._entries = entries;
    this._current = 0;
    this._page    = 0;
  }

  get _entry() { return this._entries[this._current]; }
  get _pageObj(){ return this._entry?.pages?.[this._page]; }

  async _prepareContext(options) {
    const ctx     = await super._prepareContext(options);
    const pages   = this._entry?.pages ?? [];
    ctx.entries   = this._entries;
    ctx.current   = this._current;
    ctx.currentId = this._entry?._id ?? "";
    ctx.pages     = pages;
    ctx.pageIdx   = this._page;
    ctx.content   = this._pageObj?.text?.content ?? "<p><em>Aucun contenu.</em></p>";
    return ctx;
  }

  // Actions statiques pour les éléments du template HBS (sidebar, onglets)
  static async _onNavEntry(ev, target) {
    this._current = parseInt(target.dataset.entry);
    this._page    = 0;
    await this.render(true);
  }

  static async _onNavPage(ev, target) {
    this._page = parseInt(target.dataset.page);
    await this.render(true);
  }

  // Mise à jour directe du DOM sans passer par render() —
  // appelée depuis les liens internes du contenu triple-mustache.
  _navigateTo(wikiId) {
    console.log("DiE Wiki | _navigateTo appelé avec id:", wikiId);
    const idx = this._entries.findIndex(e => e._id === wikiId);
    console.log("DiE Wiki | idx résolu:", idx, "(sur", this._entries.length, "entrées)");
    if (idx < 0) {
      console.warn("DiE Wiki | ID introuvable dans this._entries:", JSON.stringify(wikiId),
        "— IDs connus:", this._entries.map(e => JSON.stringify(e._id)).join(", "));
      return;
    }
    this._current = idx;
    this._page    = 0;

    const entry = this._entries[idx];
    const page  = entry?.pages?.[0];
    console.log("DiE Wiki | entrée ciblée:", entry?.name,
      "| page:", page?.name, "| contenu non-vide:", !!page?.text?.content);

    // Mettre à jour la sidebar (classe active)
    const navItems = this.element.querySelectorAll(".de-wiki-nav-item");
    console.log("DiE Wiki | items de sidebar trouvés:", navItems.length);
    navItems.forEach((li, i) => {
      li.classList.toggle("active", i === idx);
    });

    // Mettre à jour le contenu
    const contentEl = this.element.querySelector(".de-wiki-content");
    console.log("DiE Wiki | .de-wiki-content trouvé:", !!contentEl);
    if (contentEl) {
      contentEl.innerHTML = page?.text?.content ?? "<p><em>Aucun contenu.</em></p>";
      console.log("DiE Wiki | innerHTML mis à jour, nouvelle longueur:", contentEl.innerHTML.length);
      // Ré-accrocher les listeners sur les nouveaux liens
      this._attachWikiLinks(contentEl);
    } else {
      console.warn("DiE Wiki | .de-wiki-content INTROUVABLE — le contenu ne peut pas être mis à jour");
    }

    // Masquer les onglets (une seule page dans ce cas)
    const tabsEl = this.element.querySelector(".de-wiki-tabs");
    if (tabsEl) tabsEl.style.display = "none";
  }

  _attachWikiLinks(root) {
    const liens = root.querySelectorAll(".de-wiki-link[data-wiki-id]");
    console.log(`DiE Wiki | _attachWikiLinks: ${liens.length} lien(s) span trouvé(s)`);
    liens.forEach(el => {
      el.style.cursor = "pointer";
      el.style.color = "#7a2020";
      el.style.textDecoration = "underline";
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        console.log(`DiE Wiki | clic span: ${el.dataset.wikiId}`);
        this._navigateTo(el.dataset.wikiId);
      });
    });
  }

  // _onRender : accroche les listeners après chaque rendu AppV2.
  _onRender(context, options) {
    console.log("DiE Wiki | _onRender appelé");
    const contentEl = this.element.querySelector(".de-wiki-content");
    if (contentEl) this._attachWikiLinks(contentEl);
    else console.warn("DiE Wiki | .de-wiki-content introuvable dans _onRender");
  }
}

// Cache global
let _wikiEntries = null;

// ── Helper : ouvrir le wiki (viewer custom avec navigation) ───
async function ouvrirWiki() {
  const pack = game.packs.get(WIKI_PACK_ID);
  if (!pack) {
    ui.notifications.warn("Wiki Dieux Ennemis introuvable.");
    return;
  }

  // Charger toutes les entrées (avec leurs pages) une seule fois.
  // Chargement SÉQUENTIEL (pas Promise.all) : des lectures concurrentes
  // sur le même compendium LevelDB peuvent silencieusement se marcher
  // dessus et faire disparaître certaines entrées du résultat.
  if (!_wikiEntries) {
    await pack.getIndex({ fields: ["sort"] });
    const ids = [...pack.index.keys()].filter(id => !!id);
    const entries = [];
    for (const id of ids) {
      let doc;
      try {
        doc = await pack.getDocument(id);
      } catch (err) {
        console.warn("DiE Wiki | échec de chargement du document", id, err);
        continue;
      }
      if (!doc) {
        console.warn("DiE Wiki | document introuvable pour l'id", id);
        continue;
      }
      entries.push({
        _id   : doc.id,
        name  : doc.name,
        sort  : doc.sort ?? 0,
        pages : (doc.pages?.contents ?? [])
                  .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
                  .map(p => ({ name: p.name, text: p.text }))
      });
    }
    _wikiEntries = entries;
    console.log("DiE Wiki | entrées chargées:", entries.length,
      "— IDs:", entries.map(e => e._id).join(", "));
  }

  // Ouvrir (singleton via static open)
  WikiViewer.open(_wikiEntries);
}

// ── Wiki au démarrage (MJ uniquement, comme T&T) ─────────────
// Applique les noms de dieux choisis dans les paramètres
Hooks.once("setup", () => {
  for (const g of GODS) {
    const nom = game.settings.get(game.system.id, `nomDieu.${g.id}`)?.trim();
    if (nom) g.name = nom;
  }
});

Hooks.once("ready", () => {
  initRelais();
  migrerMonde();
  carteAuLancement();
  if (game.user.isGM) {
    setTimeout(() => ouvrirWiki(), 800);
  }
});

// ── Bouton 📖 Wiki dans la sidebar (onglet Journaux) ─────────
function _injecterBoutonWiki() {
  // Cherche le panneau journal dans le DOM global (v13 et v14)
  const panel = document.querySelector("#journal .directory-list")
    ?? document.querySelector("#journal")
    ?? document.querySelector("[data-tab='journal']");
  if (!panel) return;
  if (document.querySelector("#de-wiki-btn")) return; // anti-doublon
  const btn = document.createElement("button");
  btn.id        = "de-wiki-btn";
  btn.type      = "button";
  btn.innerHTML = "📖 Wiki Dieux Ennemis";
  btn.style.cssText = "width:100%;margin:4px 0 6px;padding:4px 8px;font-size:12px;cursor:pointer;";
  btn.addEventListener("click", () => ouvrirWiki());
  panel.closest("section, .directory, #journal")?.prepend(btn) ?? panel.before(btn);
  boutonCarte(btn.parentElement);
}

// Déclencher sur le hook classique ET sur changement d'onglet sidebar
Hooks.on("renderJournalDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector("#de-wiki-btn")) return;
  const btn = document.createElement("button");
  btn.id        = "de-wiki-btn";
  btn.type      = "button";
  btn.innerHTML = "📖 Wiki Dieux Ennemis";
  btn.style.cssText = "width:100%;margin:4px 0 6px;padding:4px 8px;font-size:12px;cursor:pointer;";
  btn.addEventListener("click", () => ouvrirWiki());
  const header = root.querySelector(".directory-header") ?? root.querySelector("header") ?? root;
  if (header === root) root.prepend(btn);
  else header.after(btn);
  boutonCarte(root);
});

Hooks.on("changeSidebarTab", (tab) => {
  if (tab?.id === "journal") setTimeout(_injecterBoutonWiki, 50);
});

// ── MACRO helper ─────────────────────────────────────────────
Hooks.once("ready", () => {
  globalThis.dieuxEnnemisRoll = async (actorId, god, nbDes, difficulte = 0) => {
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.error("Acteur introuvable.");
    const label = GODS.find(g => g.id === god)?.name ?? god;
    return actor.rollDevotion(nbDes ?? actor.system.devotions?.[god] ?? 1, label, difficulte);
  };
});
