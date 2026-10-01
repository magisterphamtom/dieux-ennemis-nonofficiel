// ============================================================
// DATA MODELS — Dieux Ennemis
// ============================================================
const { StringField, NumberField, BooleanField, ArrayField, SchemaField, HTMLField, ObjectField } = foundry.data.fields;

// ── Champs partagés ─────────────────────────────────────────
function devotionsSchema() {
  const gods = ["champs-de-bataille", "artisanat", "fortune", "foyer", "justice", "amour", "sagesse"];
  const obj = {};
  for (const g of gods) obj[g] = new NumberField({ integer: true, min: 0, max: 10, initial: 1, label: g });
  return obj;
}

// ── HEROS ────────────────────────────────────────────────────
export class HerosDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Identité
      dieuPatron: new StringField({ initial: "", label: "Dieu Patron" }),
      // Peuple (Arcanes du Monde) : "" = humain
      peuple: new StringField({ initial: "", blank: true }),
      // Magie stellaire (stellaires) : sceaux connus, sceaux épuisés jusqu'à la nuit, expérience
      sceaux: new ArrayField(new StringField()),
      sceauxEpuises: new ArrayField(new StringField()),
      xpStellaire: new NumberField({ integer: true, min: 0, initial: 0 }),
      // Hubris
      hubrisNiveau: new NumberField({ integer: true, min: 0, max: 10, initial: 2 }),  // Livret des héros p. 12
      hubrisExp: new NumberField({ integer: true, min: 0, initial: 0 }),
      // Traits
      momentsCles: new HTMLField({ initial: "", label: "Moments-Clés" }),
      repartie: new StringField({ initial: "", label: "Répartie" }),
      // Réserve de répartie (Livret des héros p. 27) : points gagnés par l'interprétation, dépensés en dés lors des joutes verbales
      reserveRepartie: new NumberField({ integer: true, min: 0, initial: 0 }),
      faiblesseHeroique: new StringField({ initial: "", label: "Faiblesse Héroïque" }),
      // Dévotions
      devotions: new SchemaField(devotionsSchema()),
      // Expérience accumulée par Dévotion (Livret des héros p. 14)
      xpDevotions: new SchemaField(Object.fromEntries(
        ["champs-de-bataille", "artisanat", "fortune", "foyer", "justice", "amour", "sagesse"]
          .map(g => [g, new NumberField({ integer: true, min: 0, initial: 0 })]))),
      // Blessures
      blessures: new SchemaField({
        value: new NumberField({ integer: true, min: 0, max: 12, initial: 0 }),
        max: new NumberField({ integer: true, initial: 10 })
      }),
      // Combat
      desAvantages: new NumberField({ integer: true, min: 0, initial: 0 }),
      // Ressources
      trajs: new NumberField({ integer: true, min: 0, initial: 0 }),
      piecePercees: new NumberField({ integer: true, min: 0, initial: 0 }),
      // Notes
      notes: new HTMLField({ initial: "", label: "Notes" }),
      maledictions: new HTMLField({ initial: "", label: "Malédictions" }),
      // Malédictions chiffrées (Livret des dieux p. 8-10) : force = succès du dieu
      maledictionsListe: new ArrayField(new SchemaField({
        dieuNom: new StringField({ initial: "" }),
        domaine: new StringField({ initial: "" }),
        force:   new NumberField({ integer: true, min: 0, initial: 1 }),
        effet:   new StringField({ initial: "" })
      })),
    };
  }

  get seuilDefaite() {
    return (this.devotions["champs-de-bataille"] ?? 1) + 5 + (this.peuple === "geant" ? 1 : 0);
  }
}

// ── DIEU ─────────────────────────────────────────────────────
export class DieuDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      domaine: new StringField({ initial: "champs-de-bataille" }),
      divinite: new SchemaField({
        value: new NumberField({ integer: true, min: 0, initial: 0 }),
        max: new NumberField({ integer: true, initial: 10 })
      }),
      heros: new ArrayField(new SchemaField({
        nom: new StringField({ initial: "" }),
        devotion: new NumberField({ integer: true, min: 0, max: 10, initial: 1 }),
        actif: new BooleanField({ initial: true }),
        xp: new NumberField({ integer: true, min: 0, initial: 0 })
      })),
      notes: new HTMLField({ initial: "" })
    };
  }

  get diviniteMax() {
    return this.heros.filter(h => h.actif).reduce((sum, h) => sum + h.devotion, 0);
  }
}

// ── FIGURANT ─────────────────────────────────────────────────
export class FigurantDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      devotionCombat: new NumberField({ integer: true, min: 0, max: 10, initial: 1 }),
      blessures: new SchemaField({
        value: new NumberField({ integer: true, min: 0, max: 10, initial: 0 }),
        max: new NumberField({ integer: true, initial: 5 })
      }),
      description: new HTMLField({ initial: "" })
    };
  }
}

// ── PREMIER ROLE ─────────────────────────────────────────────
export class PremierRoleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      devotions: new SchemaField(devotionsSchema()),
      blessures: new SchemaField({
        value: new NumberField({ integer: true, min: 0, max: 10, initial: 0 }),
        max: new NumberField({ integer: true, initial: 10 })
      }),
      desAvantages: new NumberField({ integer: true, min: 0, initial: 0 }),
      notes: new HTMLField({ initial: "" })
    };
  }

  get seuilDefaite() {
    return (this.devotions["champs-de-bataille"] ?? 1) + 5;
  }
}

// ── ITEMS ────────────────────────────────────────────────────
export class HistoriqueDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      valeur: new NumberField({ integer: true, min: 1, max: 10, initial: 1 }),
      description: new HTMLField({ initial: "" })
    };
  }
}

export class EquipementDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      typeEquip: new StringField({ initial: "arme", choices: ["arme", "armure", "bouclier", "divers"] }),
      desAvantages: new NumberField({ integer: true, min: 0, initial: 0 }),
      bonusDefensif: new NumberField({ integer: true, min: 0, initial: 0 }),
      malusMouvement: new NumberField({ integer: true, min: 0, initial: 0 }),
      equipe: new BooleanField({ initial: false }),
      description: new HTMLField({ initial: "" })
    };
  }
}

export class BenedictionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      dieuSource: new StringField({ initial: "" }),
      conditions: new StringField({ initial: "" }),
      effet: new HTMLField({ initial: "" }),
      permanente: new BooleanField({ initial: false }),   // vœux, effets toujours actifs : pas de limite d'usage
      utilisee: new BooleanField({ initial: false })      // ancien champ, conservé pour compatibilité
    };
  }
}

// Malédiction (Livret des dieux p. 8-10) : force = succès du dieu ; en général 1 dé de pénalité dans son domaine
export class MaledictionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      dieuSource: new StringField({ initial: "" }),
      force:      new NumberField({ integer: true, min: 0, initial: 1 }),
      malusDes:   new NumberField({ integer: true, min: 0, initial: 1 }),
      effet:      new HTMLField({ initial: "" })
    };
  }
}

export class PouvoirDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      coutDivinite: new NumberField({ integer: true, min: 0, initial: 1 }),
      domaine: new StringField({ initial: "champs-de-bataille", blank: true }),
      effet: new HTMLField({ initial: "" })
    };
  }
}
