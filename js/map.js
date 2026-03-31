/**
 * map.js — Carte interactive Leaflet
 * =====================================
 * Utilise calculerAlerte() de utils.js — source unique des règles d'alerte.
 * Marqueurs animés selon le type d'alerte.
 */

const MapModule = (() => {

  let _map          = null;
  let _markers      = {};
  let _filtreAlerte = false;

  const ALERTE_CONFIG = {
    normal:  { color: "#2d6a4f", pulse: false, label: "Normal"            },
    apport:  { color: "#e07b39", pulse: true,  label: "Apport trop plein" },
    broyat:  { color: "#3a7abf", pulse: true,  label: "Manque de broyat"  },
    inactif: { color: "#b8a000", pulse: true,  label: "Pas de relevé récent" },
  };

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
    const [bacs, derniersReleves] = await Promise.all([
      apiFetchBacs(),
      apiGetDerniersReleves(),
    ]);

    Object.values(_markers).forEach(({ marker }) => marker.remove());
    _markers = {};

    bacs.forEach(bac => _addMarker(bac, derniersReleves.get(bac.id)));

    _updateBadge();
    _updateBandeau();
    _applyFiltre();
  }

  // ===========================================================================
  // Marqueurs
  // ===========================================================================

  function _addMarker(bac, releve) {
    const lat = parseFloat(bac.lat);
    const lng = parseFloat(bac.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    // Utilise la fonction unifiée de utils.js
    const alerte = calculerAlerte(releve);
    const marker = L.marker([lat, lng], { icon: _createIcon(alerte) }).addTo(_map);

    marker.bindPopup(_buildPopup(bac, releve, alerte), {
      maxWidth: 300, className: "compost-popup",
    });

    _markers[bac.id] = { marker, alerte, bac, releve };
  }

  function _createIcon(alerte) {
    const cfg   = ALERTE_CONFIG[alerte];
    const color = cfg.color;
    const size  = cfg.pulse ? 34 : 28;

    const pulseRing = cfg.pulse ? `
      <circle cx="14" cy="14" r="11" fill="none" stroke="${color}" stroke-width="2" opacity="0.6">
        <animate attributeName="r"       from="10" to="20" dur="1.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.7" to="0"  dur="1.6s" repeatCount="indefinite"/>
      </circle>` : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*1.28)}" viewBox="0 0 28 36">
      ${pulseRing}
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5.5" fill="rgba(255,255,255,0.9)"/>
    </svg>`;

    return L.divIcon({
      html: svg, className: "",
      iconSize:    [size, Math.round(size * 1.28)],
      iconAnchor:  [size / 2, Math.round(size * 1.28)],
      popupAnchor: [0, -Math.round(size * 1.28)],
    });
  }

  function _buildPopup(bac, releve, alerte) {
    const cfg = ALERTE_CONFIG[alerte];
    const alerteBanner = alerte !== "normal"
      ? `<div class="popup__alerte popup__alerte--${alerte}">⚠️ ${cfg.label}</div>` : "";

    if (!releve) {
      return `<div class="popup">
        <div class="popup__alerte popup__alerte--inactif">⏰ Aucun relevé enregistré</div>
        <h3 class="popup__title">${bac.nom}</h3>
        <button class="popup__btn" onclick="Forms.openReleveForm('${bac.id}')">+ Premier relevé</button>
      </div>`;
    }
    // Alerte inactivité avec relevé existant mais trop ancien
    if (alerte === "inactif") {
      const alerteBannerInactif = `<div class="popup__alerte popup__alerte--inactif">⏰ Pas de relevé depuis plus de ${SEUILS_ACTIFS.joursSansReleve} jours</div>`;
      const problemes  = parseJsonField(releve.problemes);
      return `<div class="popup">
        ${alerteBannerInactif}
        <h3 class="popup__title">${bac.nom}</h3>
        <p class="popup__date">Dernier relevé : <strong>${formatDate(releve.date)}</strong> — ${releve.agent || "—"}</p>
        <div class="popup__actions">
          <button class="popup__btn" onclick="Forms.openReleveForm('${bac.id}')">+ Relevé</button>
          <button class="popup__btn popup__btn--secondary" onclick="Forms.openEditBacForm('${bac.id}')">✏️ Modifier</button>
        </div>
      </div>`;
    }

    const problemes  = parseJsonField(releve.problemes);
    const operations = parseJsonField(releve.operations);

    return `<div class="popup">
      ${alerteBanner}
      <h3 class="popup__title">${bac.nom}</h3>
      <p class="popup__date">Relevé du <strong>${formatDate(releve.date)}</strong> — ${releve.agent || "—"}</p>
      <div class="popup__grid">
        <span>🌡️ Température</span> <strong>${releve.temperature ? releve.temperature + " °C" : "—"}</strong>
        <span>📦 Bac apport</span>  <strong class="${alerte === "apport" ? "popup__val--alerte" : ""}">${releve.hauteurApport != null ? releve.hauteurApport + " %" : "—"}</strong>
        <span>🪵 Bac broyat</span>  <strong class="${alerte === "broyat" ? "popup__val--alerte" : ""}">${releve.hauteurBroyat != null ? releve.hauteurBroyat + " %" : "—"}</strong>
        <span>💧 Hygrométrie</span> <strong>${releve.hygrometrie || "—"}</strong>
        <span>⭐ Qualité</span>     <strong>${formatEtoiles(releve.qualiteCompostage)}</strong>
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
  // Badge header
  // ===========================================================================

  function _updateBadge() {
    const nbAlertes = Object.values(_markers)
      .filter(({ alerte }) => alerte !== "normal").length;

    let badge = document.getElementById("alerte-badge");
    if (nbAlertes === 0) { if (badge) badge.remove(); return; }

    if (!badge) {
      badge = document.createElement("div");
      badge.id        = "alerte-badge";
      badge.className = "alerte-badge";
      const nav = document.getElementById("main-nav");
      if (nav) nav.insertAdjacentElement("afterend", badge);
    }

    badge.innerHTML    = `⚠️ <strong>${nbAlertes}</strong> bac${nbAlertes > 1 ? "s" : ""} en alerte`;
    badge.style.cursor = "pointer";
    badge.onclick      = () => {
      if (!_filtreAlerte) {
        _filtreAlerte = true;
        const btn = document.getElementById("btn-filtre-alertes");
        if (btn) { btn.classList.add("map-btn--active"); btn.textContent = "Tous les bacs"; }
        _applyFiltre();
      }
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
    };
  }

  // ===========================================================================
  // Bandeau récapitulatif
  // ===========================================================================

  function _updateBandeau() {
    const container = document.getElementById("alertes-bandeau");
    if (!container) return;

    const alertes = Object.values(_markers)
      .filter(({ alerte }) => alerte !== "normal")
      .sort((a, b) => (a.alerte === "apport" ? -1 : 1));

    if (!alertes.length) { container.style.display = "none"; return; }

    container.style.display = "block";
    container.innerHTML = `
      <div class="bandeau__titre">
        ⚠️ <strong>${alertes.length} bac${alertes.length > 1 ? "s" : ""} nécessitant un passage</strong>
      </div>
      <div class="bandeau__liste">
        ${alertes.map(({ bac, alerte, releve }) => {
          const c      = ALERTE_CONFIG[alerte];
          const detail = alerte === "apport"
            ? `Apport trop plein (${releve?.hauteurApport ?? "—"}%)`
            : alerte === "broyat"
            ? `Manque de broyat (${releve?.hauteurBroyat ?? "—"}%)`
            : releve
            ? `Dernier relevé : ${formatDate(releve.date)}`
            : `Aucun relevé enregistré`;
          return `<button class="bandeau__item" data-bacid="${bac.id}">
            <span class="bandeau__dot" style="background:${c.color}"></span>
            <span class="bandeau__nom">${bac.nom}</span>
            <span class="bandeau__detail">${detail}</span>
          </button>`;
        }).join("")}
      </div>`;

    container.querySelectorAll(".bandeau__item").forEach(btn =>
      btn.addEventListener("click", () => focusBac(btn.dataset.bacid))
    );
  }

  // ===========================================================================
  // Filtre alertes
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
      if (_filtreAlerte && alerte === "normal") _map.removeLayer(marker);
      else marker.addTo(_map);
    });
  }

  // ===========================================================================
  // Légende
  // ===========================================================================

  function _addLegend() {
    const legend = L.control({ position: "topleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML = Object.entries(ALERTE_CONFIG).map(([, cfg]) => `
        <div class="map-legend__item">
          <span class="map-legend__dot${cfg.pulse ? " map-legend__dot--pulse" : ""}"
                style="background:${cfg.color}"></span>${cfg.label}
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

  async function refresh() { await loadBacs(); }

  return { init, loadBacs, focusBac, refresh };

})();
