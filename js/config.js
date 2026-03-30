/**
 * config.js — Configuration centrale de l'application
 * ======================================================
 * Fichiers à modifier après déploiement :
 *   1. APPS_SCRIPT_URL  — URL de votre Apps Script déployé
 *   2. GOOGLE_CLIENT_ID — Client ID créé dans Google Cloud Console
 *   3. MAP_CENTER       — Coordonnées GPS de votre territoire
 */

const APP_CONFIG = Object.freeze({

  // ── URL de votre Apps Script déployé ────────────────────────────────────────
  // Exemple : "https://script.google.com/macros/s/AKfy.../exec"
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxER4Kgn4imAu2TKEsa1v4F-wumDF9F-mRWWymQRrJpFioVe-39eMNXCxBmtfPVTero/exec",

  // ── Google Client ID ─────────────────────────────────────────────────────────
  // Créé dans Google Cloud Console > APIs & Services > Identifiants
  // Type : Application Web — voir README.md pour le guide pas à pas (~5 min)
  GOOGLE_CLIENT_ID: "220426324353-rj9ba2fbmh2eiao69em8k1pifl08ikbb.apps.googleusercontent.com",

  // ── Carte Leaflet ────────────────────────────────────────────────────────────
  MAP_CENTER:       [45.91524599265989, 3.8344004689808946],   // Coordonnées du centre de votre territoire
  MAP_ZOOM_DEFAULT: 12,

  // ── Seuils d'alerte par défaut ───────────────────────────────────────────────
  // Ces valeurs sont écrasées par celles de l'onglet config_seuils du Sheet.
  SEUIL_APPORT_ALERTE: 30,    // Hauteur bac apport  ≤ X % → marqueur orange
  SEUIL_BROYAT_ALERTE: 70,    // Hauteur bac broyat  ≥ X % → marqueur bleu

  // ── Couleurs des marqueurs ───────────────────────────────────────────────────
  MARQUEUR_NORMAL:        "#2d6a4f",
  MARQUEUR_ALERTE_APPORT: "#e07b39",
  MARQUEUR_ALERTE_BROYAT: "#3a7abf",

});
