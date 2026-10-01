// ============================================================
// SHEETS — Dieux Ennemis  (AppV2 / v14)
// ============================================================
import { rollAttaque, rollInitiative } from "./combat.mjs";
import { rollRisque } from "./risque.mjs";
import { ACTIONS_DIVINES } from "./dieu-actions.mjs";
import { majActeur } from "./relais.mjs";
import { invoquerBenediction, limiteBenedictions, usagesBenedictions, accorderBenediction, revoquerBenediction } from "./benedictions.mjs";
import { finDeScenarioHeros } from "./experience.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 }              = foundry.applications.sheets;

// ── Helper : gestion manuelle des onglets ────────────────────
function bindTabs(el, activeTab, setActiveTab) {
  const _activate = (tab) => {
    el.querySelectorAll(".de-tabs .item").forEach(a =>
      a.classList.toggle("active", a.dataset.tab === tab)
    );
    el.querySelectorAll(".sheet-tab").forEach(d =>
      d.classList.toggle("active", d.dataset.tab === tab)
    );
  };
  _activate(activeTab);
  el.querySelectorAll(".de-tabs .item").forEach(a => {
    a.addEventListener("click", ev => {
      ev.preventDefault();
      const tab = ev.currentTarget.dataset.tab;
      setActiveTab(tab);
      _activate(tab);
    });
  });
}

