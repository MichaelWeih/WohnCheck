# Adresscheck mit interaktiver Umgebungskarte

Unter `/check` wählt man eine Adresse, sieht ihre Umgebung auf einer Karte und dieselben Orte als
Liste, sortiert nach Entfernung. Dieses Dokument beschreibt Aufbau, Datenquellen, Konfiguration,
Start- und Testbefehle sowie die bekannten Grenzen der Daten.

## 1. Überblick

```
Browser                                  Backend (NestJS)                        Extern
───────                                  ────────────────                        ──────
SearchBar / AddressSearch ──────────────▶ GET /api/data-sources/address-suggestions ─┐
LocationExplorer (/check)  ─────────────▶ GET /api/data-sources/geocode             ├▶ Geoapify
                           ─────────────▶ GET /api/data-sources/nearby-places       ─┘  (Geocoding, Places)
MapRenderer (MapLibre GL JS) ───────────────────────────────────────────────────────▶ OpenFreeMap (Kacheln, Stil)
```

- Der Geoapify-Schlüssel liegt ausschließlich im Backend. Der Browser spricht nur mit dem eigenen
  Backend und, nach Zustimmung, mit dem Kartendienst OpenFreeMap.
- Es gibt keine Beispieldaten und keinen Demo-Fallback. Fehlt der Schlüssel, meldet die Oberfläche
  einen Konfigurationsfehler.
- Entfernungen sind ausschließlich serverseitig berechnete Luftlinien (Haversine). Es werden keine
  Gehzeiten, keine Bewertungen und keine Lebensqualitätsnoten berechnet.

## 2. Backend

Alles liegt im bestehenden `DataSourcesModule`
([backend/src/modules/data-sources/location/](../backend/src/modules/data-sources/location/)).

| Datei | Aufgabe |
| --- | --- |
| `location-provider.ts` | Anbieterunabhängige Schnittstellen `GeocodingProvider` und `PlacesProvider` |
| `geoapify.provider.ts` | Einziger Ort mit Geoapify-URLs, -Kategorien und -Antwortformaten; Normalisierung von Adressen und Orten |
| `location.service.ts` | Cache, Zusammenfassen paralleler Anfragen, Teilantworten, Kennzahlen |
| `location-utils.ts` | Haversine, Deduplizierung, Kennzahlen |
| `location-errors.ts` | Fehlerklassen mit maschinenlesbarem `code` |
| `location.controller.ts` | Endpunkte, Validierung, Rate-Limits |
| [`common/api/location-types.ts`](../backend/src/common/api/location-types.ts) | Gemeinsame Typen für Backend und Frontend |

Ein anderer Anbieter wird angebunden, indem eine Klasse beide Schnittstellen implementiert und in
`data-sources.module.ts` an `GeocodingProvider` und `PlacesProvider` gebunden wird.

### Endpunkte

| Endpunkt | Zweck | Limit je Client |
| --- | --- | --- |
| `GET /api/data-sources/address-suggestions?q=…` | Vorschläge während der Eingabe (bestehender Endpunkt, kompatibel erweitert) | 30 / Minute |
| `GET /api/data-sources/geocode?q=…` | Explizite Auflösung einer abgesendeten Adresse, mit `resolution` | 30 / Minute |
| `GET /api/data-sources/nearby-places?lat=…&lon=…&radius=…` | Alle sieben Kategorien samt Kennzahlen und Status | 10 / Minute |

`radius` ist 500, 1000 (Standard), 2000 oder 5000. Ungültige oder leere Koordinaten, unbekannte
Radien und unbekannte Parameter ergeben HTTP 400.

**Adressen** (`ResolvedAddress`): Straße, Hausnummer, PLZ, Ort, Bezirk, Land, Koordinaten,
`accuracy` (`building` | `street` | `area`) und `confidence`.

- Es wird nichts ergänzt. Eine Hausnummer, die der Anbieter nicht bestätigt, wird verworfen; der
  Treffer gilt dann als `street` und wird in der Oberfläche als „Hausnummer nicht bestätigt“ gezeigt.
