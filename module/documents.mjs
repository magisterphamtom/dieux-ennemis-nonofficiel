// ============================================================
// ACTOR & ITEM DOCUMENTS — Dieux Ennemis
// ============================================================

export class DiEActor extends Actor {

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const sys = this.system;

    // NOTE v14 : le TypeDataModel est en lecture seule — on stocke les
    // valeurs dérivées sur l'acteur lui-même, pas sur sys.

    // Seuil de défaite (aussi calculé par le getter DataModel, mais
    // on le met sur this pour que le template puisse accéder à actor.seuilDefaite)
    if (sys.devotions?.["champs-de-bataille"] !== undefined) {
      this.seuilDefaite = sys.devotions["champs-de-bataille"] + 5;
    }

    // Bonus d'équipement
    if (this.type === "heros" || this.type === "premier-role") {
      let bonusDef = 0;
      let malusMvt = 0;
      let bonusDésAv = 0;
      for (const item of this.items) {
        if (item.type === "equipment" && item.system.equipe) {
          bonusDef += item.system.bonusDefensif ?? 0;
          malusMvt += item.system.malusMouvement ?? 0;
          bonusDésAv += item.system.desAvantages ?? 0;
        }
      }
      this.bonusDefensif   = bonusDef;
      this.malusMouvement  = malusMvt;
      this.bonusDésAvEquip = bonusDésAv;
    }

    // Divinité max pour les dieux
    if (this.type === "dieu" && sys.heros) {
      // sys.divinite.max est en lecture seule aussi → on le lit via le getter DataModel
      // (diviniteMax est déjà défini comme getter dans DieuDataModel)
    }
  }

  // ── Lancer de dés ──────────────────────────────────────────
  async rollDevotion(nbDes, label, difficulte = 0) {
    if (nbDes <= 0) {
      ui.notifications.warn("Vous devez avoir au moins 1 dé !");
      return;
    }

    const roll = new Roll(`${nbDes}d6cs>=4`);
    await roll.evaluate();

    const succes = roll.total;
    const reussite = succes > 0 && succes >= difficulte;
    const echec = succes === 0;
    const echec_partiel = succes > 0 && succes <= difficulte;

    let verdict;
    if (echec) verdict = "Échec";
    else if (difficulte === 0) verdict = succes >= 3 ? "Succès éclatant" : "Succès";
    else if (reussite) verdict = "Succès";
    else verdict = "Succès partiel";

    const dice = roll.dice[0].results.map(r => ({
      val: r.result,
      success: r.result >= 4
    }));

    const chatData = {
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: await renderTemplate("systems/dieux-ennemis-nonofficiel/templates/chat/roll-result.hbs", {
        label,
        nbDes,
        difficulte,
        succes,
        verdict,
        echec,
        reussite,
        dice
      }),
      rolls: [roll]
    };

    return ChatMessage.create(chatData);
  }

  /** Ouvre la fenêtre de risque (voir module/risque.mjs). */
  async rollDialog(source = "champs-de-bataille") {
    const { rollRisque } = await import("./risque.mjs");
    return rollRisque(this, source);
  }

  async modifierBlessures(delta) {
    const blessures = this.system.blessures;
    const newVal = Math.clamp(blessures.value + delta, 0, blessures.max);
    return this.update({ "system.blessures.value": newVal });
  }
}

// ── ITEM ─────────────────────────────────────────────────────
export class DiEItem extends Item {
  async toChat() {
    const content = await renderTemplate("systems/dieux-ennemis-nonofficiel/templates/items/item-card.hbs", {
      item: this,
      data: this.system
    });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  }
}
