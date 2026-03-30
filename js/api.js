/**
 * api.js — Couche d'accès aux données via JSONP
 * ================================================
 * Apps Script bloque les requêtes fetch cross-origin à cause des redirections.
 * Solution : JSONP pour les lectures (GET), fetch POST pour les écritures.
 *
 * JSONP fonctionne en injectant une balise <script> — pas de CORS.
 * Apps Script supporte nativement le paramètre ?callback=
 */

const _cache = {
  bacs:    null,
  releves: null,
  config:  null,
};

function invalidateCache() {
  _cache.bacs    = null;
  _cache.releves = null;
}

// =============================================================================
// Lectures — via JSONP (pas de CORS)
// =============================================================================

async function apiFetchBacs() {
  if (!_cache.bacs) _cache.bacs = await _get("getBacs");
  return _cache.bacs;
}

async function apiFetchReleves() {
  if (!_cache.releves) _cache.releves = await _get("getReleves");
  return _cache.releves;
}

async function apiFetchConfig() {
  if (!_cache.config) _cache.config = await _get("getConfig");
  return _cache.config;
}

async function apiGetDerniersReleves() {
  const releves = await apiFetchReleves();
  const map     = new Map();
  const tries   = [...releves].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const r of tries) {
    if (!map.has(r.bacId)) map.set(r.bacId, r);
  }
  return map;
}

// =============================================================================
// Écritures — via fetch POST (token dans le body)
// =============================================================================

async function apiAddBac(data)    { const r = await _post("addBac",    data);   invalidateCache(); return r; }
async function apiUpdateBac(data) { const r = await _post("updateBac", data);   invalidateCache(); return r; }
async function apiDeleteBac(id)   { const r = await _post("deleteBac", { id }); invalidateCache(); return r; }
async function apiAddReleve(data) { const r = await _post("addReleve", data);   invalidateCache(); return r; }

// =============================================================================
// GET via JSONP — contourne le blocage CORS des redirections Apps Script
// =============================================================================

function _get(action) {
  return new Promise((resolve, reject) => {
    // Nom de callback unique pour éviter les collisions
    const cbName = "_jsonp_" + action + "_" + Date.now();
    const token  = Auth.getToken();

    // Timeout si Apps Script ne répond pas
    const timeout = setTimeout(() => {
      delete window[cbName];
      script.remove();
      reject(new Error("Timeout — Apps Script ne répond pas"));
    }, 15000);

    // Fonction appelée par Apps Script avec les données
    window[cbName] = (data) => {
      clearTimeout(timeout);
      delete window[cbName];
      script.remove();
      if (!data.success) reject(new Error(data.error || "Erreur serveur"));
      else resolve(data.data);
    };

    // Injection du script JSONP
    const script = document.createElement("script");
    script.src = `${APP_CONFIG.APPS_SCRIPT_URL}`
      + `?action=${action}`
      + `&token=${encodeURIComponent(token)}`
      + `&callback=${cbName}`
      + `&t=${Date.now()}`;
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[cbName];
      reject(new Error("Erreur chargement script Apps Script"));
    };
    document.head.appendChild(script);
  });
}

// =============================================================================
// POST via fetch — pour les écritures uniquement
// =============================================================================

async function _post(action, payload) {
  const token    = Auth.getToken();
  const response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method:  "POST",
    headers: { "Content-Type": "text/plain" },
    body:    JSON.stringify({ action, payload, token }),
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`Erreur réseau (${response.status})`);

  let json;
  try { json = await response.json(); }
  catch { throw new Error("Réponse invalide — vérifiez le déploiement Apps Script"); }

  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}
