/**
 * forms.js — Formulaires de saisie
 * ==================================
 * Gère deux formulaires :
 *   - Bac : création et modification (nom + GPS)
 *   - Relevé : saisie complète avec listes dynamiques depuis le Sheet
 */

const Forms = (() => {

  let _config = null;   // Configuration Sheet (agents, opérations, etc.)
  let _bacs   = null;   // Liste des bacs pour le select du formulaire relevé
  let _editId = null;   // ID du bac en cours de modification (null = création)

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  async function init() {
    [_config, _bacs] = await Promise.all([apiFetchConfig(), apiFetchBacs()]);
    _setupBacForm();
    _setupReleveForm();
  }

  // ===========================================================================
  // Formulaire Bac
  // ===========================================================================

  function _setupBacForm() {
    const form = document.getElementById("form-bac");
    if (!form) return;

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("[type=submit]");
      setButtonLoading(btn, true);
      try {
        const data = {
          id:  _editId,
          nom: form.nom.value.trim(),
          lat: parseFloat(form.lat.value),
          lng: parseFloat(form.lng.value),
        };
        if (isNaN(data.lat) || isNaN(data.lng)) throw new Error("Coordonnées GPS invalides");

        if (_editId) {
          await apiUpdateBac(data);
          showToast("Bac mis à jour ✓");
        } else {
          await apiAddBac(data);
          showToast("Bac ajouté ✓");
        }

        closeModal("modal-bac");
        form.reset();
        _editId = null;
        // Rafraîchit uniquement le module de la page courante
        if (typeof TableModule !== "undefined") await TableModule.refresh();
        if (typeof MapModule   !== "undefined") await MapModule.refresh();
        await _refreshSelectBacs();
      } catch (err) {
        showToast("Erreur : " + err.message, "error");
      } finally {
        setButtonLoading(btn, false);
      }
    });

    // Bouton géolocalisation
    document.getElementById("btn-gps")?.addEventListener("click", () => {
      if (!navigator.geolocation) { showToast("Géolocalisation non supportée", "error"); return; }
      const btn = document.getElementById("btn-gps");
      btn.textContent = "Localisation…";
      navigator.geolocation.getCurrentPosition(
        pos => {
          form.lat.value  = pos.coords.latitude.toFixed(6);
          form.lng.value  = pos.coords.longitude.toFixed(6);
          btn.textContent = "📍 Ma position";
        },
        () => {
          showToast("Position indisponible", "error");
          btn.textContent = "📍 Ma position";
        }
      );
    });
  }

  /** Ouvre le formulaire en mode création */
  function openAddBacForm() {
    _editId = null;
    document.getElementById("modal-bac-title").textContent = "Nouveau bac";
    document.getElementById("form-bac").reset();
    openModal("modal-bac");
  }

  /** Ouvre le formulaire en mode édition avec les données du bac existant */
  async function openEditBacForm(bacId) {
    const bacs = await apiFetchBacs();
    const bac  = bacs.find(b => b.id === bacId);
    if (!bac) { showToast("Bac introuvable", "error"); return; }

    _editId = bacId;
    const form = document.getElementById("form-bac");
    document.getElementById("modal-bac-title").textContent = "Modifier le bac";
    form.nom.value = bac.nom;
    form.lat.value = bac.lat;
    form.lng.value = bac.lng;
    openModal("modal-bac");
  }

  // ===========================================================================
  // Formulaire Relevé
  // ===========================================================================

  function _setupReleveForm() {
    const form = document.getElementById("form-releve");
    if (!form) return;

    // Remplissage des <select> depuis la config Sheet
    _fillSelect("releve-bac",   _bacs.map(b => ({ value: b.id,    label: b.nom })));
    _fillSelect("releve-agent", _config.agents.map(a => ({ value: a.nom,  label: a.nom })));
    _fillSelect("releve-type",  _config.typesReleve.map(t => ({ value: t.type, label: t.type })));

    // Checkboxes dynamiques depuis la config
    _fillCheckboxGroup("releve-problemes",     _config.problemes.map(p => p.probleme));
    _fillCheckboxGroup("releve-operations",    _config.operations.map(o => o.operation), "releve-operations-autre");
    _fillCheckboxGroup("releve-actions-planif",_config.operations.map(o => o.operation), "releve-actions-autre");

    // Soumission du formulaire relevé
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("[type=submit]");
      setButtonLoading(btn, true);
      try {
        await apiAddReleve(_collectReleve(form));
        showToast("Relevé enregistré ✓");
        closeModal("modal-releve");
        form.reset();
        _resetStars();
        _resetRanges();
        // Rafraîchit uniquement les modules présents sur la page courante
        const refreshes = [];
        if (typeof MapModule   !== "undefined" && MapModule.refresh)   refreshes.push(MapModule.refresh());
        if (typeof TableModule !== "undefined" && TableModule.refresh) refreshes.push(TableModule.refresh());
        await Promise.all(refreshes);
      } catch (err) {
        showToast("Erreur : " + err.message, "error");
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  /** Collecte toutes les valeurs du formulaire relevé */
  function _collectReleve(form) {
    return {
      date:              form["releve-date"].value,
      bacId:             form["releve-bac"].value,
      agent:             form["releve-agent"].value,
      typeReleve:        form["releve-type"].value,
      temperature:       parseFloat(form["releve-temp"].value) || null,
      hauteurApport:     parseInt(form["releve-apport"].value),
      hauteurBroyat:     parseInt(form["releve-broyat"].value),
      hygrometrie:       form["releve-hygro"].value,
      qualiteApports:    form["releve-qualite-apports"].value,
      problemes:         _getChecked("releve-problemes"),
      operations:        _getChecked("releve-operations"),
      operationsAutre:   form["releve-operations-autre"]?.value || "",
      actionsPlanif:     _getChecked("releve-actions-planif"),
      actionsAutre:      form["releve-actions-autre"]?.value || "",
      qualiteCompostage: form["releve-etoiles"]?.value || "",
    };
  }

  /** Ouvre le formulaire relevé, avec un bac pré-sélectionné si fourni */
  function openReleveForm(bacId) {
    // Date du jour par défaut
    const dateInput = document.getElementById("releve-date");
    if (dateInput && !dateInput.value) {
      // Valeur par défaut : date ET heure courante
      const now = new Date();
      dateInput.value = now.getFullYear() + "-"
        + String(now.getMonth()+1).padStart(2,"0") + "-"
        + String(now.getDate()).padStart(2,"0") + "T"
        + String(now.getHours()).padStart(2,"0") + ":"
        + String(now.getMinutes()).padStart(2,"0");
    }

    if (bacId) {
      const select = document.getElementById("releve-bac");
      if (select) select.value = bacId;
    }

    openModal("modal-releve");
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Recharge le select des bacs dans le formulaire relevé après ajout/modif */
  async function _refreshSelectBacs() {
    _bacs = await apiFetchBacs();
    _fillSelect("releve-bac", _bacs.map(b => ({ value: b.id, label: b.nom })));
    // Recharge aussi le select de l'export si présent
    const exportSites = document.getElementById("export-sites");
    if (exportSites && typeof ExportModule !== "undefined") {
      // Reconstruit les checkboxes sites de l'export
      exportSites.innerHTML = _bacs.map(bac => `
        <label class="checkbox-label">
          <input type="checkbox" name="export-site" value="${bac.id}" checked>
          <span>${bac.nom}</span>
        </label>`).join("");
    }
  }

  function _fillSelect(id, options) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<option value="">— Choisir —</option>` +
      options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
  }

  /**
   * Génère des checkboxes dans un conteneur.
   * @param {string}      containerId  - ID du conteneur <div>
   * @param {string[]}    items        - Libellés des options
   * @param {string|null} autreInputId - ID du champ texte "Autre" (optionnel)
   */
  function _fillCheckboxGroup(containerId, items, autreInputId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = items.map(item => `
      <label class="checkbox-label">
        <input type="checkbox" name="${containerId}" value="${item}">
        <span>${item}</span>
      </label>`).join("");

    if (autreInputId) {
      container.insertAdjacentHTML("beforeend", `
        <label class="checkbox-label">
          <input type="checkbox" name="${containerId}" value="Autre" data-autre="${autreInputId}">
          <span>Autre</span>
        </label>`);

      container.addEventListener("change", e => {
        if (e.target.dataset.autre) {
          const champ = document.getElementById(e.target.dataset.autre);
          if (champ) champ.style.display = e.target.checked ? "block" : "none";
        }
      });
    }
  }

  function _getChecked(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return [...container.querySelectorAll("input:checked")].map(cb => cb.value);
  }

  function _resetStars() {
    document.querySelectorAll("input[name='releve-etoiles']").forEach(r => r.checked = false);
  }

  function _resetRanges() {
    ["releve-apport", "releve-broyat"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = 50; el.dispatchEvent(new Event("input")); }
    });
  }



  return { init, openAddBacForm, openEditBacForm, openReleveForm };

})();
