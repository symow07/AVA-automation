# Compta AI — Master Context Document
> Full product definition for an AI automation layer on top of Odoo, sold to Moroccan accounting firms (cabinets comptables). Use this document to continue building in any session.

---

## 1. Product Vision

**What it is:** A B2B SaaS AI automation system that plugs into Odoo (the ERP already used by most Moroccan accounting firms) and automates the full Moroccan accounting cycle — from document ingestion to DGI-compliant tax filing.

**Who it's for:** Moroccan cabinets comptables managing multiple client companies (sociétés) inside one Odoo instance.

**Core principle (adapted from French model):**
- **Odoo = single source of truth** for all operational and accounting data
- **AI layer sits on top of Odoo** — reads from and writes to Odoo via API
- **No bidirectional sync complexity** — AI enriches Odoo upstream; exports (FEC-equivalent for DGI) are one-way, periodic, deterministic
- **No double entry** — AI automates what accountants currently do manually

**What makes it different from generic Odoo:**
- AI-powered document ingestion (invoices, bank statements, expense reports)
- Intelligent PCM account suggestion and journal entry generation
- Automated bank reconciliation with fuzzy matching
- DGI-compliant tax filing automation (TVA, IS, IR, liasses)
- Multi-client dashboard per cabinet
- Anomaly detection before any export

---

## 2. Architecture — Technical Stack

### Source of Truth: Odoo
- Module: `account_accountant` (Comptabilité)
- Plan comptable: **PCM — Plan Comptable Marocain**
- Journals configured: Achats, Ventes, Banque, OD, Caisse
- Taxes: TVA marocaine (7%, 10%, 14%, 20%)
- All entries (invoices, bank lines, expense notes) live in `account.move` + `account.move.line`

### AI Layer: n8n Automation
- Connects to Odoo via **XML-RPC or JSON-RPC API**
- Claude AI (claude-sonnet-4-6) for extraction, classification, anomaly detection
- Google Sheets as lightweight output/dashboard layer (per pack — see section 5)
- Slack/email for alerts and human review queue

### Export Layer (DGI compliance)
- Odoo → **FEC format** (norme légale marocaine, same structure as French FEC)
- One-way, periodic (weekly or monthly)
- Custom boolean field on `account.move`: `exported_to_dgi = False`
- After successful export: flag set to `True`
- Import into DGI portal or cabinet's filing tool: semi-manual (accountant clicks once)

---

## 3. Odoo API Integration

### Connection (XML-RPC — Python)
```python
import xmlrpc.client

url  = 'https://[client-odoo-instance].com'
db   = 'client_db'
uid  = 1
pwd  = '[api_key]'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
api    = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Authenticate
uid = common.authenticate(db, 'user@email.com', pwd, {})
```

### Fetch unprocessed posted entries
```python
move_ids = api.execute_kw(
    db, uid, pwd,
    'account.move', 'search',
    [[('exported_to_dgi', '=', False), ('state', '=', 'posted')]]
)
moves = api.execute_kw(
    db, uid, pwd,
    'account.move', 'read',
    [move_ids],
    {'fields': ['name', 'date', 'journal_id', 'line_ids', 'ref', 'invoice_date', 'partner_id']}
)
```

### Create a journal entry via API (AI output → Odoo)
```python
new_move = {
    'journal_id': journal_id,
    'date': '2025-05-19',
    'ref': 'Facture F-2025-001',
    'line_ids': [
        (0, 0, {'account_id': 61110, 'debit': 1000.0, 'credit': 0.0, 'name': 'Achat marchandises'}),
        (0, 0, {'account_id': 34550, 'debit': 200.0,  'credit': 0.0, 'name': 'TVA déductible 20%'}),
        (0, 0, {'account_id': 44110, 'debit': 0.0,    'credit': 1200.0, 'name': 'Fournisseur X'}),
    ]
}
api.execute_kw(db, uid, pwd, 'account.move', 'create', [new_move])
```

### FEC export line structure (DGI-compatible)
```
JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise
```

