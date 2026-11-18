# Vermieterverzeichnis – Audit, Umbau und Abschlussbericht

Stand: 18.11.2026. Ergänzt die verbindliche Spezifikation [vermieter-verzeichnis.md](vermieter-verzeichnis.md).
Dort steht, wie es sein soll; hier steht, was vorgefunden wurde, was jetzt umgesetzt ist und was fehlt.

## 1. Ursprüngliche Probleme

Alle Befunde sind am Code, an der Dev-Datenbank oder an Live-Abfragen gegen das laufende Backend belegt.

| Problem | Nachgewiesene Ursache | Betroffene Stelle | Lösung | Prio |
| --- | --- | --- | --- | --- |
| „Vonovia Berlin“, „Vonovia AG“, „degewo“, „HOWOGE“ fanden nichts | Die Suche war ein einziges `contains` über den ganzen Suchtext auf Name oder Stadt: keine Normalisierung, keine Wortzerlegung, keine Rechtsform-Entfernung, keine Aliasse. Die pg_trgm-Indizes waren angelegt, wurden aber nie abgefragt. | `directory.service.ts` (`search`) | Namenssuche über `normalizedName` und Aliasse mit Trigrammen; Stadtwörter wirken nur als Ranking | Hoch |
| Verzeichnis praktisch leer | 4 Vermieter in der Dev-DB; alle Tabellen für Import, Aliasse, Kennungen und Jobs leer. Die Module `companies`, `discovery`, `external` und `jobs` waren leere Skelette; die Job-Queue war geschrieben, aber nie registriert. | `*.module.ts` dieser Module | Importpipeline Wikidata und GLEIF über die vorhandene Job-Queue | Hoch |
| Erfundene Vermieter mit „bestätigten“ Gebäudezuordnungen | 3 von 4 Vermietern waren fiktive Seed-Daten („Mueller Hausverwaltung“, „Schmidt und Partner Immobilien“, „Berliner Wohnungsbau GmbH“). Alle 4 Gebäude waren ohne Beleg mit `confidence = 1` zugeordnet. | `prisma/seed.ts`, Dev-DB | Entfernt (Skript `prisma/cleanup-fictitious-seed.ts`); Gebäude haben jetzt keinen Vermieter | Hoch |
| Externer Fallback fand nie Firmen | Er deutete den Suchtext als **Stadtnamen** und lief nur bei 0 internen Treffern. | `directory.service.ts`, `public-web-directory.provider.ts` | Entfernt; ersetzt durch Suche im Bestand plus Recherche per Schaltfläche | Hoch |
| Fehler verschluckt, Treffer flackernd | `catch { return [] }`. Das Zeitbudget von 6 s war kürzer als der 7-s-Abruf je Seite, daher war der erste Aufruf leer und erst ein Folgeaufruf voll. | `directory.service.ts`, `data-sources.service.ts` | Suche ruft keine externen Quellen mehr synchron ab | Mittel |
| Unzulässige Quellen | HTML-Abruf von 18 fest verdrahteten Webseiten sowie öffentliches Overpass; beides schließt die eigene Spezifikation aus. | `public-web-directory.provider.ts`, Endpunkte `landlord-candidates`, `public-landlord-directory` | Provider und Endpunkte gelöscht | Mittel |
| Kandidaten-Links führten auf „Vermieter nicht gefunden“ | Link ohne den nötigen `?city=` | `SearchPage.tsx`, `SearchBar.tsx` | Entfällt; Kandidaten sind echte DB-Einträge | Mittel |
| Kein Statusfilter | Kandidaten und zusammengeführte Einträge wären öffentlich erschienen. | `directory.service.ts` | Öffentlich nur `ACTIVE`; zusammengeführte IDs leiten weiter | Mittel |
| Gebäudebeziehungen ohne Zeit und Prüfstatus | `PropertyParty` kannte nur `role`, `source` und `confidence` und wurde nirgends gelesen. | `schema.prisma`, `directory.service.ts` | Prüfstatus, Gültigkeit, Prüfdatum, Beleg und Wohnungsbezug; im Gebäude-Endpunkt ausgewertet | Mittel |
| Migrationskette auf frischer DB kaputt | Doppeltes `init`; Spalte `normalizedName` wurde zweimal angelegt. Die Dev-DB hatte drei Migrationen nur als angewendet markiert. | `prisma/migrations` | Duplikat entfernt, Doppelanlage entfernt; nachgewiesen auf frischer DB | Mittel |
| Keine „Vermieter melden“-Funktion, `/check` ohne Vermieter | Tabelle `MappingReport` vorhanden, aber ungenutzt | Frontend | Adresszuordnung, Meldeformular, Admin-Prüfung | Hoch |
| Bewertungsziel nur aus den ersten 10 Vermietern wählbar | `searchDirectory("")` mit `take: 10` | `WriteReviewPageV2.tsx`, `RegisterPage.tsx` | Serverseitige Vermieter-Auswahl | Mittel |
| Unveröffentlichte Bewertungen und Meldedaten öffentlich | `GET /reviews?status=PENDING` lieferte jedem nicht veröffentlichte Bewertungen samt Meldungen (Melder-ID, Grund). Nutzer konnten `verificationLevel` selbst setzen. | `reviews.service.ts`, `create-review.dto.ts` | Öffentlich nur veröffentlichte Bewertungen ohne Meldedaten; Feld entfernt | Hoch |
| Doppelbewertungen möglich | Keine Prüfung je Nutzer und Ziel | `reviews.service.ts` | Prüfung plus partieller Unique-Index | Mittel |
| Vermieter-Konto für beliebige Einträge | Registrierung prüfte nur, ob die ID existiert | `auth.service.ts` | Nur aktive, nicht private Vermieter | Niedrig |
| Kaputte Umlaute | Mojibake („FÃ¼r“, „Ã–ffentlicher“) | `LandlordProfilePanels.tsx`, `directory.service.ts` | Betroffener Code entfernt bzw. neu geschrieben | Niedrig |
| Volle Vermieterliste ging an den Browser | Tippfehlerkorrektur im Client | `SearchPage.tsx`, `search-matching.ts` | Fuzzy-Suche auf dem Server | Niedrig |