// ── HÉROS ────────────────────────────────────────────────────
export class HerosSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  constructor(options = {}) {
    super(options);
    this._activeTab = "principal";
  }

  static DEFAULT_OPTIONS = {
    classes: ["dieux-ennemis", "sheet", "actor", "heros"],
    position: { width: 780, height: 1020 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
  };

  // Un seul part = tout le template dans un seul fichier
  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/actors/heros-sheet.hbs" },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.actor    = this.actor;
    ctx.system   = this.actor.system;
    ctx.items    = this.actor.items;
    ctx.owner    = this.actor.isOwner;
    ctx.editable = this.isEditable;
    ctx.activeTab = this._activeTab;

    ctx.historiques  = this.actor.items.filter(i => i.type === "historique")
      .sort((a, b) => b.system.valeur - a.system.valeur);
    ctx.equipements  = this.actor.items.filter(i => i.type === "equipment");
    ctx.benedictions = this.actor.items.filter(i => i.type === "benediction");
    ctx.gods = CONFIG.DIEUX?.gods ?? [];

    const bVal = this.actor.system.blessures?.value ?? 0;
    ctx.blessuresArr = Array.from({ length: 10 }, (_, i) => ({ idx: i, filled: i < bVal }));

    // Bonus Dés-Avantages d'équipement
    ctx.bonusDésAvEquip = this.actor.items
      .filter(i => i.type === "equipment" && i.system.equipe)
      .reduce((acc, i) => acc + (i.system.desAvantages ?? 0), 0);

    ctx.nomDieu = (id) => CONFIG.DIEUX?.gods?.find(g => g.id === id)?.name ?? id;

    // Valeurs dérivées stockées sur l'acteur (pas sur system en v14)
    ctx.seuilDefaite   = this.actor.seuilDefaite ?? this.actor.system.seuilDefaite ?? 0;
    ctx.bonusDefensif  = this.actor.bonusDefensif ?? 0;
    ctx.malusMouvement = this.actor.malusMouvement ?? 0;

    // Bénédictions (limite d'usage par dieu et par scénario) et malédictions
    const gods = CONFIG.DIEUX?.gods ?? [];
    ctx.godsRows = gods.map(g => {
      const dev = Number(this.actor.system.devotions?.[g.id] ?? 0);
      return { ...g, xp: Number(this.actor.system.xpDevotions?.[g.id] ?? 0), seuilXp: 3 * Math.max(1, dev) };
    });
    const tousDieux = [...gods, ...(CONFIG.DIEUX?.dechus ?? [])];
    const nomDe = id => tousDieux.find(g => g.id === id)?.name ?? "Dieu inconnu";
    ctx.benedictionsVue = this.actor.items.filter(i => i.type === "benediction").map(b => {
      const limite  = b.system.permanente ? null : limiteBenedictions(this.actor, b.system.dieuSource);
      const utilise = usagesBenedictions(this.actor, b.system.dieuSource);
      return { id: b.id, name: b.name, img: b.img, dieuNom: nomDe(b.system.dieuSource),
               permanente: b.system.permanente, aLimite: limite !== null, limite, utilise,
               epuise: limite !== null && utilise >= limite };
    });
    ctx.maledictionsVue = this.actor.items.filter(i => i.type === "malediction").map(m => ({
      id: m.id, name: m.name, dieuNom: nomDe(m.system.dieuSource), force: m.system.force, malusDes: m.system.malusDes
    }));
    ctx.inspirations = this.actor.getFlag("dieux-ennemis-nonofficiel", "inspiration") ?? [];

    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el) return;

    // ── Onglets ────────────────────────────────────────────────
    bindTabs(el, this._activeTab, (tab) => { this._activeTab = tab; });

    // ── Portrait cliquable (FilePicker) ────────────────────────
    el.querySelector(".de-avatar-wrap")?.addEventListener("click", () => {
      if (!this.isEditable) return;
      const fp = new FilePicker({
        type: "image",
        current: this.actor.img,
        callback: path => this.actor.update({ img: path }),
      });
      fp.render(true);
    });

    if (!this.isEditable) return;

    // ── Bouton attaque ─────────────────────────────────────────
    el.querySelectorAll(".btn-roll-attaque").forEach(btn => {
      btn.addEventListener("click", () => rollAttaque(this.actor));
    });

    // ── Bouton initiative ──────────────────────────────────────
    el.querySelectorAll(".btn-roll-initiative").forEach(btn => {
      btn.addEventListener("click", () => rollInitiative(this.actor));
    });

    // ── Dévotions (clic sur bouton Lancer) ────────────────────
    el.querySelectorAll(".roll-devotion").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        rollRisque(this.actor, ev.currentTarget.dataset.god);
      });
    });

    // ── Hubris ────────────────────────────────────────────────
    el.querySelectorAll(".roll-hubris").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        rollRisque(this.actor, "hubris");
      });
    });

    // ── Fin de scénario : 2 points d'expérience ───────────────
    el.querySelectorAll(".btn-fin-scenario").forEach(btn => {
      btn.addEventListener("click", ev => { ev.preventDefault(); finDeScenarioHeros(this.actor); });
    });

    // ── Bénédictions : invoquer ───────────────────────────────
    el.querySelectorAll(".de-bened-invoquer").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        const item = this.actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId);
        if (item) invoquerBenediction(this.actor, item);
      });
    });

    // ── Malédictions : réduire la force (XP ou Hubris) ─────────
    el.querySelectorAll("[data-malediction]").forEach(btn => {
      btn.addEventListener("click", async ev => {
        ev.preventDefault();
        const item = this.actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId);
        if (!item) return;
        if (ev.currentTarget.dataset.malediction === "hubris") {
          const hub = Number(this.actor.system.hubrisNiveau ?? 0);
          if (hub < 1) return ui.notifications.warn("Plus d'Hubris à sacrifier.");
          await this.actor.update({ "system.hubrisNiveau": hub - 1 });
        }
        const force = Math.max(0, Number(item.system.force) - 1);
        if (force <= 0) {
          await item.delete();
          ui.notifications.info(`${item.name} est levée.`);
        } else await item.update({ "system.force": force });
      });
    });
    el.querySelectorAll(".de-inspiration-clear").forEach(btn => {
      btn.addEventListener("click", ev => { ev.preventDefault(); this.actor.unsetFlag("dieux-ennemis-nonofficiel", "inspiration"); });
    });

    // ── Blessures ──────────────────────────────────────────────
    el.querySelectorAll(".blessure-case").forEach(box => {
      box.addEventListener("click", ev => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        const current = this.actor.system.blessures?.value ?? 0;
        const newVal = idx < current ? idx : idx + 1;
        this.actor.update({ "system.blessures.value": Math.clamp(newVal, 0, 10) });
      });
    });

    // ── Item actions (data-item-action) ───────────────────────
    el.querySelectorAll("[data-item-action]").forEach(btn => {
      btn.addEventListener("click", ev => {
        const action = ev.currentTarget.dataset.itemAction;
        const type   = ev.currentTarget.dataset.type;
        const row    = ev.currentTarget.closest("[data-item-id]");
        const id     = row?.dataset.itemId;
        const item   = id ? this.actor.items.get(id) : null;

        switch (action) {
          case "create":
            this.actor.createEmbeddedDocuments("Item", [{ name: type ?? "Nouvel objet", type: type ?? "historique" }]);
            break;
          case "edit":
            item?.sheet.render(true);
            break;
          case "delete":
            item?.delete();
            break;
          case "chat":
            item?.toChat?.();
            break;
          case "toggle-equip":
            item?.update({ "system.equipe": !item.system.equipe });
            break;
        }
      });
    });

    // ── Anciennes classes item-create / item-edit / item-delete ──
    el.querySelectorAll(".item-create").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        const type = ev.currentTarget.dataset.type ?? "historique";
        this.actor.createEmbeddedDocuments("Item", [{ name: "Nouvel objet", type }]);
      });
    });
    el.querySelectorAll(".item-edit").forEach(btn => {
      btn.addEventListener("click", ev => {
        const row  = ev.currentTarget.closest("[data-item-id]");
        const item = row ? this.actor.items.get(row.dataset.itemId) : null;
        item?.sheet.render(true);
      });
    });
    el.querySelectorAll(".item-delete").forEach(btn => {
      btn.addEventListener("click", ev => {
        const row  = ev.currentTarget.closest("[data-item-id]");
        const item = row ? this.actor.items.get(row.dataset.itemId) : null;
        if (item?.type === "benediction") return revoquerBenediction(this.actor, item);
        item?.delete();
      });
    });
    el.querySelectorAll(".item-to-chat").forEach(btn => {
      btn.addEventListener("click", ev => {
        const row  = ev.currentTarget.closest("[data-item-id]");
        const item = row ? this.actor.items.get(row.dataset.itemId) : null;
        item?.toChat?.();
      });
    });
    el.querySelectorAll(".equip-toggle").forEach(btn => {
      btn.addEventListener("click", ev => {
        const row  = ev.currentTarget.closest("[data-item-id]");
        const item = row ? this.actor.items.get(row.dataset.itemId) : null;
        if (item) item.update({ "system.equipe": !item.system.equipe });
      });
    });

    // ── Zone de dépôt (drag & drop) ──────────────────────────
    el.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });

    // ── Champs inline ─────────────────────────────────────────
    el.querySelectorAll("input[data-action='inline-edit'], textarea[data-action='inline-edit']")
      .forEach(inp => {
        inp.addEventListener("change", ev => {
          const field = ev.currentTarget.dataset.field;
          let val = ev.currentTarget.value;
          if (ev.currentTarget.type === "number") val = Number(val);
          this.actor.update({ [field]: val });
        });
      });
  }

  // ── Drag & Drop ──────────────────────────────────────────────
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = TextEditor.getDragEventData(event);
    } catch(e) {
      return;
    }
    if (!data) return;

    // On n'accepte que des items
    if (data.type !== "Item") return;

    // Récupérer l'objet source
    let item;
    try {
      item = await fromUuid(data.uuid);
    } catch(e) {
      return;
    }
    if (!item) return;

    // Types acceptés sur la fiche Héros
    const TYPES_ACCEPTES = ["historique", "equipment", "benediction", "malediction"];
    if (!TYPES_ACCEPTES.includes(item.type)) {
      ui.notifications.warn(`Ce type d'objet (${item.type}) ne peut pas être ajouté sur la fiche Héros.`);
      return;
    }

    // Éviter les doublons d'équipement unique (bénédictions et équipements peuvent être en double, historiques non)
    if (item.type === "historique") {
      const existe = this.actor.items.find(i => i.type === "historique" && i.name === item.name);
      if (existe) {
        ui.notifications.info(`L'historique "${item.name}" est déjà sur cette fiche.`);
        return;
      }
    }

    // Créer l'item embarqué (une bénédiction propose de débiter le dieu concerné)
    const itemData = item.toObject();
    if (item.type === "benediction") return accorderBenediction(this.actor, itemData);
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }
}

