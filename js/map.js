/**
 * map.js — Carte interactive Leaflet
 * =====================================
 * Marqueurs colorés et animés selon les alertes :
 *   🟢 Vert        — état normal
 *   🟠 Orange pulsant — apport ≤ seuil
 *   🔵 Bleu pulsant   — broyat ≥ seuil
 *   🔴 Rouge pulsant  — apport ET broyat en alerte (urgence)
 */

const MapModule = (() => {

  let _map          = null;
  let _markers      = {};      // { bacId: { marker, alerte } }
  let _seuils       = {};
  let _filtreAlerte = false;   // true = affiche uniquement les bacs en alerte

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  function init() {
    _map = L.map("map", {
      center: APP_CONFIG.MAP_CENTER,
      zoom:   APP_CONFIG.MAP_ZOOM_DEFAULT,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    _addLegend();
    _setupFiltreBtn();
  }

  async function loadBacs() {
    const [bacs, derniersReleves, config] = await Promise.all([
      apiFetchBacs(),
      apiGetDerniersReleves(),
      apiFetchConfig(),
    ]);

    // Seuils depuis le Sheet ou valeurs par défaut
    if (config.seuils?.length) {
      const s = config.seuils[0];
      _seuils = {
        apport: parseFloat(s.seuilApport) || APP_CONFIG.SEUIL_APPORT_ALERTE,
        broyat: parseFloat(s.seuilBroyat) || APP_CONFIG.SEUIL_BROYAT_ALERTE,
      };
    } else {
      _seuils = {
        apport: APP_CONFIG.SEUIL_APPORT_ALERTE,
        broyat: APP_CONFIG.SEUIL_BROYAT_ALERTE,
      };
    }

    // Supprime les anciens marqueurs
    Object.values(_markers).forEach(({ marker }) => marker.remove());
    _markers = {};

    bacs.forEach(bac => _addMarker(bac, derniersReleves.get(bac.id)));

    // Met à jour le badge d'alertes dans le header
    _updateBadge();

    // Applique le filtre si actif
    _applyFiltre();
  }

  // ===========================================================================
  // Marqueurs
  // ===========================================================================

  function _addMarker(bac, releve) {
    const lat = parseFloat(bac.lat);
    const lng = parseFloat(bac.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const alerte = _getAlerte(releve);
    const icon   = _createIcon(alerte);
    const marker = L.marker([lat, lng], { icon }).addTo(_map);

    marker.bindPopup(_buildPopup(bac, releve, alerte), {
      maxWidth:  300,
      className: "compost-popup",
    });

    _markers[bac.id] = { marker, alerte, bac, releve };
  }

  /**
   * Détermine le type d'alerte d'un bac selon son dernier relevé.
   * @returns "normal" | "apport" | "broyat" | "urgence"
   */
  function _getAlerte(releve) {
    if (!releve) return "normal";

    const apport = parseInt(releve.hauteurApport);
    const broyat = parseInt(releve.hauteurBroyat);
    const alerteApport = !isNaN(apport) && apport <= _seuils.apport;
    const alerteBroyat = !isNaN(broyat) && broyat >= _seuils.broyat;

    if (alerteApport && alerteBroyat) return "urgence";
    if (alerteApport)                 return "apport";
    if (alerteBroyat)                 return "broyat";
    return "normal";
  }

  // Couleurs et config par type d'alerte
  const ALERTE_CONFIG = {
    normal:  { color: "#2d6a4f", pulse: false, label: "Normal"             },
    apport:  { color: "#e07b39", pulse: true,  label: "Apport faible"      },
    broyat:  { color: "#3a7abf", pulse: true,  label: "Broyat élevé"       },
    urgence: { color: "#c0392b", pulse: true,  label: "⚠️ Passage urgent"  },
  };

  /**
   * Crée une icône SVG avec animation de pulsation pour les alertes.
   * L'animation CSS est injectée directement dans le SVG.
   */
  function _createIcon(alerte) {
    const cfg   = ALERTE_CONFIG[alerte];
    const color = cfg.color;
    const pulse = cfg.pulse;
    const size  = pulse ? 34 : 28;   // Légèrement plus grand pour les alertes

    // Anneau de pulsation animé (visible seulement en mode alerte)
    const pulseRing = pulse ? `
      <circle cx="14" cy="14" r="11" fill="none" stroke="${color}" stroke-width="2" opacity="0.6">
        <animate attributeName="r"        from="10" to="20" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity"  from="0.7" to="0"  dur="1.6s" repeatCount="indefinite"/>
      </circle>` : "";

    // Icône ⚠ pour urgence, cercle pour les autres
    const inner = alerte === "urgence"
      ? `<text x="14" y="19" text-anchor="middle" font-size="11" fill="${color}" font-weight="bold">!</text>`
      : `<circle cx="14" cy="14" r="5.5" fill="rgba(255,255,255,0.9)"/>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*1.28)}" viewBox="0 0 28 36">
      ${pulseRing}
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      ${inner}
    </svg>`;

    return L.divIcon({
      html:        svg,
      className:   "",
      iconSize:    [size, Math.round(size * 1.28)],
      iconAnchor:  [size / 2, Math.round(size * 1.28)],
      popupAnchor: [0, -Math.round(size * 1.28)],
    });
  }

  function _buildPopup(bac, releve, alerte) {
    const cfg = ALERTE_CONFIG[alerte];

    const alerteBanner = alerte !== "normal"
      ? `<div class="popup__alerte popup__alerte--${alerte}">${cfg.label}</div>`
      : "";

    if (!releve) {
      return `<div class="popup">
        <h3 class="popup__title">${bac.nom}</h3>
        <p class="popup__empty">Aucun relevé enregistré</p>
        <button class="popup__btn" onclick="Forms.openReleveForm('${bac.id}')">+ Premier relevé</button>
      </div>`;
    }

    const problemes  = parseJsonField(releve.problemes);
    const operations = parseJsonField(releve.operations);

    return `<div class="popup">
      ${alerteBanner}
      <h3 class="popup__title">${bac.nom}</h3>
      <p class="popup__date">Relevé du <strong>${formatDate(releve.date)}</strong> — ${releve.agent || "—"}</p>
      <div class="popup__grid">
        <span>🌡️ Température</span>  <strong>${releve.temperature ? releve.temperature + " °C" : "—"}</strong>
        <span>📦 Bac apport</span>   <strong class="${alerte === "apport" || alerte === "urgence" ? "popup__val--alerte" : ""}">${releve.hauteurApport != null ? releve.hauteurApport + " %" : "—"}</strong>
        <span>🪵 Bac broyat</span>   <strong class="${alerte === "broyat" || alerte === "urgence" ? "popup__val--alerte" : ""}">${releve.hauteurBroyat != null ? releve.hauteurBroyat + " %" : "—"}</strong>
        <span>💧 Hygrométrie</span>  <strong>${releve.hygrometrie || "—"}</strong>
        <span>⭐ Qualité</span>      <strong>${formatEtoiles(releve.qualiteCompostage)}</strong>
      </div>
      ${problemes.length  ? `<p class="popup__tags popup__tags--danger">⚠️ ${problemes.join(", ")}</p>` : ""}
      ${operations.length ? `<p class="popup__tags">✅ ${operations.join(", ")}</p>` : ""}
      <div class="popup__actions">
        <button class="popup__btn"                       onclick="Forms.openReleveForm('${bac.id}')">+ Relevé</button>
        <button class="popup__btn popup__btn--secondary" onclick="Forms.openEditBacForm('${bac.id}')">✏️ Modifier</button>
      </div>
    </div>`;
  }

  // ===========================================================================
  // Badge d'alertes dans le header
  // ===========================================================================

  function _updateBadge() {
    const nbAlertes = Object.values(_markers)
      .filter(({ alerte }) => alerte !== "normal").length;

    let badge = document.getElementById("alerte-badge");

    if (nbAlertes === 0) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("div");
      badge.id        = "alerte-badge";
      badge.className = "alerte-badge";
      badge.title     = "Bacs nécessitant un passage";
      // Insère dans le header à droite de la nav
      const nav = document.getElementById("main-nav");
      if (nav) nav.insertAdjacentElement("afterend", badge);
    }

    badge.innerHTML = `⚠️ <strong>${nbAlertes}</strong> bac${nbAlertes > 1 ? "s" : ""} en alerte`;
  }

  // ===========================================================================
  // Filtre "Alertes seulement"
  // ===========================================================================

  function _setupFiltreBtn() {
    const btn = document.getElementById("btn-filtre-alertes");
    if (!btn) return;
    btn.addEventListener("click", () => {
      _filtreAlerte = !_filtreAlerte;
      btn.classList.toggle("map-btn--active", _filtreAlerte);
      btn.textContent = _filtreAlerte ? "Tous les bacs" : "Bacs en alerte";
      _applyFiltre();
    });
  }

  function _applyFiltre() {
    Object.values(_markers).forEach(({ marker, alerte }) => {
      if (_filtreAlerte && alerte === "normal") {
        _map.removeLayer(marker);
      } else {
        marker.addTo(_map);
      }
    });
  }

  // ===========================================================================
  // Légende
  // ===========================================================================

  function _addLegend() {
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML = Object.entries(ALERTE_CONFIG).map(([, cfg]) => `
        <div class="map-legend__item">
          <span class="map-legend__dot${cfg.pulse ? " map-legend__dot--pulse" : ""}"
                style="background:${cfg.color}"></span>
          ${cfg.label}
        </div>`).join("");
      return div;
    };
    legend.addTo(_map);
  }

  // ===========================================================================
  // API publique
  // ===========================================================================

  function focusBac(bacId) {
    const entry = _markers[bacId];
    if (!entry) return;
    _map.setView(entry.marker.getLatLng(), 16);
    entry.marker.openPopup();
  }

  async function refresh() {
    await loadBacs();
  }

  return { init, loadBacs, focusBac, refresh };

})();
