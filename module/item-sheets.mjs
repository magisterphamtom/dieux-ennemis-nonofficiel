// ============================================================
// ITEM SHEETS — Dieux Ennemis  (AppV2 / v14)
// ============================================================

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 }                = foundry.applications.sheets;

// ── Sheet générique commune à tous les items ─────────────────
class DiEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["dieux-ennemis", "sheet", "item"],
    position: { width: 480, height: 420 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
  };

  async _prepareContext(options) {
    const ctx    = await super._prepareContext(options);
    ctx.item     = this.item;
    ctx.system   = this.item.system;
    ctx.editable = this.isEditable;
    ctx.gods     = CONFIG.DIEUX?.gods ?? [];
    ctx.dechus   = CONFIG.DIEUX?.dechus ?? [];
    // Texte riche affiché (et modifiable) par <prose-mirror>
    const champ  = "effet" in this.item.system ? "effet" : "description";
    const TE     = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    ctx.texteEnrichi = await TE.enrichHTML(this.item.system[champ] ?? "", { relativeTo: this.item });
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el) return;

    // Portrait cliquable
    el.querySelector(".de-item-avatar-wrap")?.addEventListener("click", () => {
      if (!this.isEditable) return;
      const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
      new FP({
        type: "image",
        current: this.item.img,
        callback: path => this.item.update({ img: path }),
      }).render(true);
    });
  }
}

// ── ÉQUIPEMENT ───────────────────────────────────────────────
export class EquipementSheet extends DiEItemSheet {

  static DEFAULT_OPTIONS = {
    ...DiEItemSheet.DEFAULT_OPTIONS,
    classes: ["dieux-ennemis", "sheet", "item", "equipment"],
    position: { width: 500, height: 440 },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/items/equipment-sheet.hbs" },
  };
}

// ── HISTORIQUE ───────────────────────────────────────────────
export class HistoriqueSheet extends DiEItemSheet {

  static DEFAULT_OPTIONS = {
    ...DiEItemSheet.DEFAULT_OPTIONS,
    classes: ["dieux-ennemis", "sheet", "item", "historique"],
    position: { width: 480, height: 380 },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/items/historique-sheet.hbs" },
  };
}

// ── BÉNÉDICTION ──────────────────────────────────────────────
export class BenedictionSheet extends DiEItemSheet {

  static DEFAULT_OPTIONS = {
    ...DiEItemSheet.DEFAULT_OPTIONS,
    classes: ["dieux-ennemis", "sheet", "item", "benediction"],
    position: { width: 500, height: 460 },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/items/benediction-sheet.hbs" },
  };
}

// ── POUVOIR DIVIN ────────────────────────────────────────────
export class PouvoirSheet extends DiEItemSheet {

  static DEFAULT_OPTIONS = {
    ...DiEItemSheet.DEFAULT_OPTIONS,
    classes: ["dieux-ennemis", "sheet", "item", "pouvoir"],
    position: { width: 500, height: 420 },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/items/pouvoir-sheet.hbs" },
  };
}

// ── MALÉDICTION ──────────────────────────────────────────────
export class MaledictionSheet extends DiEItemSheet {

  static DEFAULT_OPTIONS = {
    ...DiEItemSheet.DEFAULT_OPTIONS,
    classes: ["dieux-ennemis", "sheet", "item", "malediction"],
    position: { width: 500, height: 440 },
  };

  static PARTS = {
    sheet: { template: "systems/dieux-ennemis-nonofficiel/templates/items/malediction-sheet.hbs" },
  };
}