// ── DIEU ─────────────────────────────────────────────────────
export class DieuSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  constructor(options = {}) {
    super(options);
    this._activeTab = "principal";
  }

  static DEFAULT_OPTIONS = {
    classes: ["dieux-ennemis", "sheet", "actor", "dieu"],
    position: { width: 680, height: 800 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/actors/dieu-sheet.hbs" },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.actor    = this.actor;
    ctx.system   = this.actor.system;
    ctx.owner    = this.actor.isOwner;
    ctx.editable = this.isEditable;
    ctx.activeTab = this._activeTab;
    ctx.pouvoirs = this.actor.items.filter(i => i.type === "pouvoir");
    ctx.gods     = CONFIG.DIEUX?.gods ?? [];
    const dom    = this.actor.system.domaine;
    ctx.nomDomaine = ctx.gods.find(g => g.id === dom)?.domaine ?? dom;
    const tous   = game.actors.filter(a => a.type === "heros");
    const auMoinsUnJoueur = tous.some(a => a.hasPlayerOwner);
    const rangs  = { 4: "Acolyte", 5: "Prêtre", 6: "Champion" };
    ctx.herosVenerants = tous
      .map(a => {
        const devotion = Number(a.system.devotions?.[dom] ?? 0);
        return { nom: a.name, img: a.img, devotion, joueur: a.hasPlayerOwner,
                 rang: devotion >= 6 ? rangs[6] : rangs[devotion] ?? "" };
      })
      .sort((x, y) => (y.joueur - x.joueur) || (y.devotion - x.devotion));
    // Gain de début de scénario : héros des joueurs (tous si aucun joueur, pour les tests du MJ)
    ctx.departScenario = ctx.herosVenerants
      .filter(h => !auMoinsUnJoueur || h.joueur)
      .reduce((t, h) => t + h.devotion, 0);
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el) return;

    // ── Onglets ────────────────────────────────────────────────
    bindTabs(el, this._activeTab, (tab) => { this._activeTab = tab; });

    if (!this.isEditable) return;

    // ── Actions divines ───────────────────────────────────────
    el.querySelectorAll("[data-divin]").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        ACTIONS_DIVINES[ev.currentTarget.dataset.divin]?.(this.actor);
      });
    });

    // ── Divinité ───────────────────────────────────────────────
    el.querySelector(".divinite-plus")?.addEventListener("click", () => {
      const cur = this.actor.system.divinite?.value ?? 0;
      this.actor.update({ "system.divinite.value": cur + 1 });
    });
    el.querySelector(".divinite-moins")?.addEventListener("click", () => {
      const cur = this.actor.system.divinite?.value ?? 0;
      this.actor.update({ "system.divinite.value": Math.max(0, cur - 1) });
    });

    // ── Item actions ──────────────────────────────────────────
    el.querySelectorAll("[data-item-action]").forEach(btn => {
      btn.addEventListener("click", ev => {
        const action = ev.currentTarget.dataset.itemAction;
        const type   = ev.currentTarget.dataset.type;
        const row    = ev.currentTarget.closest("[data-item-id]");
        const id     = row?.dataset.itemId;
        const item   = id ? this.actor.items.get(id) : null;

        switch (action) {
          case "create":
            this.actor.createEmbeddedDocuments("Item", [{ name: "Nouveau Pouvoir", type: type ?? "pouvoir" }]);
            break;
          case "edit":   item?.sheet.render(true); break;
          case "delete": item?.delete(); break;
        }
      });
    });

    // ── Zone de dépôt (drag & drop) ──────────────────────────
    el.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });

    // ── Héros liés ────────────────────────────────────────────
    el.querySelector(".heros-add")?.addEventListener("click", () => {
      const heros = [...(this.actor.system.heros ?? []), { nom: "", devotion: 1, actif: true, xp: 0 }];
      this.actor.update({ "system.heros": heros });
    });
    el.querySelectorAll(".heros-remove").forEach(btn => {
      btn.addEventListener("click", ev => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        const heros = [...(this.actor.system.heros ?? [])];
        heros.splice(idx, 1);
        this.actor.update({ "system.heros": heros });
      });
    });
  }

  // ── Drag & Drop (pouvoirs) ────────────────────────────────────
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = TextEditor.getDragEventData(event);
    } catch(e) {
      return;
    }
    if (!data || data.type !== "Item") return;

    let item;
    try {
      item = await fromUuid(data.uuid);
    } catch(e) {
      return;
    }
    if (!item) return;

    if (item.type !== "pouvoir") {
      ui.notifications.warn(`Seuls les pouvoirs divins peuvent être ajoutés sur la fiche Dieu.`);
      return;
    }

    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }
}

