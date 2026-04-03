# Backend-Architektur fuer Wohnweise Kompass

## Aktueller Stand

Das Projekt ist derzeit ein Frontend-only Vite/React-Projekt.
Alle Daten liegen in `src/data/mock-data.ts`.
Es gibt aktuell:

- keine API
- keine Datenbank
- keine Authentifizierung
- keine serverseitige Moderation
- keine Persistenz fuer Bewertungen
- keine Logik fuer einen berechneten WohnCheck-Score

Die Frontend-Struktur ist aber bereits eine gute Vorlage fuer das Backend-Domainmodell:

- `User`
- `Landlord`
- `Property`
- `Neighborhood`
- `Review`
- `Report`

## Empfohlener Stack

Fuer dieses Produkt wuerde ich nicht mit Firebase anfangen, sondern mit einem relationalen Backend:

- `PostgreSQL` als Datenbank
- `Supabase` als schnellster Einstieg oder alternativ `NestJS + Prisma + PostgreSQL`
- `Prisma` fuer saubere Typen, Migrationen und Aggregationen
- `Supabase Auth` oder `Clerk` fuer Login / Registrierung
- `Cron Jobs` / Background Jobs fuer Score-Berechnung und Datenaktualisierung

## Meine Empfehlung

Wenn ihr schnell produktiv werden wollt:

- `Supabase`
- `PostgreSQL`
- `Prisma` optional nur dann, wenn ihr einen separaten Node-Server davor setzt

Wenn ihr mehr Kontrolle und spaeter komplexere Regeln braucht:

- `NestJS`
- `Prisma`
- `PostgreSQL`
- `Redis` spaeter fuer Caching / Queue

Fuer euer Vorhaben halte ich aktuell `NestJS + Prisma + PostgreSQL` fuer die sauberste langfristige Loesung.
Grund:

- CRUD fuer Vermieter, Gebaeude, Stadtteile und Reviews ist relational
- Bewertungen brauchen Moderation, Status, Reports und Aggregationen
- der WohnCheck-Score braucht nachvollziehbare, gewichtete Berechnungen
- oeffentliche Datenquellen sollten serverseitig importiert und versioniert werden

## Kernmodule im Backend

### 1. Auth / User

- Registrierung / Login
- verifizierte Nutzer
- Rollen: `user`, `moderator`, `admin`

### 2. Review-Service

- Bewertung anlegen
- Bewertung bearbeiten
- Bewertung melden
- Bewertung moderieren
- nur veroeffentlichte Bewertungen im Frontend ausliefern

### 3. Directory-Service

- Vermieter verwalten
- Gebaeude verwalten
- Stadtteile verwalten
- Dubletten zusammenfuehren

### 4. Score-Service

- WohnCheck-Score berechnen
- Teil-Scores speichern
- Gewichtung dokumentieren
- Score-Neuberechnung triggern

### 5. Ingestion-Service

- Daten aus oeffentlichen Quellen abrufen
- Rohdaten versioniert speichern
- Normalisierung und Geocoding
- Import-Jobs protokollieren

## Empfohlenes Datenmodell

### Tabellen

- `users`
- `landlords`
- `properties`
- `neighborhoods`
- `reviews`
- `review_reports`
- `review_votes`
- `public_source_snapshots`
- `score_components`
- `score_results`
- `import_jobs`

### Wichtige Beziehungen

- ein `landlord` hat viele `properties`
- ein `property` gehoert optional zu einem `neighborhood`
- ein `review` gehoert genau zu einem Zielobjekt
- ein `review` wird von genau einem `user` erstellt
- ein `review` kann viele `review_reports` haben
- ein Zielobjekt kann viele `score_components` haben

### Review-Modell

Ein Review sollte nicht nur Freitext speichern, sondern auch:

- `status`: `pending`, `published`, `rejected`, `flagged`
- `target_type`: `landlord`, `property`, `neighborhood`
- `target_id`
- `overall_rating`
- `category_ratings` als JSON oder separate Tabelle
- `verified_residency` / `verification_level`
- `helpful_count`
- `moderated_at`
- `moderation_reason`

## WohnCheck-Score