Supabase und Row-Level-Security werden im Projekt nicht verwendet (NestJS + Prisma + PostgreSQL). Zugriffsrechte
regeln Guards: öffentliche Endpunkte liefern nur `ACTIVE` und nie interne Felder, Admin-Endpunkte verlangen `ADMIN`.

## 2. Ursachen

Die Vermietersuche hat aus drei Gründen nicht funktioniert:

1. **Es gab kaum Daten**, und die vorhandenen waren größtenteils erfunden.
2. **Die Suche konnte reale Schreibweisen nicht finden**: kein Normalisieren, kein Fuzzy-Matching, keine Aliasse; ein Ortswort im Suchtext machte jeden Treffer unmöglich.
3. **Die vorgesehene Architektur war nur als Vertrag vorhanden.** Schema, Typen und Spezifikation existierten, die Implementierung der Module nicht. Stattdessen lief ein älterer Ad-hoc-Pfad, der Webseiten auslas und Suchtexte als Städte behandelte.

## 3. Änderungen

**Datenbank** (Migration `20261118180000_property_relations`):
- `PropertyParty`: `verificationStatus` (VERIFIED / REPORTED / UNCLEAR / HISTORIC), `validFrom`, `validTo`, `lastCheckedAt`, `evidenceRef`, `unitLabel`
- `Property`: `landlordId` darf leer sein (unbekannt ist ein gültiger Zustand); neues Feld `addressKey`
- `MappingReport`: Felder für Adressmeldungen, Art `PROPERTY_ASSIGNMENT`
- `Review`: `tenancyVerification` sowie ein Unique-Index für eine nicht abgelehnte Bewertung je Nutzer und Ziel

Außerdem ist die Migrationskette repariert (siehe Abschnitt 1).

**Backend**:

