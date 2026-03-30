/**
 * COMPOSTTRACK — Google Apps Script Web App
 * ==========================================
 * Utilise JSONP pour contourner les limitations CORS d'Apps Script.
 * Le client envoie un paramètre "callback" dans l'URL GET.
 * Apps Script enveloppe la réponse JSON dans ce callback.
 *
 * DÉPLOIEMENT :
 *   1. Extensions > Apps Script > coller ce code
 *   2. Remplir EMAILS_AUTORISES
 *   3. Déployer > Nouveau déploiement
 *      - Type : Application Web
 *      - Exécuter en tant que : Moi
 *      - Qui a accès : Tout le monde connecté à Google
 *   4. Copier l'URL dans js/config.js
 */

const EMAILS_AUTORISES = [
  "monkeywooood@gmail.com",
  // Ajoutez vos agents ici
];

const SHEET_BACS         = "bacs";
const SHEET_RELEVES      = "relevés";
const SHEET_SEUILS       = "config_seuils";
const SHEET_AGENTS       = "config_agents";
const SHEET_OPERATIONS   = "config_operations";
const SHEET_PROBLEMES    = "config_problemes";
const SHEET_TYPES_RELEVE = "config_types_releve";

// =============================================================================
// Points d'entrée
// =============================================================================

/**
 * GET : lectures + écritures via paramètre "data" encodé en base64
 * Utilise JSONP pour contourner CORS : ?callback=fn&action=...&token=...
 */
function doGet(e) {
  const callback = e.parameter.callback;
  try {
    const email = _verifierToken(e.parameter.token);
    let data;
    switch (e.parameter.action) {
      case "getBacs":    data = getBacs();            break;
      case "getReleves": data = getReleves();         break;
      case "getConfig":  data = getConfig();          break;
      case "addBac":     data = addBac(JSON.parse(e.parameter.payload));       break;
      case "updateBac":  data = updateBac(JSON.parse(e.parameter.payload));    break;
      case "deleteBac":  data = deleteBac(JSON.parse(e.parameter.payload).id); break;
      case "addReleve":  data = addReleve(JSON.parse(e.parameter.payload));    break;
      default: return _jsonp(callback, { error: "Action inconnue" });
    }
    return _jsonp(callback, { success: true, data });
  } catch (err) {
    return _jsonp(callback, { error: err.message });
  }
}

/**
 * POST : gardé pour compatibilité mais JSONP via GET est préféré
 */
function doPost(e) {
  try {
    const body  = JSON.parse(e.postData.contents);
    const email = _verifierToken(body.token);
    let data;
    switch (body.action) {
      case "getBacs":    data = getBacs();                break;
      case "getReleves": data = getReleves();             break;
      case "getConfig":  data = getConfig();              break;
      case "addBac":     data = addBac(body.payload);     break;
      case "updateBac":  data = updateBac(body.payload);  break;
      case "deleteBac":  data = deleteBac(body.payload.id); break;
      case "addReleve":  data = addReleve(body.payload);  break;
      default: return _response({ error: "Action inconnue" });
    }
    return _response({ success: true, data });
  } catch (err) {
    return _response({ error: err.message });
  }
}

// =============================================================================
// Vérification token Google
// =============================================================================

function _verifierToken(token) {
  if (!token) throw new Error("Accès refusé — token manquant.");

  let payload;
  try {
    const response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + token,
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) throw new Error();
    payload = JSON.parse(response.getContentText());
  } catch (err) {
    throw new Error("Accès refusé — token invalide.");
  }

  if (payload.exp && Date.now() / 1000 > parseInt(payload.exp)) {
    throw new Error("Accès refusé — session expirée.");
  }

  const email    = (payload.email || "").toLowerCase();
  const autorise = EMAILS_AUTORISES.map(e => e.toLowerCase()).includes(email);
  if (!autorise) throw new Error(`Accès refusé — compte non autorisé (${email}).`);

  return email;
}

// =============================================================================
// Lectures / Écritures
// =============================================================================

function getBacs()    { return _sheetToObjects(SHEET_BACS);    }
function getReleves() { return _sheetToObjects(SHEET_RELEVES); }
function getConfig()  {
  return {
    seuils:      _sheetToObjects(SHEET_SEUILS),
    agents:      _sheetToObjects(SHEET_AGENTS),
    operations:  _sheetToObjects(SHEET_OPERATIONS),
    problemes:   _sheetToObjects(SHEET_PROBLEMES),
    typesReleve: _sheetToObjects(SHEET_TYPES_RELEVE),
  };
}

function addBac(data) {
  const sheet = _getSheet(SHEET_BACS);
  const id    = _generateId();
  sheet.appendRow([id, data.nom, data.lat, data.lng, new Date().toISOString()]);
  return { id };
}

function updateBac(data) {
  const sheet = _getSheet(SHEET_BACS);
  const row   = _findRowById(sheet, data.id);
  if (!row) throw new Error("Bac introuvable : " + data.id);
  sheet.getRange(row, 2).setValue(data.nom);
  sheet.getRange(row, 3).setValue(data.lat);
  sheet.getRange(row, 4).setValue(data.lng);
  return { updated: true };
}

function deleteBac(id) {
  const sheet = _getSheet(SHEET_BACS);
  const row   = _findRowById(sheet, id);
  if (!row) throw new Error("Bac introuvable : " + id);
  sheet.deleteRow(row);
  return { deleted: true };
}

function addReleve(data) {
  const sheet = _getSheet(SHEET_RELEVES);
  const id    = _generateId();
  sheet.appendRow([
    id, data.date, data.bacId, data.agent, data.typeReleve,
    data.temperature, data.hauteurApport, data.hauteurBroyat,
    data.hygrometrie, data.qualiteApports,
    JSON.stringify(data.problemes     || []),
    JSON.stringify(data.operations    || []),
    data.operationsAutre  || "",
    JSON.stringify(data.actionsPlanif || []),
    data.actionsAutre     || "",
    data.qualiteCompostage,
    new Date().toISOString(),
  ]);
  return { id };
}

// =============================================================================
// Utilitaires
// =============================================================================

function _getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Onglet introuvable : " + name);
  return sheet;
}

function _sheetToObjects(sheetName) {
  const sheet  = _getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => h.toString().trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return null;
}

function _generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/** Réponse JSON standard (pour doPost) */
/**
 * Gère les requêtes OPTIONS (preflight CORS envoyées par le navigateur).
 * Sans cette fonction, les POST depuis GitHub Pages sont bloqués.
 */
function doOptions(e) {
  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Retourne une réponse JSON ou JSONP selon la présence du paramètre callback.
 * JSONP : enveloppe la réponse dans callback({...}) pour contourner le CORS.
 */
function _responseJsonp(data, callback) {
  if (callback) {
    // Mode JSONP — le navigateur exécute callback(data) via une balise <script>
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(data) + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _response(data) {
  return _responseJsonp(data, null);
}

/**
 * Réponse JSONP — enveloppe le JSON dans un appel de fonction JS.
 * Contourne les limitations CORS d'Apps Script sur les requêtes cross-origin.
 * Ex: callback=fn → fn({"success":true,"data":[...]})
 */
function _jsonp(callback, data) {
  const js = callback
    ? `${callback}(${JSON.stringify(data)})`
    : JSON.stringify(data);
  return ContentService
    .createTextOutput(js)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
