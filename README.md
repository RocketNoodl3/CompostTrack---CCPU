# 🌿 CarnetVert — Guide de déploiement

Gestion des bacs de compostage.

**Fonctionnalités** :

- Affichage cartographique avec alertes d'entretien
- Saisie et consultation des relevés
- Ajout et modification de bacs
- Statistiques
- Export Excel

**Sécurité** : connexion Google + whitelist emails.
Seuls les comptes Gmail explicitement autorisés peuvent accéder aux données.

---

## Architecture

```
Agent (navigateur)
  → Se connecte avec Google (token JWT signé par Google)
  → Envoie le token à l'Apps Script
  → Apps Script valide le token via l'API Google
  → Vérifie l'email dans EMAILS_AUTORISES
  → Accède au Google Sheet
```

---

## Étape 1 — Google Sheet

Créez un Google Sheet. Partagez-le en **"Éditeur avec le lien"** (ou restreint à votre compte).

Créez ces 7 onglets :

### `bacs`
| id | nom | lat | lng | createdAt |

### `relevés`
| id | date | bacId | agent | typeReleve | temperature | hauteurApport | hauteurBroyat | hygrometrie | qualiteApports | problemes | operations | operationsAutre | actionsPlanif | actionsAutre | qualiteCompostage | createdAt |

### `config_seuils`
| seuilApport | seuilBroyat |
|-------------|-------------|
| 30          | 70          |

### `config_agents`
| nom |

### `config_operations`
| operation |

### `config_problemes`
| probleme |

### `config_types_releve`
| type |

---

## Étape 2 — Apps Script

1. Google Sheet > **Extensions > Apps Script**
2. Collez le contenu de `apps-script/Code.gs`
3. **Remplissez `EMAILS_AUTORISES`** avec les emails de vos agents :
   ```javascript
   const EMAILS_AUTORISES = [
     "agent1@gmail.com",
     "responsable@mairie.fr",
   ];
   ```
4. **Déployer > Nouveau déploiement** :
   - Type : **Application Web**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde connecté à Google**
5. Copiez l'**URL de déploiement**

> ⚠️ Après toute modification de Code.gs :
> Déployer > Gérer les déploiements > modifier > **Nouvelle version**

---

## Étape 3 — Client ID Google (5 minutes, gratuit)

Nécessaire pour afficher le bouton "Se connecter avec Google" sur le site.

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
2. Créez un projet (ou utilisez un existant)
3. Menu **APIs & Services > Écran de consentement OAuth**
   - Type : **Externe** > Créer
   - Nom : "CompostTrack" — remplissez email et enregistrez
4. Menu **APIs & Services > Identifiants > Créer des identifiants > ID client OAuth 2.0**
   - Type : **Application Web**
   - Origines JavaScript autorisées :
     - `http://localhost:8080` (tests locaux)
     - `https://votre-pseudo.github.io` (production GitHub Pages)
   - Cliquez **Créer** et copiez l'**ID client** (format : `XXXX.apps.googleusercontent.com`)

---

## Étape 4 — Configurer `js/config.js`

```javascript
APPS_SCRIPT_URL: "https://script.google.com/macros/s/VOTRE_ID/exec",
GOOGLE_CLIENT_ID: "XXXX.apps.googleusercontent.com",
MAP_CENTER: [45.75, 4.85],   // Centre de votre territoire
```

---

## Étape 5 — Héberger le site

### GitHub Pages
1. Créez un dépôt GitHub public
2. Déposez tous les fichiers du dossier `compostage/`
3. Settings > Pages > Source : **main / root**
4. Ajoutez l'URL GitHub Pages dans les origines autorisées du Client ID OAuth

### Test local
```bash
cd compostage/
python3 -m http.server 8080
# → http://localhost:8080
```

---

## Gestion des accès

**Ajouter un agent** : ajoutez son email dans `EMAILS_AUTORISES` dans Code.gs, puis redéployez (Nouvelle version).

**Révoquer un accès** : retirez son email, redéployez. Effet immédiat.

```javascript
const EMAILS_AUTORISES = [
  "martin.dupont@gmail.com",
  "sophie.bernard@gmail.com",  // Comptes Gmail ou professionnels Google
];
```

---

## Niveau de sécurité

| Menace | Protection |
|---|---|
| Quelqu'un trouve l'URL Apps Script | ✅ Token Google requis |
| Compte Google non autorisé | ✅ Vérifié dans la liste blanche |
| Token falsifié | ✅ Validé par l'API Google  |
| Utilisateur révoqué | ✅ Retirez son email, redéployez |
| Inspection du code JS | ✅ Aucune clé secrète visible |

---

## Stack technique
| Google Sheets
| Google Apps Script
| Google Identity Services
| GitHub Pages
| Leaflet / OpenStreetMap
| Chart.js + SheetJS
