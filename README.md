# SafeNow Lead User Panel

Landing Page + Registrierung für das SafeNow Lead User Panel. User können sich anmelden, ihr Profil verwalten und ihre Daten löschen. Alle Daten werden über die Mailjet API als Contact Properties gespeichert.

## Architektur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   index.html    │────▶│ mailjet-proxy.js  │────▶│  Mailjet    │
│   (Frontend)    │ API │  (Express Server) │     │  Contacts   │
└─────────────────┘     └──────────────────┘     └─────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Mailjet Dashboard │
                                                │  (Internes Admin) │
                                                └─────────────────┘
```

**Kein eigenes Admin-UI nötig** — ihr filtert und verwaltet alle Lead User direkt im Mailjet Dashboard unter "Contacts".

## Quick Start

### 1. Mailjet vorbereiten

1. In Mailjet einloggen → **Contacts** → **Contact Lists** → Neue Liste erstellen: "Lead User Panel"
2. Die **List ID** notieren (in der URL sichtbar nach dem Erstellen)

### 2. Server starten

```bash
cd lead-user-panel
npm install express cors node-fetch@2

# Umgebungsvariablen setzen und starten
MJ_APIKEY_PUBLIC=dein_public_key \
MJ_APIKEY_PRIVATE=dein_private_key \
MJ_LIST_ID=deine_list_id \
node mailjet-proxy.js
```

Der Server:
- Erstellt automatisch alle nötigen Contact Properties in Mailjet
- Stellt das Frontend unter `http://localhost:3000` bereit
- Stellt die API unter `http://localhost:3000/api/` bereit

### 3. Deployment (optional)

Für Produktion empfehle ich **Railway**, **Render** oder **Vercel** (mit Serverless Functions):

```bash
# .env Datei erstellen
MJ_APIKEY_PUBLIC=xxx
MJ_APIKEY_PRIVATE=yyy
MJ_LIST_ID=123456
```

## API Endpoints

| Method   | Endpoint         | Beschreibung                     |
|----------|------------------|----------------------------------|
| `POST`   | `/api/register`  | Neuen Lead User registrieren     |
| `GET`    | `/api/profile`   | Profil laden (`?email=...`)      |
| `PUT`    | `/api/profile`   | Profil aktualisieren             |
| `DELETE` | `/api/profile`   | Profil löschen (`?email=...`)    |

## Internes Filtern (Mailjet Dashboard)

Nachdem User sich registriert haben, könnt ihr im Mailjet Dashboard:

1. **Contacts → Contact Lists → "Lead User Panel"** öffnen
2. **Segmente erstellen** basierend auf den Contact Properties:
   - `methods` enthält "moderiert" → alle, die für Interviews offen sind
   - `location` beginnt mit "80" → alle aus München
   - `uses_safenow` = "ja" → aktive Nutzer:innen
   - `age_group` = "25-34" → bestimmte Altersgruppe
   - `device` enthält "ios" → iOS-Nutzer:innen
   - `safety_feeling` = "eher_unsicher" → bestimmtes Sicherheitsgefühl
3. **Segmente speichern** und für gezielte E-Mail-Kampagnen nutzen

### Beispiel: Einladung für moderierte Interviews in München

Segment-Filter in Mailjet:
- `methods` enthält `moderiert` ODER `inhouse_muenchen`
- `location` enthält `München` ODER beginnt mit `80`
- `time_commitment` = `1h` ODER `2h+`

→ Dann E-Mail-Kampagne an dieses Segment senden.

## Contact Properties (Datenfelder)

Diese werden automatisch beim ersten Start in Mailjet angelegt:

| Property            | Beschreibung                                   |
|---------------------|-----------------------------------------------|
| `firstname`         | Vorname                                        |
| `lastname`          | Nachname                                       |
| `age_group`         | Altersgruppe (18-24, 25-34, ...)              |
| `gender`            | Geschlecht                                     |
| `location`          | PLZ / Wohnort                                  |
| `profession`        | Beruf                                          |
| `referral_source`   | Wie auf Panel aufmerksam geworden              |
| `uses_safenow`      | Nutzt SafeNow (ja/nein/frueher)               |
| `safenow_since`     | Seit wann                                      |
| `safenow_frequency` | Wie häufig                                     |
| `device`            | Gerät (ios, android, oder beides)              |
| `features_used`     | Genutzte SafeNow Features (Freitext)          |
| `life_situation`    | Lebenssituation (komma-getrennt)              |
| `safety_feeling`    | Subjektives Sicherheitsgefühl                  |
| `safety_situations` | Konkrete unsichere Situationen (Freitext)      |
| `methods`           | Research-Methoden (komma-getrennt)             |
| `time_commitment`   | Zeitbudget pro Monat                           |
| `language`          | Bevorzugte Sprache(n)                          |
| `notes`             | Freitext-Anmerkungen                           |

## DSGVO

- User können ihr Profil jederzeit einsehen, bearbeiten und löschen
- Beim Löschen werden alle Properties geleert und der Kontakt als "DELETED" markiert und von Kampagnen ausgeschlossen
- Consent wird explizit im Formular eingeholt
- Datenschutz-Link ist im Footer und im Formular verlinkt (muss noch auf eure Datenschutzseite zeigen)
