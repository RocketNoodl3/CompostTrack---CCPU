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
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwxzjfczvTWGAE9Hw5Dz2Vf9z6h6hKxzVsxyf3u2ZbNSBRzjLz_pZKzB4OCF_9RP4-q/exec",

  // ── Google Client ID ─────────────────────────────────────────────────────────
  // Créé dans Google Cloud Console > APIs & Services > Identifiants
  // Type : Application Web — voir README.md pour le guide pas à pas (~5 min)
  GOOGLE_CLIENT_ID: "220426324353-rj9ba2fbmh2eiao69em8k1pifl08ikbb.apps.googleusercontent.com",

  // ── Carte Leaflet ────────────────────────────────────────────────────────────
  MAP_CENTER:       [45.3633304993826, 5.589996711730135],   // Coordonnées du centre de votre territoire
  MAP_ZOOM_DEFAULT: 14,

  // ── Seuils d'alerte par défaut ───────────────────────────────────────────────
  // Ces valeurs sont écrasées par celles de l'onglet config_seuils du Sheet.
  SEUIL_APPORT_ALERTE: 80,    // Hauteur bac apport  >= X % → marqueur orange
  SEUIL_BROYAT_ALERTE: 20,    // Hauteur bac broyat  <= X % → marqueur bleu

  // ── Couleurs des marqueurs ───────────────────────────────────────────────────
  MARQUEUR_NORMAL:        "#2d6a4f",
  MARQUEUR_ALERTE_APPORT: "#e07b39",
  MARQUEUR_ALERTE_BROYAT: "#3a7abf",

});
