// ============================================================
// CARTE DU MONDE — fenêtre ouverte au lancement du jeu (réglable)
// L'image se règle dans Configuration → Paramètres du système (vide = aucune carte).
// ============================================================

const CARTE_PAR_DEFAUT = "";

export function enregistrerReglagesCarte() {
  game.settings.register(game.system.id, "carteImage", {
    name: "Carte du monde",
    hint: "Image affichée par le bouton « Carte du monde » (onglet Journaux) et au lancement du jeu. Laisser vide pour n'avoir aucune carte.",
    scope: "world", config: true, type: String, default: CARTE_PAR_DEFAUT, filePicker: "image"
  });
  game.settings.register(game.system.id, "carteAuLancement", {
    name: "Ouvrir la carte au lancement",
    hint: "Affiche la carte du monde à chaque joueur quand il se connecte.",
    scope: "world", config: true, type: Boolean, default: true
  });
}

function imageCarte() {
  try { return (game.settings.get(game.system.id, "carteImage") ?? "").trim(); }
  catch (e) { return ""; }   // réglages pas encore chargés
}

class CarteMonde extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dieux-ennemis-carte-monde",
    classes: ["de-carte"],
    window: { title: "Carte du Monde", icon: "fas fa-map", resizable: true },
    position: { width: 960, height: 720 }
  };

  async _renderHTML() {
    return `<div class="de-carte-monde" title="Cliquer pour zoomer / dézoomer">
      <img src="${imageCarte()}" alt="Carte du Monde"></div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    const cadre = content.querySelector(".de-carte-monde");
    cadre?.addEventListener("click", ev => {
      const img = cadre.querySelector("img");
      const zoom = !cadre.classList.contains("zoom");
      cadre.classList.toggle("zoom", zoom);
      if (zoom && img) {
        // Centrer le zoom sur le point cliqué
        const r = img.getBoundingClientRect();
        const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
        requestAnimationFrame(() => {
          cadre.scrollLeft = fx * img.naturalWidth - cadre.clientWidth / 2;
          cadre.scrollTop  = fy * img.naturalHeight - cadre.clientHeight / 2;
        });
      }
    });
  }
}

export function ouvrirCarte() {
  if (!imageCarte()) return ui.notifications.info("Aucune carte du monde n'est définie (Paramètres du système).");
  new CarteMonde().render(true);
}

export function carteAuLancement() {
  if (imageCarte() && game.settings.get(game.system.id, "carteAuLancement")) setTimeout(ouvrirCarte, 1500);
}

/** Bouton « 🗺 Carte du monde » sous celui du wiki (onglet Journaux). */
export function boutonCarte(root) {
  if (!imageCarte() || !root || root.querySelector("#de-carte-btn")) return;
  const btn = document.createElement("button");
  btn.id = "de-carte-btn";
  btn.type = "button";
  btn.innerHTML = "🗺 Carte du monde";
  btn.style.cssText = "width:100%;margin:0 0 6px;padding:4px 8px;font-size:12px;cursor:pointer;";
  btn.addEventListener("click", () => ouvrirCarte());
  const wiki = root.querySelector("#de-wiki-btn");
  if (wiki) wiki.after(btn); else root.prepend(btn);
}