Mapping from Odoo:
| FEC field | Odoo field |
|-----------|-----------|
| JournalCode | `journal_id.code` |
| EcritureDate | `date` |
| CompteNum | `line.account_id.code` |
| CompteLib | `line.account_id.name` |
| CompAuxNum | `line.partner_id.ref` |
| CompAuxLib | `line.partner_id.name` |
| PieceRef | `move.name` |
| Debit | `line.debit` |
| Credit | `line.credit` |
| EcritureLib | `line.name` or `move.ref` |

---

## 4. The 6 AI Automation Modules

### M1 — Saisie automatique des documents
**What it does:** Reads PDFs and images (invoices, bank statements, expense notes) and creates entries in Odoo automatically.

**n8n workflow:**
1. Trigger: Webhook (file upload) or Gmail node (email attachment)
2. File type detection (IF node): invoice / bank statement / expense
3. OCR: HTTP Request → Mistral OCR API (best for Arabic/French mixed docs)
4. Claude AI node: extract structured fields
5. Validation: IF confidence ≥ 0.85 → write to Odoo API
6. False path → Slack/email alert with extracted data for human correction

**AI prompt (M1 — invoice):**
```
You are an accounting AI for Moroccan firms using the Plan Comptable Marocain.
Extract from this invoice document. Return ONLY valid JSON:
{
  "vendor": string,
  "amount_ht": number,
  "vat_rate": number (0.07 | 0.10 | 0.14 | 0.20),
  "amount_ttc": number,
  "date": string (ISO 8601),
  "invoice_number": string,
  "currency": string (default "MAD"),
  "category": string (achats_marchandises | frais_transport | services | salaires | autres),
  "confidence": number (0.0–1.0)
}
Null for any field that cannot be determined.
```

---

### M2 — Réconciliation bancaire intelligente
**What it does:** Matches imported bank transactions to existing Odoo entries. Flags unmatched lines.

**n8n workflow:**
1. Trigger: new bank statement file uploaded or scheduled poll
2. Parse CSV (CSV Parse node) or extract from PDF (OCR)
3. Fetch open invoices from Odoo (`account.move` where `payment_state != 'paid'`)
4. Claude AI node: fuzzy match by amount (±1 MAD) + date window (±14 days) + partner name similarity
5. Matched → mark as reconciled via Odoo API (`account.move` lettrage)
6. Unmatched → write to Review Queue (Google Sheets or Slack)

**AI prompt (M2):**
```
Match this bank transaction to the best invoice from the list.
Valid match: amount difference < 1 MAD AND date difference < 14 days AND vendor similarity > 0.7.
Return: { matched_invoice_id, confidence, variance_amount, match_reason }
No match: { matched_invoice_id: null, confidence: 0, flag: "unmatched" }
```

---

### M3 — Écritures comptables automatiques
**What it does:** Generates PCM-compliant journal entries from validated document data and writes them to Odoo.

**PCM Rules Engine (Code node — JavaScript):**
```javascript
const PCM = {
  "achats_marchandises": { debit: "6111", credit: "4411", tva: "3455" },
  "ventes_produits":     { debit: "3421", credit: "7111", tva: "4455" },
  "frais_transport":     { debit: "6142", credit: "4411", tva: "3455" },
  "salaires":            { debit: "6171", credit: "4441", tva: null   },
  "services":            { debit: "6131", credit: "4411", tva: "3455" },
  "frais_deplacement":   { debit: "6185", credit: "5141", tva: "3455" },
};
const item = $input.item.json;
const rule = PCM[item.category] || { debit: "6199", credit: "4411", tva: "3455" };
const vat_amount = item.amount_ht * item.vat_rate;
return [{
  json: {
    lines: [
      { compte: rule.debit, debit: item.amount_ht, credit: 0,    libelle: item.vendor },
      { compte: rule.tva,   debit: vat_amount,     credit: 0,    libelle: "TVA déductible" },
      { compte: rule.credit,debit: 0,              credit: item.amount_ttc, libelle: item.vendor },
    ]
  }
}];
```

**AI prompt (M3 — complex entries):**
```
You are a Moroccan accountant using PCM. Generate a balanced journal entry.
Return JSON array: [{ compte: "XXXX", libelle: string, debit: number|null, credit: number|null }]
Rule: sum(debit) must equal sum(credit). Use PCM account codes.
```

