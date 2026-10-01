// ============================================================
// RELAIS MJ — Dieux Ennemis
// Un joueur (ex. le joueur d'un dieu) ne peut pas modifier le personnage d'un
// autre joueur. Les mises à jour passent alors par le MJ connecté (socket).
// ============================================================

const SOCKET = "system.dieux-ennemis-nonofficiel";

/** À appeler au « ready ». */
export function initRelais() {
  game.socket.on(SOCKET, async (msg) => {
    if (msg?.type === "info") {
      if (msg.userId === game.user.id) ui.notifications.warn(msg.txt);
      return;
    }
    if (msg?.type === "op") {
      if (game.user !== game.users.activeGM) return;
      return executer(msg.nom, msg.data, game.users.get(msg.userId));
    }
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

// ── Opérations exécutées par le MJ, une à la fois ────────────
// Sert aux cartes de chat partagées (miracle, contestation) : plusieurs joueurs peuvent
// cliquer en même temps ; le MJ applique les opérations dans l'ordre, sur l'état à jour.
const OPERATIONS = {};
let file = Promise.resolve();

export function enregistrerOperation(nom, fn) { OPERATIONS[nom] = fn; }

function executer(nom, data, user) {
  const fn = OPERATIONS[nom];
  if (!fn) return;
  file = file.then(() => fn(data, user ?? game.user)).catch(e => console.error(`Dieux Ennemis | opération ${nom}`, e));
  return file;
}

/** Demande au MJ connecté d'exécuter une opération enregistrée (directement si l'on est ce MJ). */
export async function operation(nom, data) {
  if (game.user === game.users.activeGM) return executer(nom, data, game.user);
  if (!game.users.activeGM) {
    ui.notifications.warn("Un MJ doit être connecté pour cette action.");
    return;
  }
  game.socket.emit(SOCKET, { type: "op", nom, data, userId: game.user.id });
}
