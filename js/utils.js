/**
 * Seuils d'alerte actifs — mis à jour au chargement depuis le Sheet.
 * Partagé entre map.js et table.js.
 */
const SEUILS_ACTIFS = {
  apport: APP_CONFIG.SEUIL_APPORT_ALERTE,   // Valeur par défaut
  broyat: APP_CONFIG.SEUIL_BROYAT_ALERTE,   // Valeur par défaut
};

/**
 * utils.js — Fonctions utilitaires partagées
 * ============================================
 * Fonctions pures sans effet de bord, utilisées par tous les autres modules.
 */

// =============================================================================
// Formatage des données
// =============================================================================

/** Formate une date ISO en "DD/MM/YYYY" */
function formatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Retourne les étoiles Unicode pour une note de 1 à 5 */
function formatEtoiles(note) {
  const n = Math.max(0, Math.min(5, parseInt(note) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/**
 * Parse un champ tableau stocké en JSON dans le Sheet.
 * Gère les cas : JSON string, chaîne vide, undefined.
 */
function parseJsonField(value) {
  if (!value || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Compatibilité données legacy : "val1,val2"
    return String(value).split(",").map(s => s.trim()).filter(Boolean);
  }
}

// =============================================================================
// DOM
// =============================================================================

/** Affiche un toast de notification temporaire (3 secondes) */
function showToast(message, type = "success") {
  document.getElementById("toast")?.remove();

  const toast = document.createElement("div");
  toast.id        = "toast";
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/** Met un bouton en état de chargement (désactivé + texte temporaire) */
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Chargement…";
    btn.disabled    = true;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled    = false;
  }
}

/** Ouvre une modale par son ID */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("modal--open");
  document.body.style.overflow = "hidden";
}

/** Ferme une modale par son ID */
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("modal--open");
  document.body.style.overflow = "";
}

// =============================================================================
// Calculs métier
// =============================================================================

/**
 * Détermine la couleur d'un marqueur selon les alertes seuils.
 * Priorité : alerte apport > alerte broyat > normal.
 */
function getMarkerColor(releve, seuils) {
  if (!releve) return APP_CONFIG.MARQUEUR_NORMAL;

  const apport = parseInt(releve.hauteurApport) || 0;
  const broyat = parseInt(releve.hauteurBroyat) || 0;
  const sApport = seuils?.apport ?? APP_CONFIG.SEUIL_APPORT_ALERTE;
  const sBroyat = seuils?.broyat ?? APP_CONFIG.SEUIL_BROYAT_ALERTE;

  if (apport <= sApport) return APP_CONFIG.MARQUEUR_ALERTE_APPORT;
  if (broyat >= sBroyat) return APP_CONFIG.MARQUEUR_ALERTE_BROYAT;
  return APP_CONFIG.MARQUEUR_NORMAL;
}

/**
 * Regroupe des relevés par période.
 * @param {Array}  releves  - Tableau de relevés
 * @param {string} periode  - "semaine" | "mois" | "annee"
 * @returns {Object}        - { "clé": [relevés...] }
 */
function grouperRelevesPar(releves, periode) {
  const groupes = {};
  for (const r of releves) {
    const d   = new Date(r.date);
    if (isNaN(d)) continue;
    let cle;
    if      (periode === "semaine") cle = `${d.getFullYear()}-S${_semaine(d).toString().padStart(2,"0")}`;
    else if (periode === "mois")    cle = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    else                            cle = `${d.getFullYear()}`;

    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(r);
  }
  return groupes;
}

/** Calcule le numéro de semaine ISO d'une date */
function _semaine(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - debut) / 86400000) + 1) / 7);
}

/**
 * Initialise la fermeture des modales via délégation sur le document.
 * Appelée dès le chargement de la page, sans attendre Auth ni Forms.init().
 * - Clic sur [data-close-modal] → ferme la modale ciblée
 * - Clic sur le fond de la modale → ferme la modale
 */
function initModalClose() {
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-close-modal]");
    if (btn) { closeModal(btn.dataset.closeModal); return; }
    if (e.target.classList.contains("modal")) closeModal(e.target.id);
  });
}

/** Calcule la moyenne d'un tableau, en ignorant les NaN */
function moyenne(valeurs) {
  const valides = valeurs.map(Number).filter(v => !isNaN(v) && isFinite(v));
  if (!valides.length) return null;
  return valides.reduce((a, b) => a + b, 0) / valides.length;
}
