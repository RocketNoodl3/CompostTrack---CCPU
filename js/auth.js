/**
 * auth.js — Authentification Google Identity Services (GSI)
 * ===========================================================
 * Le token Google ID est sauvegardé dans sessionStorage pour survivre
 * aux navigations entre pages (index.html ↔ stats.html).
 * Il est effacé automatiquement à la fermeture de l'onglet.
 */

const Auth = (() => {

  const SESSION_KEY = "composttrack_token";     // Clé sessionStorage
  const SESSION_USER = "composttrack_user";     // Clé sessionStorage infos user

  let _token    = null;
  let _userInfo = null;

  const _onLoginCallbacks = [];

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  function init() {
    // ── Tentative de restauration depuis sessionStorage ──────────────────────
    // Si l'utilisateur navigue entre pages, le token est déjà là
    const savedToken = sessionStorage.getItem(SESSION_KEY);
    const savedUser  = sessionStorage.getItem(SESSION_USER);

    if (savedToken && savedUser) {
      try {
        // Vérifie que le token n'est pas expiré avant de le réutiliser
        const payload = JSON.parse(atob(savedToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
        const expired = payload.exp && Date.now() / 1000 > parseInt(payload.exp);

        if (!expired) {
          // Token encore valide — restauration silencieuse, pas de popup Google
          _token    = savedToken;
          _userInfo = JSON.parse(savedUser);
          _updateUI(true);
          // Déclenche les callbacks après que le DOM soit prêt
          setTimeout(() => _onLoginCallbacks.forEach(cb => cb(_userInfo)), 0);
          // Initialise GSI en arrière-plan pour le renouvellement automatique
          _initGSI();
          return;
        }
      } catch {
        // Token corrompu — on le supprime et on redemande une connexion
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_USER);
      }
    }

    // ── Pas de token valide en session — initialisation GSI normale ──────────
    _initGSI();
    google.accounts.id.prompt();   // Affiche le One Tap si session Google active
  }

  /** Initialise Google Identity Services */
  function _initGSI() {
    google.accounts.id.initialize({
      client_id:   APP_CONFIG.GOOGLE_CLIENT_ID,
      callback:    _handleCredentialResponse,
      auto_select: true,
    });

    // Bouton dans le header
    const btnHeader = document.getElementById("google-signin-btn");
    if (btnHeader) {
      google.accounts.id.renderButton(btnHeader, {
        theme: "outline", size: "large", text: "signin_with", locale: "fr",
      });
    }

    // Bouton centré sur l'écran d'accueil
    const btnCenter = document.getElementById("google-signin-btn-center");
    if (btnCenter) {
      google.accounts.id.renderButton(btnCenter, {
        theme: "filled_green", size: "large", text: "signin_with", locale: "fr",
      });
    }
  }

  /**
   * Appelé par Google après connexion réussie.
   * Sauvegarde le token dans sessionStorage pour les navigations suivantes.
   */
  function _handleCredentialResponse(response) {
    _token = response.credential;

    try {
      const payload = JSON.parse(atob(_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      _userInfo = {
        name:    payload.name    || payload.email,
        email:   payload.email   || "",
        picture: payload.picture || "",
      };
    } catch {
      _userInfo = { name: "Agent", email: "", picture: "" };
    }

    // ── Sauvegarde dans sessionStorage ───────────────────────────────────────
    // Persiste entre les pages, effacé à la fermeture de l'onglet
    sessionStorage.setItem(SESSION_KEY,  _token);
    sessionStorage.setItem(SESSION_USER, JSON.stringify(_userInfo));

    _updateUI(true);
    _onLoginCallbacks.forEach(cb => cb(_userInfo));
  }

  // ===========================================================================
  // API publique
  // ===========================================================================

  function getToken() {
    if (!_token) throw new Error("Non connecté — veuillez vous identifier.");
    return _token;
  }

  function isLoggedIn()  { return !!_token;    }
  function getUserInfo() { return _userInfo;   }

  function onLogin(callback) {
    _onLoginCallbacks.push(callback);
    if (_userInfo) callback(_userInfo);
  }

  /** Déconnexion — vide la session et recharge la page */
  function logout() {
    google.accounts.id.disableAutoSelect();
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER);
    _token    = null;
    _userInfo = null;
    _updateUI(false);
    window.location.reload();
  }

  // ===========================================================================
  // UI
  // ===========================================================================

  function _updateUI(loggedIn) {
    const loginSection = document.getElementById("auth-login");
    const userSection  = document.getElementById("auth-user");
    const appContent   = document.getElementById("app-content");
    const mainNav      = document.getElementById("main-nav");
    const authScreen   = document.getElementById("auth-screen");

    if (loginSection) loginSection.style.display = loggedIn ? "none"  : "flex";
    if (userSection)  userSection.style.display  = loggedIn ? "flex"  : "none";
    if (appContent)   appContent.style.display   = loggedIn ? "block" : "none";
    if (mainNav)      mainNav.style.display      = loggedIn ? "flex"  : "none";
    if (authScreen)   authScreen.style.display   = loggedIn ? "none"  : "flex";

    if (loggedIn && _userInfo) {
      const nameEl   = document.getElementById("user-name");
      const avatarEl = document.getElementById("user-avatar");
      if (nameEl)   nameEl.textContent = _userInfo.name;
      if (avatarEl && _userInfo.picture) {
        avatarEl.src           = _userInfo.picture;
        avatarEl.style.display = "block";
      }
    }
  }

  return { init, getToken, isLoggedIn, getUserInfo, onLogin, logout };

})();