// ── PNJ (Figurant / Premier Rôle / Second Rôle) ──────────────
export class PnjSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["dieux-ennemis", "sheet", "actor", "pnj"],
    position: { width: 640, height: 760 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/actors/pnj-sheet.hbs" },
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const sys = this.actor.system;
    ctx.actor    = this.actor;
    ctx.system   = sys;
    ctx.owner    = this.actor.isOwner;
    ctx.editable = this.isEditable;
    ctx.gods     = CONFIG.DIEUX?.gods ?? [];
    ctx.isPR     = this.actor.type === "premier-role";

    const bMax = Number(sys.blessures?.max ?? 5);
    ctx.blessuresArr = Array.from({ length: bMax }, (_, i) => ({
      idx: i, filled: i < (sys.blessures?.value ?? 0)
    }));

    if (ctx.isPR) {
      const equipes = this.actor.items.filter(i => i.type === "equipment" && i.system.equipe);
      ctx.devoCombat    = Number(sys.devotions?.["champs-de-bataille"] ?? 0);
      ctx.bonusDefensif = equipes.reduce((t, i) => t + Number(i.system.bonusDefensif ?? 0), 0);
      ctx.defense       = ctx.devoCombat + ctx.bonusDefensif;
      ctx.seuil         = ctx.devoCombat + 5;   // Livret des héros p. 24
      ctx.devotionsArr  = ctx.gods.map(g => ({ ...g, val: sys.devotions?.[g.id] ?? 0 }));
      ctx.historiques   = this.actor.items.filter(i => i.type === "historique");
      ctx.equipements   = this.actor.items.filter(i => i.type === "equipment");
      ctx.hasItems      = ctx.historiques.length + ctx.equipements.length > 0;
    }
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el || !this.isEditable) return;

    const itemDe = ev => this.actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId);

    el.querySelectorAll(".btn-roll-attaque").forEach(b => b.addEventListener("click", () => rollAttaque(this.actor)));
    el.querySelectorAll(".btn-roll-initiative").forEach(b => b.addEventListener("click", () => rollInitiative(this.actor)));
    el.querySelectorAll(".roll-devotion").forEach(b => b.addEventListener("click", ev => {
      ev.preventDefault();
      rollRisque(this.actor, ev.currentTarget.dataset.god);
    }));
    el.querySelectorAll(".equip-toggle").forEach(b => b.addEventListener("click", ev => {
      const item = itemDe(ev);
      if (item) item.update({ "system.equipe": !item.system.equipe });
    }));
    el.querySelectorAll(".item-edit").forEach(b => b.addEventListener("click", ev => itemDe(ev)?.sheet.render(true)));
    el.querySelectorAll(".item-delete").forEach(b => b.addEventListener("click", ev => itemDe(ev)?.delete()));

    el.querySelectorAll(".blessure-case").forEach(box => {
      box.addEventListener("click", ev => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        const current = this.actor.system.blessures?.value ?? 0;
        const max     = this.actor.system.blessures?.max ?? 5;
        const newVal  = idx < current ? idx : idx + 1;
        this.actor.update({ "system.blessures.value": Math.clamp(newVal, 0, max) });
      });
    });
  }

  // ── Glisser-déposer : armes, armures, historiques (Premier / Second rôle) ──
  async _onDrop(event) {
    event.preventDefault();
    if (this.actor.type !== "premier-role") return;
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    let data;
    try { data = TE.getDragEventData(event); } catch (e) { return; }
    if (data?.type !== "Item") return;
    let item;
    try { item = await fromUuid(data.uuid); } catch (e) { return; }
    if (!item || item.parent === this.actor) return;
    if (!["equipment", "historique"].includes(item.type)) {
      return ui.notifications.warn("Seuls l'équipement et les historiques peuvent être ajoutés à un Premier Rôle.");
    }
    return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
  }
}
