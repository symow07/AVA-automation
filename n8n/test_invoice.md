# Facture de test — AVA

Reproduire la facture ci-dessous dans Word ou Google Docs, puis **Fichier → Exporter en PDF**.
Envoyez le PDF en pièce jointe à l'adresse Gmail configurée pour déclencher le workflow.

---

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   SOCIÉTÉ ATLAS BUREAUTIQUE SARL                                │
│   123 Boulevard Mohammed V, Casablanca 20000                    │
│   ICE : 001234567000089                                         │
│   IF : 14567890   —   RC : 234567   —   Patente : 31234567      │
│                                                                 │
│                                                                 │
│                              FACTURE N° FA-2026-0142            │
│                              Date : 15/05/2026                  │
│                              Échéance : 14/06/2026              │
│                                                                 │
│   Client :                                                      │
│   CABINET COMPTABLE EL FASSI                                    │
│   45 Avenue Hassan II, Rabat 10000                              │
│   ICE : 002345678000091                                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│   Description              Qté   Prix unit.    Total HT         │
│  ─────────────────────────────────────────────────────────────  │
│   Ordinateur portable       2     6 500,00     13 000,00 MAD    │
│   Dell Latitude 5540                                            │
│                                                                 │
│   Imprimante laser HP       1     2 800,00      2 800,00 MAD    │
│   LaserJet Pro M404dn                                           │
│                                                                 │
│   Pack Office 365           3       450,00      1 350,00 MAD    │
│   Business (12 mois)                                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│                              Total HT      :  17 150,00 MAD     │
│                              TVA 20 %      :   3 430,00 MAD     │
│                              ════════════════════════════════   │
│                              TOTAL TTC     :  20 580,00 MAD     │
│                                                                 │
│                                                                 │
│   Mode de paiement : Virement bancaire                          │
│   IBAN : MA64 0123 4567 8901 2345 6789 0123                     │
│                                                                 │
│   Merci de votre confiance.                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Résultat attendu après traitement

**Email de confirmation reçu** avec :
- N° de facture : `FA-2026-0142`
- Fournisseur : `SOCIÉTÉ ATLAS BUREAUTIQUE SARL`
- Total HT : `17 150,00 MAD`
- TVA (20%) : `3 430,00 MAD`
- **Total TTC : `20 580,00 MAD`**
- Référence Odoo : `#<id généré>`

**Google Sheet** : une nouvelle ligne avec status = `OK`.

**Odoo** : écriture comptable visible dans **Accounting → Journal Entries**, avec 3 lignes :
- Débit `3421` Clients : 20 580,00
- Crédit `7111` Ventes : 17 150,00
- Crédit `4455` TVA collectée : 3 430,00

---

## Variantes de test recommandées

1. **Facture scannée** : imprimez la facture, puis scannez-la en PDF → teste le fallback Google Vision OCR
2. **Facture en arabe** : remplacez les libellés par leur équivalent arabe → teste la robustesse du prompt GPT (`languageHints: ['fr', 'ar']`)
3. **Format numérique alternatif** : utilisez `17150.00` au lieu de `17 150,00` → teste la normalisation du Code node
4. **Données manquantes** : retirez l'ICE client → teste la tolérance du validateur (`client_ice` doit devenir `""`)
5. **Email sans PJ** : envoyez un email sans pièce jointe PDF → le filtre `has:attachment filename:pdf` doit l'ignorer