| Bereich | Dateien |
| --- | --- |
| Identität | `companies/normalization.ts`, `matching.ts`, `company-resolver.service.ts`, `company-merge.service.ts`, `landlord-name-search.service.ts`, `landlord-summary.service.ts`, `public-landlord-lookup.service.ts`, `duplicate-finder.service.ts`, `normalization-bootstrap.service.ts`, `admin-companies.controller.ts` |
| Jobs | `jobs.module.ts` verdrahtet; neu `job-scheduler.service.ts` |
| Import | `discovery/discovery.service.ts`, `discovery.controller.ts`, `providers/wikidata-landlord.provider.ts`, `providers/gleif-landlord.provider.ts`; CLI `src/cli/discovery-sync.ts`, `src/cli/find-duplicates.ts` |
| Externe Plattformen | `external/platform-providers.ts`, `external.service.ts`, `external.controller.ts` |
| Verzeichnis | `directory/directory.service.ts` (neu geschrieben), `property-reports.service.ts`, `directory.controller.ts` |
| Bewertungen | `reviews.service.ts`, `reviews.controller.ts`, `create-review.dto.ts` |
| Konten | `auth.service.ts` |
| Entfernt | `data-sources/providers/public-web-directory.provider.ts` und die beiden Kandidaten-Endpunkte |

**Neue und geänderte API-Endpunkte**:

| Endpunkt | Zweck |
| --- | --- |
| `GET /api/search?q&kind&state` | Fuzzy-Suche; Antwort `SearchResponse` mit `discoveryEligible` |
| `GET /api/search/suggest?q` | Vorschläge |
| `GET /api/landlords?limit&offset&kind&state&sort` | Paginierte Liste (vorher: Liste aller Vermieter) |
| `GET /api/landlords/:id` | Nur `ACTIVE`; Gebäude mit Rolle |
| `GET /api/landlords/:id/profile` | Rechtsname, Kennungen, Aliasse, Konzern, Quellen |
| `GET /api/landlords/:id/external` | Nur Links zu externen Plattformen |
| `POST /api/landlords/:id/reports` | Hinweise zu einem Profil |
| `GET /api/properties/lookup?street&houseNumber&postalCode&city` | Adresszuordnung in Stufen |
| `GET /api/properties/:id` | Rollen, frühere Zuständige, offene Meldungen |
| `POST /api/properties/reports` | Vermieter einer Adresse melden (Login nötig) |
| `GET /api/directory/stats` | Kennzahlen des Verzeichnisses |
| `POST /api/discovery/requests`, `GET /api/discovery/requests/:id` | Recherche in offenen Quellen per Schaltfläche |
| `/api/admin/discovery/…` | Quellen, Import starten |
| `/api/admin/companies/…` | Prüfkandidaten, Zusammenführen, „verschieden“, Rückgängig, Duplikatsuche |
| `/api/admin/directory/…` | Adressmeldungen freigeben oder ablehnen, Zuordnung beenden, Kandidaten freigeben |

**Frontend**:
- Neue Komponenten unter `src/components/landlord/`: `LandlordPicker`, `LandlordAtAddress`, `PropertyRelations`, `ReportLandlordForm`, `ProfileReportForm`, `ExternalExperiences`; außerdem `DiscoveryPrompt`
- Neu geschrieben: `LandlordDetailPage`, `PropertyDetailPage`, `directory-api.ts`, `directory-adapter.ts`, `directory-types.ts`
- Angepasst: Such-, Start-, Registrierungs- und Bewertungsseite; der Adresscheck `/check` hat einen Abschnitt „Vermieter und Verwaltung“
- Entfernt: `LandlordProfilePanels`, `LandlordLogo`, `WriteReviewPage` (V1, ohne Route), `search-matching.ts`

## 4. Datenquellen