---

### M4 — Liasses fiscales & déclarations DGI
**What it does:** Aggregates journal data from Odoo and generates DGI-compliant tax declarations (TVA, IS, IR, liasses de synthèse).

**n8n workflow:**
1. Trigger: Cron (monthly for TVA, quarterly/annually for IS/IR)
2. Fetch all `account.move.line` for the period from Odoo
3. Code node: aggregate by compte (CA, charges, TVA collectée, TVA déductible)
4. Claude AI: format into DGI declaration structure
5. Generate FEC file + summary sheet
6. Write to Google Sheets tab `Liasses` + email PDF to accountant

---

### M5 — Analyse financière & tableau de bord
**What it does:** Computes KPIs from Odoo data and populates a live dashboard.

**KPIs computed:**
- Chiffre d'affaires HT (period)
- Charges totales (period)
- Marge brute %
- Position de trésorerie (bank balance from Odoo)
- Créances clients en retard (overdue invoices)
- Dettes fournisseurs à venir
- TVA nette à payer

**n8n workflow:**
1. Trigger: Daily cron or on-demand webhook
2. Fetch from Odoo: sales invoices, purchase invoices, bank entries
3. Code node: compute all KPIs
4. Write to Google Sheets tab `Dashboard`
5. Alert rule: IF margin < threshold OR overdue > X → Slack alert

---

### M6 — Multi-clients & orchestration
**What it does:** Routes all workflows by client ID. Each cabinet manages multiple sociétés; each gets isolated data.

**Implementation:**
- All workflows receive `client_id` + `odoo_instance_url` at trigger time
- n8n credentials stored per client (Odoo API key per instance)
- Google Sheets: one workbook per client, tabs per module
- Slack channel per client for alerts
- Admin dashboard: status of all clients' last sync

---

## 5. Product Packs & Pricing

| | Pack 1 — Essentiel | Pack 2 — Performance | Pack 3 — Premium |
|---|---|---|---|
| **Setup fee** | from 10,000 DH | from 15,000 DH | Sur devis |
| **Quarterly subscription** | 2,000 DH | 3,500 DH | 5,000 DH |
| **M1 — Document ingestion** | ✅ | ✅ | ✅ |
| **M2 — Bank reconciliation** | Basic | Advanced + fuzzy AI | Full AI + auto-lettrage |
| **M3 — Journal entries** | ✅ PCM rules | ✅ + AI fallback | ✅ + custom rules |
| **M4 — Liasses DGI** | Standard TVA | TVA + IS + IR | All declarations |
| **M5 — Dashboard** | Standard reports | Advanced + analytics | Full KPI suite |
| **M6 — Multi-clients** | Up to 5 clients | Up to 20 clients | Unlimited |
| **Anomaly detection** | ❌ | ✅ | ✅ |
| **Priority support** | ❌ | ❌ | ✅ |
| **Custom integrations** | ❌ | ❌ | ✅ |

---

## 6. Google Sheets Output Structure

One workbook per client. Tabs:

| Tab | Populated by | Key columns |
|-----|-------------|-------------|
| `Invoices` | M1 | date, vendor, amount_ht, vat, amount_ttc, category, odoo_ref, status |
| `Bank_Recon` | M2 | txn_date, description, amount, matched_invoice, variance, flag |
| `Journal` | M3 | date, ref, libelle, compte_debit, compte_credit, debit, credit |
| `Liasses` | M4 | period, declaration_type, field, value, dgi_ref |
| `Dashboard` | M5 | metric, value, period, alert |
| `Review_Queue` | Validation gate | doc_type, client_id, reason, extracted_data, timestamp |

---

## 7. n8n Architecture — Flow Summary

```
[Email / Upload / Cron / API]
        ↓
[Input Classifier — Claude AI]
  → doc_type + client_id + confidence
        ↓
[Switch node → routes to M1 / M2 / M3 / M4 / M5]
        ↓
[AI Processing layer]
  ├─ Claude AI node (extraction / classification / generation)
  └─ PCM Rules Engine (Code node — JS)
        ↓
[Validation gate — IF confidence ≥ 0.85]
  ├─ True → Odoo API write + Google Sheets write
  └─ False → Review Queue (Slack + Sheets)
        ↓
[Export layer — periodic]
  → FEC file generation → DGI / cabinet filing tool
```