Der WohnCheck-Score sollte nicht direkt nur aus Nutzerbewertungen bestehen.
Sinnvoll ist ein hybrider Score:

- `40%` Nutzerbewertungen
- `30%` Gebaeude-/Lagefaktoren aus oeffentlichen Daten
- `20%` Vermieter-/Verwaltungsindikatoren
- `10%` Vertrauens- und Datenqualitaetsfaktoren

### Moegliche oeffentliche Datenquellen

- Umweltlaermkarten
- OSM / Overpass fuer Infrastruktur im Umfeld
- Destatis / kommunale Open-Data-Portale
- Bodenrichtwert / Mietspiegel, falls rechtlich und technisch sauber nutzbar
- Kriminalitaets- oder Sicherheitsdaten, sofern offen verfuegbar
- OePNV-Erreichbarkeit
- Gruenflaechen, Schulen, Kinderbetreuung, Nahversorgung

### Beispiel fuer Score-Komponenten

- `noise_score`
- `transit_score`
- `green_score`
- `safety_score`
- `amenity_score`
- `building_condition_score`
- `landlord_rating_score`
- `review_confidence_score`

### Wichtig

Den finalen Score immer mit Teilkomponenten speichern, damit er nachvollziehbar bleibt.
Also nicht nur:

- `score = 73`

sondern zusaetzlich:

- `noise_score = 58`
- `transit_score = 84`
- `green_score = 72`
- `review_score = 69`
- `confidence_score = 61`
- `calculation_version = v1`

## API-Schnittstellen

### Oeffentliche Endpunkte

- `GET /landlords`
- `GET /landlords/:id`
- `GET /properties`
- `GET /properties/:id`
- `GET /neighborhoods`
- `GET /neighborhoods/:id`
- `GET /reviews?targetType=property&targetId=p1`
- `GET /scores/:targetType/:targetId`
- `GET /search?q=...`

### Authentifizierte Endpunkte

- `POST /reviews`
- `PATCH /reviews/:id`
- `POST /reviews/:id/report`
- `POST /review-votes`

### Admin / Moderation

- `GET /admin/reviews/reported`
- `PATCH /admin/reviews/:id/publish`
- `PATCH /admin/reviews/:id/reject`
- `POST /admin/imports/run`
- `POST /admin/scores/recalculate`

## Warum relational statt NoSQL

Euer Produkt braucht:

- Filter
- Aggregationen
- Moderation
- Status-Workflows
- Verknuepfungen zwischen Vermieter, Objekt, Stadtteil und Reviews

Das passt deutlich besser zu PostgreSQL als zu einer rein dokumentenbasierten Struktur.

## Technischer Rollout in 3 Phasen

### Phase 1

- PostgreSQL aufsetzen
- Auth einbauen
- CRUD fuer Reviews
- Moderation persistent machen
- Mockdaten in DB uebernehmen

### Phase 2

- echte Entities fuer Vermieter / Objekte / Stadtteile
- Suche ueber API
- Aggregationen fuer Rating und Review-Anzahl serverseitig
- Admin-Bereich an Backend anbinden

### Phase 3

- Import oeffentlicher Datenquellen
- Score-Service
- regelmaessige Re-Berechnung
- Missbrauchsschutz und Vertrauenslogik

## Konkrete Empfehlung fuer dieses Repo

Wenn wir direkt losbauen, wuerde ich als naechsten Schritt anlegen:

1. `backend/` mit `NestJS`
2. `Prisma` Schema mit den oben genannten Kernmodellen
3. REST API fuer `reviews`, `landlords`, `properties`, `neighborhoods`
4. Frontend von Mockdaten auf API umstellen
5. ersten einfachen WohnCheck-Score aus gespeicherten Teilkomponenten berechnen

## Entscheidung

Kurz gesagt:

- fuer CRUD und Bewertungen: `PostgreSQL` + serverseitige API
- fuer schnellen Start: `Supabase`
- fuer die beste langfristige Struktur: `NestJS + Prisma + PostgreSQL`
- fuer den WohnCheck-Score: eigener `Score-Service` plus `Import-Service` fuer oeffentliche Daten