| Quelle | Status | Begründung |
| --- | --- | --- |
| **Wikidata** (SPARQL + Suche) | **Live in Betrieb** | CC0, schlüsselfrei. Bekannte Wohnungsunternehmen, kommunale Gesellschaften und Genossenschaften mit Aliassen, Website, Sitz, LEI, Handelsregister (P1320) und Muttergesellschaft. |
| **GLEIF** (LEI-API) | **Live in Betrieb** | CC0, offizielle API. Rechtsname, Rechtsform, Sitzanschrift und LEI, 11 Schlagwort-Bereiche (z. B. „Hausverwaltung“, „Wohnungsbaugenossenschaft“). Deckt viele kleine Hausverwaltungen mit LEI ab. |
| Nutzermeldungen | **In Betrieb** | Nur nach Admin-Freigabe öffentlich |
| OpenStreetMap (`office=property_management`) | Vorbereitet, aus | Nur aus lokaler osmium-Datei (`OSM_EXPORT_FILE`); öffentliches Overpass ist ausgeschlossen. Die ODbL-Share-Alike-Frage beim Zusammenführen ist juristisch offen; der Adapter ist noch nicht geschrieben. |
| OffeneRegister.de | Vorbereitet, aus | CC BY 4.0, aber Stand 2018/19; nur als einmaliger Grundstock mit Admin-Freigabe sinnvoll. Adapter nicht geschrieben. |
| Handels- und Unternehmensregister, Bundesanzeiger | Ausgeschlossen | Nutzungsordnung untersagt systematischen Abruf. Nur Links zur manuellen Prüfung. |
| Verbandsverzeichnisse (GdW u. a.), Branchenbücher | Ausgeschlossen | Datenbankrecht (§ 87a UrhG), keine Lizenz |
| Veröffentlichte Wohnungsbestände (Adresslisten) | Keine Quelle verfügbar | Keine maschinenlesbare, lizenzierte Liste bekannt; Stufe 2 der Adresszuordnung meldet daher „derzeit keine zulässige Quelle“. |
| Trustpilot, Google Maps, Reddit | **Nur Links** | Anzeige und Speicherung von Bewertungen nur mit Vertrag (Trustpilot), laut Bedingungen in Verzeichnissen untersagt (Google) bzw. nur mit kommerzieller Vereinbarung (Reddit). Es werden Suchlinks erzeugt; bestätigte Profil-URLs sind möglich. Keine Kosten. |

Belege zu Endpunkten und Nutzungsbedingungen: [quellenrecherche-2026-11-15.json](quellenrecherche-2026-11-15.json).

## 5. Funktionsumfang

**Vollständig, mit Test nachgewiesen:**
- **Suche:**
  - Normalisierung (Groß-/Kleinschreibung, Umlaute, Rechtsformen), Fuzzy-Suche über Name und Aliasse, Tippfehler („Vonvia“)
  - Ortswort im Suchtext rankt, filtert aber nicht
  - Je Vermieter ein Treffer, Pagination, Vorschläge
  - Kandidaten nicht öffentlich
- **Import:** idempotent (zweimal ausgeführt, identische Zahlen); natürliche Personen ausgeschlossen; Rate-Limits über `Retry-After`; Fehler je Datensatz brechen den Lauf nicht ab.
- **Identitätsauflösung:**
  - Zusammenführung automatisch nur über LEI, Registernummer oder QID plus gleichen Namen bzw. gleiche Domain
  - Unterschiedliche juristische Personen bleiben getrennt („Vonovia Immobilien Treuhand GmbH“ ≠ Vonovia)
  - Unsichere Paare werden Prüfkandidaten
- **Adresszuordnung:**
  - Öffentlich erscheinen nur bestätigte, aktuelle Rollen, jede Rolle getrennt; eine Hausverwaltung wird nie als Eigentümer gezeigt.
  - Frühere Zuständige erscheinen als „früher“.
  - Ohne Treffer steht dort: „Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.“
  - Es wird nie aus Nähe oder ähnlicher Adresse geraten.