---

## 8. Odoo Custom Field (required)

Add to `account.move` model in Odoo (custom module or via Studio):
```python
# In a custom Odoo module: models/account_move.py
from odoo import models, fields

class AccountMove(models.Model):
    _inherit = 'account.move'
    
    exported_to_dgi = fields.Boolean(string='Exported to DGI', default=False)
    ai_processed    = fields.Boolean(string='AI Processed', default=False)
    ai_confidence   = fields.Float(string='AI Confidence Score', default=0.0)
    ai_category     = fields.Char(string='AI Category')
```

---

## 9. Recommended Build Order

1. **Odoo connection** — test XML-RPC auth, read a few `account.move` records
2. **M1** — invoice ingestion is the foundation of everything
3. **M3** — journal entry generation (depends on M1 output)
4. **Validation gate** — add before any Odoo writes
5. **M2** — bank reconciliation (needs M1 and M3 running)
6. **M4** — tax declarations (aggregates from M3)
7. **M5** — dashboard (aggregates from all)
8. **M6** — wrap with multi-client routing
9. **FEC export** — add last, after all modules stable

---

## 10. Open Decisions

- [ ] OCR provider: **Mistral OCR** (best for Arabic/French mixed Moroccan docs) vs Tesseract (free)
- [ ] Odoo deployment: client's own Odoo instance vs shared hosted Odoo managed by us
- [ ] FEC export: fully automated (cron → file drop) vs semi-manual (accountant triggers)
- [ ] Frontend dashboard: Google Sheets only vs custom web app (future Pack 3 feature)
- [ ] Authentication: API keys per Odoo instance stored in n8n credentials manager
- [ ] Billing integration: automated subscription renewal tracking

---

## 11. How to Continue in Any Session

Paste this document and say:

> "I'm building Compta AI — an AI automation layer on top of Odoo for Moroccan accounting firms. Full architecture is above. Let's build [specific module / feature]. My stack is n8n + Claude API + Google Sheets + Odoo XML-RPC."

---

## 12. Website — Brief for Cowork

### Product
**AVA** — AI-powered accounting automation for Moroccan cabinets comptables running Odoo.

### Languages
Trilingual: **French (primary)**, **Arabic**, **English**
- Language switcher in navbar: FR | AR | EN
- Arabic section uses RTL layout (`dir="rtl"`)
- Font stack: DM Sans (Latin) + Noto Naskh Arabic (Arabic script)

### Visual Identity
- **Vibe:** Corporate trust — navy, white, professional. Think McKinsey meets fintech SaaS.
- **Primary color:** Deep navy `#0B1F3A`
- **Accent:** Warm gold `#C9A84C` (sparingly — CTAs, underlines, highlights)
- **Background:** White `#FFFFFF` + light grey sections `#F7F8FA`
- **Typography:** Libre Baskerville (display/headings) + DM Sans (body/UI)
- **No gradients, no purple, no generic SaaS purple-on-white**

### Page Sections (in order)

1. **Navbar**
   - Logo: "AVA" in Libre Baskerville
   - Links: Produit · Services · Tarifs · Contact
   - Language switcher: FR | AR | EN
   - CTA button: "Demander une démo" (navy fill, gold hover)

2. **Hero**
   - Headline (FR): "L'intelligence comptable pour les cabinets marocains"
   - Subline: "AVA automatise votre cycle comptable complet — de la saisie à la liasse DGI — directement dans Odoo."
   - CTA: "Demander une démo" + "Voir comment ça marche"
   - Visual: abstract grid/mesh suggesting data flow — no stock photos

3. **Trusted by / Social proof bar**
   - "Conçu pour les cabinets qui gèrent plusieurs sociétés sous Odoo"
   - 3 trust stats: "98% de précision OCR" · "+40h économisées/mois" · "Conforme DGI"

