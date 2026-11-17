# Listings MVP

## Architekturentscheidung

WohnCheck importiert freie Mietwohnungen im MVP nur aus rechtlich sauberen Quellen:

- Admin-CSV oder Admin-JSON
- manuelle Admin-Erfassung
- Partner-Feeds
- offizielle APIs mit erlaubter Nutzung
- öffentlich bereitgestellte strukturierte Daten, wenn robots.txt, Terms und Nutzungslage dies erlauben

Große Immobilienportale werden nicht gescrapt. Logins, Captchas, Paywalls und technische Schutzmaßnahmen werden nicht umgangen.

## Backend-Bausteine

- `SourceProvider`: Quellenkatalog mit Methode, Anbieterart, robots-/Terms-Status und Rechtsstatus.
- `SourceQualityScore`: Quellenbewertung nach Aktualität, Vollständigkeit, Recht, Struktur und Zuverlässigkeit.
- `Listing`: normalisiertes Mietwohnungsangebot mit Geo-Daten, Preis, Status, Datenqualität und Preisabweichung.
- `ListingSource`: Quellenbeleg je Listing.
- `District` und `DistrictRentPrice`: Stadtteil und Medianpreise für Preisvergleich.
- `LandlordProfile`: aggregierte Vermieter-Kennzahlen.
- `DuplicateCandidate`: einfache Dublettenprüfung für Admin-Review.
- `ImportJob`: Nachverfolgung von Importläufen.

## Import-Pipeline

MVP-Pipeline:

1. `ListingNormalizer`
2. `ListingValidator`
3. `LandlordResolver`
4. District-Zuordnung
5. Preisvergleich gegen Stadtteilmedian
6. Upsert per `canonicalKey`
7. `ListingSource` schreiben
8. `DuplicateDetectionService`
9. Admin-Freigabe

Fehlende Daten senken die Datenqualität, erzeugen aber keine negative Bewertung.

## API

- `GET /api/listings`
- `GET /api/listings/map?bbox=minLon,minLat,maxLon,maxLat`
- `GET /api/listings/:id`
- `GET /api/listings/:id/sources`
- `GET /api/landlords/:id/listings`
- `GET /api/districts/:id/rent-prices`
- `GET /api/map/layers`
- `GET /api/map/layers/listings`
- `GET /api/map/layers/district-rent-prices`
- `POST /api/imports/listings`
- `GET /api/imports/jobs`
- `POST /api/admin/listings/:id/approve`
- `POST /api/admin/listings/:id/merge`

## Kartenkonzept

Die Karte lädt Listings bbox-basiert und erhält eine reduzierte Marker-Response. Clustering ist vorbereitet über `clusterReady`; echtes Frontend-Clustering oder Vector Tiles folgen bei größerem Datenvolumen.

Layer im MVP:

- freie Wohnungen
- Quadratmeterpreise nach Stadtteil

Später:

- WohnCheck Score Heatmap
- Vermieter-Layer
- Infrastruktur, ÖPNV, Lärm und Grünflächen

## Nächste Schritte

1. Admin-Oberfläche für CSV/JSON-Upload.
2. Map-Layer im Frontend an `/api/listings/map` anbinden.
3. Sidepanel für Listingdetails.
4. Admin-Review-Queue für `NEEDS_REVIEW` Listings.
5. Connector für erste kooperative Anbieterquelle.
