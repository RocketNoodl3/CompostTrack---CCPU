/**
 * table.js — Tableau récapitulatif des bacs
 * ===========================================
 * Une ligne par bac affichant le dernier relevé.
 * Au clic sur la ligne → déplie un sous-tableau avec tous les relevés du bac.
 * Pattern master/detail : expandable rows.
 */

const TableModule = (() => {

  let _donnees    = [];    // [{ bac, dernierReleve, tousLesReleves[] }]
  let _sortCol    = null;
  let _sortAsc    = true;
  let _filtreTerm = "";
  let _expanded   = new Set();   // IDs des bacs dont le détail est ouvert

  // Colonnes du tableau principal (dernier relevé)
  const COLONNES = [
    { key: "nom",               label: "Site de compostage" },
    { key: "date",              label: "Dernier relevé",     format: formatDate },
    { key: "agent",             label: "Agent" },
    { key: "typeReleve",        label: "Type" },
    { key: "temperature",       label: "Temp. (°C)" },
    { key: "hauteurApport",     label: "Apport (%)" },
    { key: "hauteurBroyat",     label: "Broyat (%)" },
    { key: "hygrometrie",       label: "Hygro." },
    { key: "qualiteApports",    label: "Qualité apports" },
    { key: "qualiteCompostage", label: "Note ★",             format: formatEtoiles },
    { key: "problemes",         label: "Problèmes",          format: v => parseJsonField(v).join(", ") || "—" },
  ];

  // Colonnes du sous-tableau historique (tous les relevés)
  const COLONNES_DETAIL = [
    { key: "date",              label: "Date",               format: formatDate },
    { key: "agent",             label: "Agent" },
    { key: "typeReleve",        label: "Type" },
    { key: "temperature",       label: "Temp. (°C)" },
    { key: "hauteurApport",     label: "Apport (%)" },
    { key: "hauteurBroyat",     label: "Broyat (%)" },
    { key: "hygrometrie",       label: "Hygro." },
    { key: "qualiteApports",    label: "Qualité apports" },
    { key: "qualiteCompostage", label: "Note ★",             format: formatEtoiles },
    { key: "problemes",         label: "Problèmes",          format: v => parseJsonField(v).join(", ") || "—" },
    { key: "operations",        label: "Opérations",         format: v => parseJsonField(v).join(", ") || "—" },
    { key: "actionsPlanif",     label: "Actions planif.",    format: v => parseJsonField(v).join(", ") || "—" },
  ];

  // ===========================================================================
  // Chargement
  // ===========================================================================

  async function load() {
    _setLoading(true);

    const [bacs, releves] = await Promise.all([
      apiFetchBacs(),
      apiFetchReleves(),
    ]);

    // Groupe tous les relevés par bacId, triés du plus récent au plus ancien
    const relevesByBac = new Map();
    bacs.forEach(b => relevesByBac.set(b.id, []));
    releves.forEach(r => {
      if (relevesByBac.has(r.bacId)) relevesByBac.get(r.bacId).push(r);
    });
    // Tri par datetime complet — gère plusieurs relevés le même jour
    relevesByBac.forEach((arr) => arr.sort((a, b) => new Date(b.date) - new Date(a.date)));

    // Construit les données : bac + dernier relevé + historique complet
    _donnees = bacs.map(bac => {
      const tous    = relevesByBac.get(bac.id) || [];
      const dernier = tous[0] || {};
      return {
        _bacId:    bac.id,
        nom:       bac.nom,
        lat:       bac.lat,
        lng:       bac.lng,
        // Données du dernier relevé (pour la ligne principale)
        ...dernier,
        // Réécrit les champs ambigus
        _bacNom:   bac.nom,
        _releves:  tous,          // Historique complet pour le détail
        _nbReleves: tous.length,
      };
    });

    _setLoading(false);
    _render();
  }

  function _setLoading(loading) {
    const tbody = document.getElementById("table-body");
    if (tbody && loading) {
      tbody.innerHTML = `<tr><td colspan="${COLONNES.length + 2}" class="table__loading">
        <span class="spinner"></span> Chargement…
      </td></tr>`;
    }
  }

  // ===========================================================================
  // Rendu
  // ===========================================================================

  function _render() {
    _renderHeader();
    _renderBody();
  }

  function _renderHeader() {
    const thead = document.getElementById("table-head");
    if (!thead) return;

    const ths = COLONNES.map(col => {
      const actif = _sortCol === col.key;
      const arrow = actif ? (_sortAsc ? " ↑" : " ↓") : "";
      return `<th class="table__th${actif ? " table__th--active" : ""}" data-col="${col.key}">
        ${col.label}${arrow}
      </th>`;
    });

    // Colonne expand + colonne actions
    thead.innerHTML = `<tr>
      <th class="table__th table__th--expand"></th>
      <th class="table__th table__th--actions">Actions</th>
      ${ths.join("")}
    </tr>`;

    thead.querySelectorAll("th[data-col]").forEach(th =>
      th.addEventListener("click", () => {
        _sortAsc = _sortCol === th.dataset.col ? !_sortAsc : true;
        _sortCol = th.dataset.col;
        _renderBody();
        _renderHeader();
      })
    );
  }

  function _renderBody() {
    const tbody = document.getElementById("table-body");
    if (!tbody) return;

    let lignes = [..._donnees];

    if (_filtreTerm) {
      const term = _filtreTerm.toLowerCase();
      lignes = lignes.filter(row =>
        COLONNES.some(col => String(row[col.key] ?? "").toLowerCase().includes(term))
      );
    }

    if (_sortCol) {
      lignes.sort((a, b) => {
        const va = a[_sortCol] ?? "";
        const vb = b[_sortCol] ?? "";
        const cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
        return _sortAsc ? cmp : -cmp;
      });
    }

    if (!lignes.length) {
      tbody.innerHTML = `<tr><td colspan="${COLONNES.length + 2}" class="table__empty">Aucun résultat</td></tr>`;
      return;
    }

    // Génère les lignes principales + lignes de détail intercalées
    tbody.innerHTML = lignes.map(row => {
      const main   = _renderRowMain(row);
      const detail = _expanded.has(row._bacId) ? _renderRowDetail(row) : "";
      return main + detail;
    }).join("");

    // Événements boutons actions
    tbody.querySelectorAll("[data-action]").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();   // Ne pas déclencher le toggle au clic sur un bouton
        _handleAction(e);
      })
    );

    // Événement toggle au clic sur la ligne (hors boutons)
    tbody.querySelectorAll(".table__row--main").forEach(tr =>
      tr.addEventListener("click", () => _toggleDetail(tr.dataset.id))
    );
  }

  // ── Ligne principale (dernier relevé) ──────────────────────────────────────

  function _renderRowMain(row) {
    const id       = row._bacId;
    const isOpen   = _expanded.has(id);
    const nbReleves = row._nbReleves;
    const hasReleves = nbReleves > 0;

    const cells = COLONNES.map(col => {
      const rawVal = row[col.key];
      let val = rawVal != null && rawVal !== "" ? rawVal : "—";
      if (col.format && val !== "—") val = col.format(val);

      let cls = "table__td";
      if (col.key === "hauteurApport" && parseInt(row.hauteurApport) >= SEUILS_ACTIFS.apport && hasReleves) cls += " table__td--alerte-apport";
      if (col.key === "hauteurBroyat" && parseInt(row.hauteurBroyat) <= SEUILS_ACTIFS.broyat && hasReleves) cls += " table__td--alerte-broyat";

      return `<td class="${cls}">${val}</td>`;
    });

    const expandBtn = hasReleves
      ? `<td class="table__td table__td--expand">
          <button class="table__expand-btn${isOpen ? " table__expand-btn--open" : ""}"
                  title="${isOpen ? "Masquer" : "Voir les " + nbReleves + " relevé(s)"}">
            ${isOpen ? "▲" : "▼"}
            <span class="table__nb-releves">${nbReleves}</span>
          </button>
        </td>`
      : `<td class="table__td table__td--expand"><span class="table__no-releve">—</span></td>`;

    const actions = `<td class="table__td table__td--actions">
      <button class="table__action-btn" data-action="focus"  data-id="${id}" title="Voir sur la carte">📍</button>
      <button class="table__action-btn" data-action="releve" data-id="${id}" title="Nouveau relevé">📋</button>
      <button class="table__action-btn" data-action="edit"   data-id="${id}" title="Modifier">✏️</button>
      <button class="table__action-btn table__action-btn--danger" data-action="delete" data-id="${id}" title="Supprimer">🗑️</button>
    </td>`;

    return `<tr class="table__row table__row--main${isOpen ? " table__row--expanded" : ""}" data-id="${id}" style="cursor:${hasReleves ? "pointer" : "default"}">
      ${expandBtn}${actions}${cells.join("")}
    </tr>`;
  }

  // ── Ligne de détail (sous-tableau historique) ──────────────────────────────

  function _renderRowDetail(row) {
    const colspan = COLONNES.length + 2;
    const releves = row._releves;

    const headers = COLONNES_DETAIL.map(c =>
      `<th class="detail__th">${c.label}</th>`
    ).join("");

    const lignes = releves.map((r, idx) => {
      const cells = COLONNES_DETAIL.map(col => {
        const rawVal = r[col.key];
        let val = rawVal != null && rawVal !== "" ? rawVal : "—";
        if (col.format && val !== "—") val = col.format(val);
        return `<td class="detail__td">${val}</td>`;
      }).join("");
      // Badge "Dernier" sur la première ligne
      const badge = idx === 0 ? `<span class="detail__badge">Dernier</span>` : "";
      return `<tr class="detail__row${idx === 0 ? " detail__row--latest" : ""}">
        <td class="detail__td detail__td--index">${badge || (releves.length - idx)}</td>
        ${cells}
      </tr>`;
    }).join("");

    return `<tr class="table__row--detail">
      <td colspan="${colspan}" class="table__td--detail">
        <div class="detail__wrapper">
          <div class="detail__header">
            📋 Historique des relevés — <strong>${row._bacNom}</strong>
            <span class="detail__count">${releves.length} relevé(s)</span>
          </div>
          <div class="detail__scroll">
            <table class="detail__table">
              <thead><tr><th class="detail__th">#</th>${headers}</tr></thead>
              <tbody>${lignes}</tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>`;
  }

  // ===========================================================================
  // Interactions
  // ===========================================================================

  function _toggleDetail(bacId) {
    if (_expanded.has(bacId)) {
      _expanded.delete(bacId);
    } else {
      _expanded.add(bacId);
    }
    _renderBody();
  }

  function _handleAction(e) {
    const { action, id } = e.currentTarget.dataset;
    switch (action) {
      case "focus":  MapModule.focusBac(id);   break;
      case "releve": Forms.openReleveForm(id);  break;
      case "edit":   Forms.openEditBacForm(id); break;
      case "delete": _confirmDelete(id);        break;
    }
  }

  async function _confirmDelete(id) {
    const bac = _donnees.find(d => d._bacId === id);
    if (!confirm(`Supprimer le bac "${bac?._bacNom}" ?\nSes relevés resteront dans le Sheet.`)) return;
    try {
      await apiDeleteBac(id);
      showToast("Bac supprimé");
      _expanded.delete(id);
      await load();
      await MapModule.refresh();
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    }
  }

  function setFiltre(terme) {
    _filtreTerm = terme;
    _renderBody();
  }

  async function refresh() {
    await load();
  }

  return { load, setFiltre, refresh };

})();