4. **Services (6 modules)**
   - Cards grid (2×3)
   - M1: Saisie automatique des factures
   - M2: Réconciliation bancaire intelligente
   - M3: Écritures comptables auto (PCM)
   - M4: Liasses fiscales DGI
   - M5: Analyse financière & tableaux de bord
   - M6: Multi-sociétés & collaboration

5. **How it works (3 steps)**
   - Step 1: Connectez votre Odoo
   - Step 2: AVA traite vos documents par IA
   - Step 3: Vos écritures sont prêtes, vos liasses générées

6. **Pricing (3 packs)**
   - Pack 1 — Essentiel: setup from 10,000 DH · 2,000 DH/trimestre
   - Pack 2 — Performance: setup from 15,000 DH · 3,500 DH/trimestre
   - Pack 3 — Premium: sur devis · 5,000 DH/trimestre
   - Highlight Pack 2 as recommended

7. **Testimonials**
   - 2–3 placeholder quotes from fictional Moroccan cabinet directors
   - Arabic name + city (Casablanca, Rabat, Marrakech)

8. **CTA Banner**
   - "Prêt à automatiser votre cabinet ?"
   - Button: "Demander une démo gratuite"

9. **Footer**
   - Logo + tagline
   - Links: Produit · Tarifs · Contact · Mentions légales
   - "© 2025 AVA. Tous droits réservés."

### Technical Requirements
- Single-file HTML (HTML + CSS + JS in one file)
- No frameworks, no build tools — pure HTML/CSS/JS
- Smooth scroll navigation
- Mobile responsive
- Subtle scroll-reveal animations (CSS only, no heavy libraries)
- Language switcher toggles `display` of FR/AR/EN text blocks
- RTL toggle on `<html>` tag when Arabic is active

### Tone of copy
- Professional, confident, not salesy
- French: formal "vous"
- Positions AVA as a trusted partner, not just a tool
- Moroccan context: reference Odoo, PCM, DGI explicitly — shows domain knowledge

---

## 13. UI/UX Design System — AVA Website (from UI Pro Max Skill)

### Color Palette (Invoice & Billing Tool — navy professional)
```css
:root {
  --primary:          #1E3A5F;   /* deep navy */
  --primary-fg:       #FFFFFF;
  --secondary:        #2563EB;   /* blue accent */
  --secondary-fg:     #FFFFFF;
  --accent:           #C9A84C;   /* warm gold — CTAs, highlights */
  --accent-fg:        #FFFFFF;
  --background:       #F8FAFC;
  --foreground:       #0F172A;
  --card:             #FFFFFF;
  --card-fg:          #0F172A;
  --muted:            #F1F3F5;
  --muted-fg:         #64748B;
  --border:           #E4E7EB;
  --destructive:      #DC2626;
  --ring:             #1E3A5F;
}
```

### Typography (Corporate Trust pairing)
```css
/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600&display=swap');

--font-heading: 'Lexend', sans-serif;       /* all headings */
--font-body:    'Source Sans 3', sans-serif; /* all body text */
--font-arabic:  'Noto Naskh Arabic', serif; /* Arabic text blocks */
```

### Hero Section Design System
```css
--hero-min-height: 100vh;
--headline-size:   clamp(2rem, 5vw, 4rem);
--cta-padding:     1rem 2rem;
--overlay-opacity: 0.5;
```

### Style Approach
- **Hero-Centric Design** with full-width hero, compelling headline, high-contrast CTA
- Scroll-reveal fade-in animations on sections (CSS only)
- Subtle background parallax on hero
- CTA button: gold fill `#C9A84C`, hover: darken 10%
- Cards: white `#FFFFFF`, border `#E4E7EB`, subtle shadow
- Section alternation: white → `#F8FAFC` → white
- Max content width: `1200px`, centered

### Implementation Checklist (from skill)
- ☐ Hero section full viewport height
- ☐ Headline visible above fold
- ☐ CTA button high contrast (gold on navy)
- ☐ Mobile responsive (single column below 768px)
- ☐ Text readable on all backgrounds
- ☐ RTL layout active when Arabic selected
- ☐ Language switcher toggles FR/AR/EN text blocks
- ☐ Smooth scroll between sections
- ☐ Page weight < 500KB
