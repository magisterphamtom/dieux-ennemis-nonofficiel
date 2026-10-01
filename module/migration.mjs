// ============================================================
// MIGRATION — Dieux Ennemis
// 0.3.0 : les malédictions de la liste (system.maledictionsListe) deviennent des objets « malediction ».
// ============================================================
import { iconeMalediction } from "./benedictions.mjs";

export async function migrerMonde() {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  const heros = game.actors.filter(a => a.type === "heros" && (a.system.maledictionsListe ?? []).length);
  if (!heros.length) return;
  const dieux = CONFIG.DIEUX?.gods ?? [];
  let n = 0;
  for (const a of heros) {
    const items = a.system.maledictionsListe.map(m => ({
      name: `Malédiction de ${m.dieuNom || dieux.find(g => g.id === m.domaine)?.name || "?"}`,
      type: "malediction",
      img: iconeMalediction(m.domaine),
      system: { dieuSource: m.domaine, force: m.force, malusDes: 1, effet: m.effet ? `<p>${m.effet}</p>` : "" }
    }));
    await a.createEmbeddedDocuments("Item", items);
    await a.update({ "system.maledictionsListe": [] });
    n += items.length;
  }
  ui.notifications.info(`Dieux Ennemis : ${n} malédiction${n > 1 ? "s" : ""} convertie${n > 1 ? "s" : ""} en objets.`);
}
