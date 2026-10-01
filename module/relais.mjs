// ============================================================
// RELAIS MJ — Dieux Ennemis
// Un joueur (ex. le joueur d'un dieu) ne peut pas modifier le personnage d'un
// autre joueur. Les mises à jour passent alors par le MJ connecté (socket).
// ============================================================

const SOCKET = "system.dieux-ennemis-nonofficiel";

/** À appeler au « ready ». */
export function initRelais() {
  game.socket.on(SOCKET, async (msg) => {
    if (!["majActeur", "creerItems"].includes(msg?.type)) return;
    if (game.user !== game.users.activeGM) return;   // un seul MJ exécute
    const actor = await fromUuid(msg.uuid);
    if (!actor) return;
    if (msg.type === "majActeur") await actor.update(msg.data);
    else await actor.createEmbeddedDocuments("Item", msg.data);
  });
}

/** Met à jour un acteur, directement si possible, sinon via le MJ. */
export async function majActeur(actor, data) {
  if (!actor) return;
  if (actor.isOwner) return actor.update(data);
  if (!game.users.activeGM) {
    ui.notifications.warn(`Un MJ doit être connecté pour modifier ${actor.name}.`);
    return;
  }
  game.socket.emit(SOCKET, { type: "majActeur", uuid: actor.uuid, data });
}

/** Crée des objets sur un acteur, directement si possible, sinon via le MJ. */
export async function creerItems(actor, items) {
  if (!actor || !items?.length) return;
  if (actor.isOwner) return actor.createEmbeddedDocuments("Item", items);
  if (!game.users.activeGM) {
    ui.notifications.warn(`Un MJ doit être connecté pour modifier ${actor.name}.`);
    return;
  }
  game.socket.emit(SOCKET, { type: "creerItems", uuid: actor.uuid, data: items });
}
