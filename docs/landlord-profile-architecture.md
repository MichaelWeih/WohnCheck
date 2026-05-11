# Vermieterprofile

## Ziel

Vermieter werden in WohnCheck als interne Profile behandelt. Externe Websites und Originalquellen sind sekundäre Aktionen im Profil, nicht das primäre Klickziel.

## MVP-Datenmodell

- `Landlord`: kanonischer Vermieter aus WohnCheck oder Import.
- `Property`: bekannte Gebäude/Wohnungen mit Relation zu `Landlord`.
- `Review`: Erfahrungsberichte mit `targetType = LANDLORD`.
- `ExternalIdentifier`: externe IDs je Quelle.
- `SourceEvidence`: einzelne öffentliche Quellenbelege.
- `ScoreResult` und `ScoreComponent`: Score-Historie und erklärbare Faktoren.

Für öffentliche Kandidaten, die noch nicht kanonisch importiert sind, liefert die API ein synthetisches Profil mit:

- `profile`: Kennzahlen wie bekannte Wohnungen, aktive Wohnungen, durchschnittlicher Quadratmeterpreis, Datenqualität.
- `score`: vorläufiger Vermieter-Score mit Faktoren.
- `publicSources`: Quellenhinweise.
- `externalLinks`: Website und Originalquelle als sekundäre Aktionen.

## Score-Modell

MVP-Gewichtung:

- Daten-Transparenz: 35 %
- WohnCheck-Erfahrungsberichte: 30 %
- Bekannter Wohnungsbestand: 20 %
- Mietpreisniveau: 15 %

Fehlende Daten werden neutral behandelt und reduzieren nur die `confidenceScore`. Der Score muss immer Faktoren, Gewichtung und Erklärung ausliefern.

## API

- `GET /api/landlords`
- `GET /api/landlords/:id`
- `GET /api/landlords/:id?city=Stuttgart` für externe Kandidatenprofile
- `GET /api/search?q=stuttgart` liefert interne Treffer plus externe Vermieter-Kandidaten, wenn intern nichts gefunden wird.

Später:

- `GET /api/landlords/:id/score`
- `GET /api/landlords/:id/reviews`
- `GET /api/landlords/:id/listings`
- `GET /api/landlords/:id/sources`
- `POST /api/landlords/merge-suggestions`

## UX-Regeln

- Klick auf Vermieter öffnet immer ein internes Profil.
- Externe Links sind klar markierte Buttons: Website, Originalquelle, Angebot oder Kontakt.
- Karten-Popups, Suchergebnisse und Listen verwenden dieselbe interne Navigation.
- Öffentliche Kandidaten werden als solche gekennzeichnet, bis sie kanonisch übernommen wurden.

## Roadmap

1. Kanonische Übernahme externer Vermieter-Kandidaten inklusive Dublettenprüfung.
2. Listing-Import je Vermieter mit Geocoding und Quadratmeterpreis.
3. Eigene Endpunkte für Score, Reviews, Listings und Quellen.
4. Score-Historie und Preisvergleich gegen Stadtteilmedian.
5. Vermieter-Verifizierung und Antwortfunktion.