- Treffer mit sehr geringer Anbieter-Konfidenz (unter 0,2) und Treffer außerhalb Deutschlands werden
  verworfen. Mehrere Betriebe an derselben Adresse ergeben einen Eintrag.
- `geocode` liefert `resolution`: `unique` (genau ein sicherer Treffer, darf ohne Rückfrage verwendet
  werden), `ambiguous` (Auswahl nötig) oder `none`. Es wird nie eine beliebige Adresse übernommen.

**Orte** (`Place`): stabile ID (`osm:node:123`), Name, Haupt- und Unterkategorien, Koordinaten,
`distanceMeters`, Quelle und Link zum OSM-Originaleintrag. Adresse, Öffnungszeiten, Linien und
Website sind nur gesetzt, wenn die Quelle sie liefert.

- Treffer außerhalb des gewählten Radius werden entfernt.
- Gleiche IDs werden zusammengeführt. Haltestellen werden nur bei gleichem Verkehrsmittel und
  entweder gemeinsamer Stationsreferenz (IFOPT) oder gleichem Namen innerhalb von 30 m
  zusammengefasst. Unterschiedliche Verkehrsmittel und benachbarte Betriebe bleiben getrennt.
- Apotheken gehören zu Gesundheit und Einkaufen, stehen in der Antwort aber nur einmal.
- Untertypen werden nur bei belegter Angabe vergeben: „Grundschule“ nur mit `isced:level`,
  „Hausarzt“ nur mit passender Fachrichtung, „Klinik“ nur mit `amenity=clinic`. Ein Bahnsteig ohne
  Angabe des Verkehrsmittels bleibt „Haltestelle (Verkehrsmittel nicht angegeben)“.

**Kennzahlen** je Kategorie (`metrics`): Anzahl erfasster Orte, nächste Entfernung, Anzahl bis 500 m
und bis 1 km, jeweils mit Status:

| Status | Bedeutung |
| --- | --- |
| `complete` | exakte Zahl |
| `minimum` | Kategorie am Limit abgeschnitten, Zahl ist eine Untergrenze |
| `not_covered` | gewählter Radius ist kleiner als der Ring (1 km bei Radius 500 m) |
| `unavailable` | Kategorie konnte nicht geladen werden |

### Abfrage, Cache und Limits

- Jede Hauptkategorie wird getrennt und seitenweise abgefragt (100 je Seite, höchstens 500 je
  Kategorie), mit höchstens zwei gleichzeitigen Anbieteranfragen.
- Erreicht eine Kategorie das Limit, steht sie mit Grund `limit` in `issues`; fällt sie aus, mit
  `timeout`, `quota` oder `error`. Die Oberfläche zeigt solche Zahlen als „erfasste Orte“.
- Vollständig geladene Antworten werden 24 Stunden in `SourceCache` gespeichert, Schlüssel aus
  Anbieter, Datenversion, Koordinaten und Radius. Teilantworten mit ausgefallenen Kategorien werden
  nicht gespeichert; die bereits geladenen Kategorien bleiben zehn Minuten im Arbeitsspeicher, damit
  ein erneuter Versuch nur die fehlenden nachlädt.
- Identische gleichzeitige Anfragen teilen sich einen Anbieterlauf.
- Ist der Anbieter nicht erreichbar, wird ein abgelaufener Eintrag höchstens sieben Tage lang mit
  `stale: true` und sichtbarem Stand ausgeliefert. Ältere Einträge werden gelöscht.
- Adressvorschläge liegen nur fünf Minuten im Arbeitsspeicher. Suchtexte, Koordinaten und
  Anbieter-URLs werden nicht geloggt; geloggt wird nur die Fehlerart.
- Der zentrale Anbieter-Limiter (Abstand zwischen Anfragen, Tagesbudget, Sperre nach HTTP 429 gemäß
  `Retry-After`) ist der vorhandene `OutboundHttpService`. Timeout 12 s, höchstens ein Retry.

