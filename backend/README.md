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

- `directory`: Vermieter, Gebaeude, Stadtteile
- `reviews`: CRUD, Reports, Moderation, Aggregationen
- `scores`: WohnCheck-Scores und Teilkomponenten
- `admin`: Moderation und manuelle Rechen-/Import-Trigger
- `prisma`: Datenbankzugriff

## Dev-Logins

- Admin: `admin@wohncheck.local` / `Admin123!`
- Nutzer: `nutzer@wohncheck.local` / `User12345!`
- Vermieter: `vermieter@wohncheck.local` / `Landlord123!`

## Naechste Schritte

- Frontend von Mockdaten auf API umstellen
- Auth einbauen
- Seed aus `src/data/mock-data.ts` ueberfuehren
- Ingestion-Jobs fuer oeffentliche Datenquellen implementieren
