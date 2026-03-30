/**
 * api.js — Couche d'accès aux données
 * =====================================
 * Toutes les requêtes (lectures ET écritures) passent par POST.
 * Cela évite les problèmes CORS liés aux redirections Google sur les GET
 * et contourne la limite de taille des paramètres URL (token JWT trop long).
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
// Lectures
// =============================================================================

async function apiFetchBacs() {
  if (!_cache.bacs) _cache.bacs = await _post("getBacs", {});
  return _cache.bacs;
}

async function apiFetchReleves() {
  if (!_cache.releves) _cache.releves = await _post("getReleves", {});
  return _cache.releves;
}

async function apiFetchConfig() {
  if (!_cache.config) _cache.config = await _post("getConfig", {});
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
// Écritures
// =============================================================================

async function apiAddBac(data)    { const r = await _post("addBac",    data);   invalidateCache(); return r; }
async function apiUpdateBac(data) { const r = await _post("updateBac", data);   invalidateCache(); return r; }
async function apiDeleteBac(id)   { const r = await _post("deleteBac", { id }); invalidateCache(); return r; }
async function apiAddReleve(data) { const r = await _post("addReleve", data);   invalidateCache(); return r; }

// =============================================================================
// Requête HTTP interne — tout en POST pour éviter les problèmes CORS
// =============================================================================

async function _post(action, payload) {
  const token    = Auth.getToken();
  const response = await fetch(APP_CONFIG.APPS_SCRIPT_URL, {
    method:   "POST",
    headers:  { "Content-Type": "text/plain" },  // text/plain évite le preflight CORS
    body:     JSON.stringify({ action, payload, token }),
    redirect: "follow",
  });

  if (!response.ok) throw new Error(`Erreur réseau (${response.status})`);

  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Erreur serveur");
  return json.data;
}