### Fehler

Fehlerantworten haben die Form `{ statusCode, message, code, retryAfterSeconds? }`.

| `code` | HTTP | Bedeutung |
| --- | --- | --- |
| `NOT_CONFIGURED` | 503 | Schlüssel fehlt oder wird abgelehnt |
| `TIMEOUT` | 504 | Anbieter hat nicht rechtzeitig geantwortet |
| `QUOTA` | 503 | Tagesbudget erschöpft oder Anbieter drosselt |
| `UNAVAILABLE` | 503 | sonstiger Anbieterfehler |
| (keiner) | 429 | Rate-Limit des eigenen Backends |

## 3. Frontend

Alles unter [src/features/location/](../src/features/location/).

| Komponente | Aufgabe |
| --- | --- |
| `LocationExplorer` | Seite `/check`: URL-Zustand, Laden, Fehler- und Teilzustände |
| `AddressSearch` | Adressfeld mit Vorschlägen und expliziter Auflösung |
| `RadiusSelect`, `CategoryFilters` | Radius sowie Kategorie- und Unterfilter |
| `LocationSummary` | Kennzahlen aus allen geladenen Daten, unabhängig von Filtern |
| `MapRenderer` | Wiederverwendbarer MapLibre-Renderer |
| `PlacesPanel`, `PlaceDetails` | Ergebnisliste und Ortsdetails |
| `utils.ts`, `api.ts` | Filterlogik, URL-Zustand, API-Aufrufe, Fehlertexte |

- **URL-Zustand:** `address`, `lat`, `lng`, `accuracy`, Adressbestandteile, `radius`, `categories`,
  `kinds`. Direkte Links, Neuladen und die Browserhistorie stellen denselben Zustand wieder her.
  Ein Link nur mit `address=` wird aufgelöst und fragt bei mehreren Treffern nach.
- **Filter** wirken nur auf bereits geladene Daten. Karte, Cluster, Trefferzahl und Liste verwenden
  dieselbe gefilterte Menge (`visiblePlaces`). Ein Unterfilter schränkt nur seine eigene Kategorie ein.
- **Karte:** GeoJSON-Clustering statt DOM-Marker, Kategorien über Farbe und Symbol, Adresse als
  eigener Marker mit Radiuskreis. Cluster öffnen sich per Zoom. Verschieben und Zoomen ändern weder
  Suchzentrum noch Daten.
- **Radiuswechsel:** die bisherigen Orte bleiben sichtbar und sind als „Vorheriger Stand“ markiert.
  Bei einer anderen Adresse verschwinden die alten Orte sofort.
- **Ohne Karte:** Kartenressourcen werden erst nach Zustimmung geladen. Ohne Zustimmung, ohne WebGL
  oder bei einem Kartenfehler bleibt die vollständige Liste nutzbar.
- **Suche:** Die zentrale Suche (`SearchBar`) zeigt neben Verzeichnistreffern echte Adressen, ab drei
  Zeichen und nach 350 ms Pause; veraltete Anfragen werden abgebrochen. Eine abgesendete Suche wird
  zusätzlich geocodiert und bietet die gefundenen Adressen zur Auswahl an.
- **Objektansichten:** Suche und Gebäudeseite zeigen ihre Marker über denselben Renderer
  ([src/components/ObjectMap.tsx](../src/components/ObjectMap.tsx)). Die frühere handgebaute Karte
  und ihre lokalen Beispiel-POIs sind entfernt; jedes Gebäude verlinkt stattdessen auf den Adresscheck.

## 4. Datenquellen und Attribution

