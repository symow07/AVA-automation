# AVA — Workflow n8n : Guide d'installation

Pipeline complet d'automatisation comptable pour cabinets marocains.
**Flux :** Email Gmail → OCR PDF → Analyse GPT-4o → Écriture Odoo 16 → Google Sheets → Email de confirmation.

---

## 1. Prérequis

- Une instance n8n (n8n Cloud ou self-hosted, version **1.x** minimum)
- Un compte Google (Gmail + Google Sheets)
- Un compte OpenAI avec accès GPT-4o
- Une instance Odoo 16 (cloud ou auto-hébergée) avec un utilisateur API
- (Optionnel) Un projet Google Cloud avec **Vision API** activée — uniquement pour OCR de PDF scannés

---

## 2. Import du workflow

1. Ouvrez votre instance n8n
2. Menu **Workflows** → bouton **Import from File**
3. Sélectionnez `workflow.json`
4. Le workflow apparaît avec **22 nœuds** et 7 sticky notes
5. Cliquez sur chaque nœud marqué d'une icône rouge ⚠️ pour configurer les credentials (voir section 3)

---

## 3. Configuration des credentials

Tous les credentials sont **stockés dans n8n** — aucune valeur n'est codée en dur dans le workflow.

### 3.1 Gmail OAuth2 (`Gmail AVA`)

1. Sur Google Cloud Console : créez un projet, activez **Gmail API**
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type : *Web application*
   - Authorized redirect URI : `https://<votre-n8n>/rest/oauth2-credential/callback`
3. Copiez **Client ID** et **Client Secret**
4. Dans n8n : **Credentials → New → Gmail OAuth2**, collez les valeurs, puis cliquez **Sign in with Google**
5. Renommez le credential **`Gmail AVA`**

> ⚠️ Le compte Gmail connecté doit être l'adresse dédiée qui reçoit les factures clients (ex : `factures@votrecabinet.ma`).

### 3.2 OpenAI (`OpenAI AVA`)

1. Allez sur https://platform.openai.com/api-keys
2. **Create new secret key** → copiez la clé (commence par `sk-...`)
3. Dans n8n : **Credentials → New → OpenAI API**, collez la clé
4. Renommez **`OpenAI AVA`**

> Le modèle utilisé est **`gpt-4o`** (déjà pré-configuré). Coût indicatif : ~0,01 € par facture.

### 3.3 Odoo (`Odoo AVA`)

Le workflow s'authentifie via `/web/session/authenticate` et appelle `/web/dataset/call_kw`.

Créez un credential **HTTP Header Auth** custom nommé `Odoo AVA` avec les champs personnalisés suivants (n8n permet de stocker des champs additionnels — sinon, créez les credentials directement dans le nœud) :

| Champ | Valeur exemple |
|-------|---------------|
| `url` | `https://votre-cabinet.odoo.com` (sans `/` final) |
| `db` | `votre-cabinet` (nom de la base) |
| `username` | `api@votrecabinet.ma` |
| `password` | mot de passe ou **API key** Odoo |

**Comment trouver ces valeurs dans Odoo :**
- **URL** : l'URL d'accès à votre Odoo (ex : `https://moncabinet.odoo.com`)
- **DB name** : visible sur l'écran de login (champ "Database") ou via **Settings → Technical → Database Structure**
- **Username** : créez un utilisateur dédié *AVA Bot* dans **Settings → Users & Companies → Users**, donnez-lui les groupes **Accounting / Billing Administrator**
- **Password / API Key** : depuis cet utilisateur → **Account Security → New API Key**

> 🔧 **Plan comptable** : le workflow utilise les comptes marocains standards `3421` (clients), `7111` (ventes biens), `4455` (TVA collectée). Adaptez ces IDs dans le nœud **"Préparer écriture Odoo"** si votre plan diffère (Odoo utilise des IDs internes — récupérez-les via `account.account` `search_read` sur le code).

### 3.4 Google Sheets (`Google Sheets AVA`)

1. **Créez la feuille** :
   - Ouvrez Google Sheets → nouveau document nommé `AVA - Suivi factures`
   - Renommez l'onglet **`Factures`**
   - Ligne 1 (en-têtes exactes) :
     ```
     timestamp | invoice_number | vendor | client | total_ht | tva | total_ttc | status | odoo_entry_id
     ```
   - Récupérez l'**ID de la feuille** dans l'URL : `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

2. **OAuth Google Sheets** :
   - Sur Google Cloud Console (même projet que Gmail) : activez **Google Sheets API**
   - Réutilisez le même OAuth Client ID que pour Gmail (ou créez-en un nouveau)
   - Dans n8n : **Credentials → New → Google Sheets OAuth2 API**
   - Ajoutez le champ personnalisé `sheetId` = l'ID copié plus haut
   - Renommez **`Google Sheets AVA`**

### 3.5 Google Vision API (optionnel — fallback OCR)

Utilisé uniquement si le PDF est un scan image (pas un PDF numérique avec texte intégré).

1. Sur Google Cloud Console : activez **Cloud Vision API**
2. **APIs & Services → Credentials → Create Credentials → API Key**
3. Restreignez la clé à **Cloud Vision API** uniquement
4. Dans n8n : **Credentials → New → HTTP Header Auth**, ajoutez le champ personnalisé `apiKey`
5. Renommez **`Google Vision API Key`**

> Si vous ne configurez pas ce credential, le workflow fonctionne quand même pour tous les PDF numériques (la grande majorité des factures B2B générées par des logiciels comptables). Seuls les PDF *scannés en image* nécessiteront ce fallback.

---

## 4. Activation et test

1. Cliquez sur le bouton **Active** en haut à droite du workflow
2. Envoyez un email à l'adresse Gmail configurée avec une facture PDF en pièce jointe
3. Sous une minute, vous devriez voir :
   - Une nouvelle exécution dans **Executions**
   - Une nouvelle ligne dans le Google Sheet
   - Une écriture dans Odoo (`Accounting → Journal Entries`)
   - Un email de confirmation HTML aux couleurs AVA dans votre boîte d'envoi

---

## 5. Test avec une facture exemple

Voir `test_invoice.md` pour la description d'une facture de test que vous pouvez générer rapidement (Word/PDF) afin de valider le pipeline.

---

## 6. Gestion d'erreurs

Si **OCR**, **GPT** ou **Odoo** échouent :
- Le flux bascule automatiquement vers la branche `Préparer email d'erreur` → `Email de secours`
- L'expéditeur reçoit un email indiquant l'étape qui a échoué + le **texte OCR brut** pour traitement manuel
- L'exécution reste visible dans l'onglet **Executions** de n8n pour debug

Chaque nœud critique a `continueOnFail: true` pour garantir que le workflow atteint toujours la branche email (succès ou secours).

---

## 7. Personnalisation rapide

- **Changer le format d'email** : modifiez les nœuds `Email confirmation` et `Email de secours` (HTML inline)
- **Ajuster le plan comptable** : éditez le nœud `Préparer écriture Odoo` (lignes `account_id: 3421/7111/4455`)
- **Modifier le prompt GPT** : nœud `Analyse IA (GPT-4o)` → message système
- **Changer la fréquence de polling Gmail** : nœud `Réception email` → champ `pollTimes`

---

## 8. Sécurité

- Tous les secrets sont dans n8n Credentials (chiffrés au repos)
- L'utilisateur Odoo dédié *AVA Bot* devrait avoir uniquement les droits **Accounting** (pas d'admin)
- Restreignez la clé API Google Vision à l'IP de votre instance n8n
- Activez la 2FA sur le compte Gmail dédié