- **Meldungen:** Login nötig, gedrosselt, Duplikatschutz; Privatvermieter werden nie namentlich gespeichert; erst die Admin-Freigabe erzeugt eine Zuordnung.
- **Bewertungen:** eine je Nutzer und Ziel, feste Kategorien, Ziel muss öffentlich sein, Meldedaten nicht öffentlich.
- **Admin:** Zusammenführen mit Rückgängig, „verschieden“ markieren, Kandidaten freigeben, Import starten.

**Teilweise:**
- **Admin-Oberfläche:** Alle Admin-Funktionen gibt es nur als API; eine Oberfläche dafür fehlt.
- **Mietverhältnis-Nachweis:** Das Feld `tenancyVerification` ist vorhanden, der Prüfprozess selbst nicht.
- **Externe Profile:** Bestätigte Profil-URLs werden aus Wikidata übernommen; Wikidata liefert für diese Branche aber praktisch keine.
- **Recherche bei Fehltreffer:** Für Suchbegriffe nur aus Branchenwörtern (z. B. „Deutsche Wohnen“) wird sie absichtlich nicht angeboten.

**Nicht umgesetzt:**
- OSM- und OffeneRegister-Adapter
- Löschung auf Antrag (`CompanyErasureService`)
- Themenanalyse
- GLEIF-Mutterbeziehungen (eine Zusatzanfrage je Datensatz)
- Automatische Prüfung bestätigter Profil-Links

## 6. Einschränkungen

- **Private Einzelvermieter** werden bewusst nie automatisch erfasst (DSGVO).
- **Kleine Hausverwaltungen ohne LEI** fehlen. GLEIF kennt nur Firmen mit LEI, Wikidata fast nur große Unternehmen.
- **Breit aufgestellte Konzerne** wie Deutsche Wohnen oder die SAGA führt Wikidata nur als „Immobilienunternehmen“. Sie sind daher Prüfkandidaten, bis ein Admin sie freigibt.
- **Gebäude-Zuordnungen** gibt es nur über geprüfte Meldungen. Für die Abnahmeadresse Kaiser-Wilhelm-Straße 103, 12247 Berlin ist korrekt kein Vermieter hinterlegt.
- **Doppelte Firmen:** Dieselbe Firma aus Wikidata (ohne Rechtsform) und GLEIF (mit Rechtsform, ohne gemeinsame Kennung) erscheint bis zur Admin-Prüfung doppelt, z. B. HOWOGE. Nach dem Import sind es 49 Prüfkandidaten.

## 7. Betrieb

- **Migration:** `npx prisma migrate deploy`, danach `npx prisma generate` (Backend vorher stoppen, sonst sperrt Windows die DLL).
- **Bestehende Dev-DBs:** einmalig `npm run db:cleanup-fictitious-seed`. Das Skript ist idempotent.
- **Erstbefüllung:** `npm run discovery:sync` (oder `POST /api/admin/discovery/sources/:key/sync`). Dauer ca. 2 Minuten, kein API-Schlüssel nötig.
- **Duplikatprüfung:** `npm run companies:find-duplicates`; läuft zusätzlich täglich als lokaler Job.
- **Regelmäßiger Abgleich:** wöchentliche Zeitpläne sind angelegt, aber aus. Einschalten mit `DISCOVERY_AUTO_SYNC=true` oder je Zeitplan in `JobSchedule`.
- **Umgebungsvariablen** (alle optional, siehe `backend/.env.example`):
  - `OUTBOUND_CONTACT` wird für Wikidata empfohlen; ohne Kontakt gilt ein Mindestabstand von 7 s, und es gab einmal HTTP 429.
  - `DISCOVERY_SOURCES` (Standard `wikidata,gleif`)
  - `DISCOVERY_SEARCH_ON_MISS`, `DISCOVERY_SEARCH_ON_MISS_MAX_PER_HOUR`
  - `JOBS_WORKER_ENABLED`, `JOBS_SCHEDULER_ENABLED`
  - `PRIVACY_HASH_SECRET` (sonst wird `JWT_SECRET` verwendet)

## 8. Testnachweise

Ausgeführt am 18.11.2026:

| Prüfung | Ergebnis |
| --- | --- |
| Backend Unit-Tests (`npm test`), davon 19 Pflicht-Abgleichsfälle aus Spez. 3.2 je in beiden Richtungen | 7 Suiten, 132 Tests bestanden |
| Backend-Integrationstests gegen eigene Test-DB (`npm run test:int`) | 22 bestanden |
| Frische Datenbank: komplette Migrationskette angewendet, `prisma migrate diff` gegen das Schema | leer |
| Live-Import Wikidata + GLEIF | 1.067 öffentliche Vermieter, 145 Kandidaten; zweiter Lauf ohne Änderung |
| Live-Suche, 13 Fälle (siehe Fälle 1–3) | 7–120 ms je Anfrage |
| Browsertests Vermieter | 5 bestanden |
| Browsertests Redesign | 13 bestanden (2 an das neue Verhalten angepasst) |
| Browsertests Adresscheck | 29 bestanden |
| Typecheck, Lint und Build von Frontend und Backend | sauber; Lint mit den 9 bereits vorher bestehenden Warnungen |

Die Integrationstests decken die Fälle 4–8, historische Wechsel, Statusfilter, Zusammenführen und Rückgängig,
Bewertungsschutz, Rate-Limits und externe Links ab.

**Die acht geforderten Fälle:**
1. Vonovia wird gefunden, auch als „Vonovia Berlin“, „VONOVIA SE“ und „Vonvia“ (live und Integrationstest).
2. degewo wird gefunden, samt rechtlich eigenständigen Töchtern (live und Integrationstest).
3. Eine regionale Hausverwaltung wird gefunden: „Privata Hausverwaltung GmbH“, „Hausverwaltung Lederer GmbH“ (live und Integrationstest).
4. Eine Adresse mit bestätigtem Vermieter wird korrekt angezeigt (Integrationstest).
5. Eine Adresse ohne Vermieter zeigt den festen Hinweis statt einer erfundenen Zuordnung (live und Integrationstest).
6. Eine Hausverwaltung erscheint nicht als Eigentümer (Integrationstest und Browsertest).
7. Ähnlich benannte, aber verschiedene juristische Personen werden nicht zusammengeführt (Integrationstest und Unit-Tests).
8. Ein zweimal ausgeführter Import erzeugt keine Dubletten (live und Integrationstest).

**Nicht ausgeführt:**
- Kein Live-Test des Meldeflusses mit echter Admin-Freigabe in der Dev-DB; abgedeckt durch Integrationstest gegen die Test-DB.
- Kein Lasttest mit 100.000+ Einträgen; die Indizes sind vorhanden, gemessen wurden 1.212 Einträge.
- Die Unternehmensseite von Wikidata hat beim zweiten Lauf mit HTTP 429 gedrosselt; der Job wurde korrekt verschoben, der Wikidata-Teil des zweiten Laufs lief deshalb erst später.

## 9. Nächste Schritte nach Wirkung

1. **Admin-Oberfläche** für Prüfkandidaten (49 Paare), Kandidaten (145) und Adressmeldungen. Ohne sie bleiben Dubletten wie HOWOGE sichtbar und Konzerne wie Deutsche Wohnen unsichtbar.
2. **GLEIF-Anreicherung über die LEI aus Wikidata**: rechtlicher Name und Sitz als zweite unabhängige Quelle. Das verifiziert automatisch und schließt Lücken.
3. **OSM-Adapter aus lokalem Export** (`office=property_management`) für kleine Hausverwaltungen, als Kandidaten. Vorher die ODbL-Frage klären.
4. **Veröffentlichte Bestandslisten** kommunaler Gesellschaften anfragen (Lizenz bzw. Datenspende). Das wäre die einzige skalierbare Quelle für Stufe 2 der Adresszuordnung.
5. **Mietverhältnis-Nachweis** als Prüfprozess, der keine Unterlagen öffentlich speichert.
6. **Juristische Freigaben** aus Abschnitt 11 der Spezifikation einholen; Datenschutzerklärung und Impressum sind noch Platzhalter.
