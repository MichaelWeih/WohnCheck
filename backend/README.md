# Wohnweise Kompass Backend

Erstes Backend-Scaffold auf Basis von NestJS, Prisma und PostgreSQL.

## Start

1. `cd backend`
2. `.env.example` nach `.env` kopieren
3. `npm install`
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `npm run prisma:seed`
7. `npm run start:dev`

## Kernbereiche

- `directory`: Vermieter, Gebäude, Stadtteile
- `reviews`: CRUD, Reports, Moderation, Aggregationen
- `scores`: WohnCheck-Scores und Teilkomponenten
- `data-sources`: Live-/Hybrid-Abruf externer Quellen mit Quellenkatalog, Cache, Evidence und Lizenzhinweisen
- `admin`: Moderation und manuelle Rechen-/Import-Trigger
- `prisma`: Datenbankzugriff

## Dev-Logins

- Admin: `admin@wohncheck.local` / `Admin123!`
- Nutzer: `nutzer@wohncheck.local` / `User12345!`
- Vermieter: `vermieter@wohncheck.local` / `Landlord123!`

## Nächste Schritte

- Frontend von Mockdaten auf API umstellen
- Auth einbauen
- Seed aus `src/data/mock-data.ts` überführen
- Ingestion-Jobs für öffentliche Datenquellen implementieren

## Externe Datenquellen

Das Backend nutzt eine Hybrid-Strategie: WohnCheck-Bewertungen und kanonische Zielobjekte
werden dauerhaft gespeichert, externe Daten werden dagegen live oder mit Ablaufdatum abgerufen.
Die API arbeitet Cache-first: frische Cache-Daten werden sofort zurückgegeben, abgelaufene
Cache-Daten werden als `isStale` ausgeliefert und im Hintergrund aktualisiert. Nur wenn noch kein
Cache existiert, wartet die Anfrage auf externe Provider.

- `GET /api/data-sources/strategy`: Datenstrategie und Quellennutzung
- `GET /api/data-sources/sources`: registrierter Quellenkatalog inklusive Lizenz und Cache-Regel
- `GET /api/data-sources/landlord-candidates?city=Berlin`: aktuelle Kandidaten für Wohngesellschaften aus OSM/Wikidata
- `GET /api/data-sources/area-signals?city=Berlin`: aktuelle Gebietssignale aus OSM und geplante amtliche Quellen

Google-Places-Inhalte werden nicht als dauerhafte Kern-Daten gespeichert. Dauerhaft vorgesehen
sind nur stabile Identifikatoren wie Place-IDs; Ratings und Reviews müssen live oder gemäß den
jeweiligen Plattformregeln kurzlebig verwendet werden.