| Zweck | Dienst | Lizenz / Hinweis |
| --- | --- | --- |
| Adresssuche, Orte | [Geoapify](https://www.geoapify.com/) Geocoding und Places API | Daten © OpenStreetMap-Mitwirkende (ODbL) |
| Kartenkacheln und Stil | [OpenFreeMap](https://openfreemap.org/) | © OpenMapTiles, Daten © OpenStreetMap-Mitwirkende |

Die Attribution steht unter der Karte, in der Kartenecke und an jedem Ort („Originaleintrag bei
OpenStreetMap“).

## 5. Umgebungsvariablen

Backend ([backend/.env.example](../backend/.env.example)):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `GEOAPIFY_API_KEY` | – | Pflicht. Schlüssel von https://myprojects.geoapify.com, nur im Backend |
| `GEOAPIFY_BASE_URL` | `https://api.geoapify.com` | Basis-URL des Anbieters |
| `GEOAPIFY_REQUESTS_PER_SECOND` | `2` | Anbieteranfragen pro Sekunde (0,1 bis 10), passend zum Tarif |
| `GEOAPIFY_DAILY_BUDGET` | `2500` | Anbieteranfragen pro Tag (UTC); danach `QUOTA` |

Frontend ([.env.example](../.env.example)):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `VITE_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | Öffentliche Stil-URL der Karte |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | Basis-URL des Backends |

`VITE_`-Variablen sind öffentlich. Der Geoapify-Schlüssel darf dort nie stehen.

## 6. Lokal starten und testen

```bash
# Backend (Port 3001)
cd backend
npm install --legacy-peer-deps
npm run build && npm start        # oder: npm run start:dev

# Frontend (Port 8080)
npm install
npm run dev -- --host 127.0.0.1
```

```bash
# Backend: Typecheck, Lint, Unit-Tests
cd backend && npx tsc --noEmit && npm run lint && npm test

# Frontend: Typecheck, Lint, Unit-Tests, Build
npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm test && npm run build

# Browsertests des Adresschecks (Frontend muss auf Port 8080 laufen; Anbieter-Fixtures, kein Schlüssel nötig)
npx playwright test -c playwright.location.config.ts

# Live-Abnahme mit echtem Anbieter (Backend mit GEOAPIFY_API_KEY muss laufen, verbraucht Kontingent)
LOCATION_LIVE_TEST=1 npx playwright test -c playwright.location.config.ts -g "live Berlin"
```

Die Tests verwenden Chrome (`channel: "chrome"`). Screenshots liegen unter `artifacts/location/`.

## 7. Verbleibende Datenlimits

- **Vollständigkeit:** Die Orte stammen aus OpenStreetMap. Ob ein Ort, seine Linien oder
  Öffnungszeiten eingetragen und aktuell sind, kann weder Geoapify noch WohnCheck garantieren.
- **500 Orte je Kategorie:** In dichten Gebieten mit 5 km Radius werden Kategorien abgeschnitten
  und entsprechend gekennzeichnet.
- **Linien:** Geoapify liefert Linien nur, wenn sie an der Haltestelle selbst eingetragen sind
  (`route_ref`). In der Abnahmeumgebung in Berlin war das bei keiner Haltestelle der Fall.
- **Haltestellen:** Gegenüberliegende Steige mit mehr als 30 m Abstand und ohne gemeinsame
  Stationsreferenz erscheinen als getrennte Einträge.
- **Kontingent:** Eine vollständige Umgebungsabfrage braucht mindestens sieben Anbieteranfragen, in
  dichten Gebieten deutlich mehr. Der kostenlose Geoapify-Tarif und `GEOAPIFY_DAILY_BUDGET` begrenzen
  die Zahl neuer Adressen pro Tag; zwischengespeicherte Adressen kosten nichts.
- **Ladezeit:** Bei zwei Anfragen pro Sekunde dauert eine neue Umgebungsabfrage etwa fünf bis zehn
  Sekunden.
- **Nur Deutschland:** Die Adresssuche ist auf Deutschland begrenzt.
- **Objektkoordinaten:** Gebäude und Wohngegenden des Verzeichnisses haben noch keine Koordinaten im
  Backend. Die Objektkarte zeigt nur Einträge aus der lokalen Tabelle in
  `src/data/property-map-data.ts`; diese Positionen sind Näherungen.
