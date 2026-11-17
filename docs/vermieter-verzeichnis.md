# Vermieter-Verzeichnis und externe Mietererfahrungen – Spezifikation

Verbindliche Spezifikation für die Backend-Module `companies`, `jobs`, `discovery`, `external`, `topics`,
die Erweiterung von `directory`, `reviews`, `auth` sowie die zugehörigen Frontend-Teile.

Zugehörige Vertragsdateien (bei Widerspruch gelten die Vertragsdateien und das Prisma-Schema):

- `backend/prisma/schema.prisma`
- `backend/src/common/api/api-types.ts` – Antworttypen der öffentlichen API (auch vom Frontend genutzt)
- `backend/src/common/sources/source-catalog.ts` – Lizenz, Attribution, Priorität je Quelle
- `backend/src/common/geo/german-states.ts`, `backend/src/modules/companies/company-kind.ts`
- `backend/src/modules/companies/company.types.ts`
- `backend/src/modules/jobs/job.types.ts`, `backend/src/common/http/outbound-http.types.ts`
- `backend/src/modules/discovery/discovery.types.ts`
- `backend/src/modules/external/external.types.ts`
- `backend/src/modules/topics/topic.types.ts`
- `docs/quellenrecherche-2026-11-15.json` – geprüfte Endpunkte, Antwortformate und Nutzungsbedingungen

## 1. Ziele und Leitplanken

- Deutschlandweites, automatisch wachsendes Verzeichnis von Vermietern, Wohnungsgesellschaften,
  Genossenschaften und Hausverwaltungen. **Ein Unternehmen = ein Datensatz.**
- **Keine erfundenen Daten.** Kein Feld wird geraten. Fehlendes ist `null` und wird als „nicht verfügbar“
  angezeigt – nie als leerer Text, `0` oder Platzhalter.
- **Lieber kein Treffer als ein falscher.** Unsichere Zuordnungen werden nie automatisch zusammengeführt,
  sondern als Kandidaten zur manuellen Prüfung gespeichert.
- **Kein Scraping**, kein Umgehen von Limits, Captchas oder Nutzungsbedingungen. Externe Plattformen werden
  ausschließlich verlinkt (siehe Abschnitt 10).
- **Nur juristische Personen** werden automatisch erfasst. Natürliche Personen, Einzelunternehmen und
  Personengesellschaften ohne erkennbare Rechtsform nie (DSGVO) – im Zweifel wird verworfen.
- Einfache Infrastruktur: NestJS + Prisma + PostgreSQL. Kein Redis, kein Message-Broker.
- **Nichts crawlt von allein:** Ein frisch gestartetes Backend führt keine Netzwerk-Importe aus, bis ein
  Admin sie startet oder `DISCOVERY_AUTO_SYNC=true` gesetzt ist.

## 2. Datenmodell

`Landlord` bleibt die zentrale Entität. Feste Regeln:

| Sachverhalt | Abbildung |
| --- | --- |
| Alternative Schreibweise, Rechtsname, früherer Name, Kurzform | `LandlordAlias` |
| Marke ohne eigene Rechtspersönlichkeit | `LandlordAlias` mit `type = BRAND` – nie ein eigener Datensatz |
| Unselbständige Niederlassung, Kundencenter | `LandlordLocation` mit `type = BRANCH` – nie ein eigener Datensatz |
| Rechtlich selbständige Tochter- oder Regionalgesellschaft | eigener `Landlord` + `CompanyRelation PARENT_OF` |
| Offizielle Kennung (LEI, Register) und Wikidata-QID | `LandlordIdentifier` |
| Eigentümer / Vermieter / Verwalter einer Immobilie | `PropertyParty` (`Property.landlordId` bleibt der angezeigte Vermieter) |
| Herkunft jedes Datensatzes | `SourceRecord`; Herkunft einzelner Felder: `Landlord.fieldSources` |
| Verweis auf externe Plattform | `ExternalReference` |

### Status und Sichtbarkeit

- `Landlord.status`: `ACTIVE` (öffentlich), `CANDIDATE` (gefunden, noch nicht öffentlich), `MERGED`
  (`mergedIntoId` zeigt auf den Überlebenden), `REJECTED` (geprüft, kein Vermieter), `REMOVED` (auf Wunsch
  gelöscht, nur noch Anker). **Öffentliche Endpunkte liefern ausschließlich `ACTIVE`** und geben interne Felder
  (`confidence`, `normalizedName`, `fieldSources`, `status`, `relevance`, interne Notizen) nie aus.
- Jeder Zugriff über eine Vermieter-ID aus einer URL läuft über `PublicLandlordLookupService.resolve()`:
  `MERGED` → Überlebender plus `redirectedFromId`; alles andere Nicht-Aktive → 404.
- `verificationStatus`: `UNVERIFIED`; `AUTO_VERIFIED` (LEI oder Registernummer vorhanden, oder zwei unabhängige
  Quellen); `MANUALLY_VERIFIED` (Admin). Eine Wikidata-QID allein verifiziert nicht.
- `ExternalReference.matchStatus`: `CONFIRMED` öffentlich; `PROBABLE` öffentlich **nur mit sichtbarem Hinweis**;
  `UNVERIFIED` und `REJECTED` nie öffentlich.
- Automatisch erfasste, nicht von einem Admin geprüfte Datensätze tragen öffentlich den Hinweis
  „Automatisch aus offenen Quellen erfasst, nicht redaktionell geprüft.“

## 3. Identität (Modul `companies`)

### 3.1 Reine Hilfsfunktionen – `companies/normalization.ts`

Exportiert exakt (weitere interne Helfer erlaubt):

```ts
export const NORMALIZATION_VERSION: number;
export interface NormalizedName { normalized: string; legalForm: LegalFormCode | null; tokens: string[] }
/** Kernname ohne Rechtsform. Leerer String, wenn nichts übrig bleibt. */
export function normalizeCompanyName(raw: string): NormalizedName;
/** Gleiche Faltung, aber ohne Rechtsform-Entfernung – für Suchtext. */
export function normalizeSearchText(raw: string): string;
export function legalFormLabel(code: LegalFormCode | null | undefined): string | null;   // "GmbH & Co. KG"
/** null für ungültige URLs und für Sammel-/Portal-/Baukasten-Domains (Blockliste). */
export function registrableDomain(url: string | null | undefined): string | null;
/** Nur http/https, max. 500 Zeichen, normalisiert; sonst null. */
export function safeHttpUrl(raw: string | null | undefined): string | null;
/** null => Kennung wird verworfen (nie gespeichert). */
export function canonicalIdentifier(id: DiscoveredIdentifier): { scheme: IdentifierScheme; value: string } | null;
export function slugifyCompany(name: string, city: string | null | undefined, id: string): string;
export function addressKey(a: { postalCode?: string | null; street?: string | null; houseNumber?: string | null }): string | null;
/** [a, b] mit a < b nach JavaScript-Stringvergleich (wie der DB-CHECK auf MergeCandidate). */
export function orderedPair(a: string, b: string): [string, string];
/** Relevanz/Art aus einem REGISTRIERTEN Namen (starke bzw. schwache Schlagwörter). */
export function classifyByName(name: NormalizedName): { relevance: "confirmed" | "likely" | "unknown"; kind?: CompanyKind };
/** Prüft, ob Text wie ein Firmenname aussieht (Search-on-Miss-Schranke). */
export function looksLikeCompanyQuery(raw: string): { ok: true; normalized: string } | { ok: false; reason: string };
```

**Normalisierung:**

1. Unicode NFKC, Kleinschreibung, `ß→ss`, `ä→ae`, `ö→oe`, `ü→ue`, übrige Diakritika entfernen.
2. Rechtsformen erkennen **bevor** `&` umgeschrieben wird, an beliebiger Stelle im Namen und in Klammern,
   abgekürzt und ausgeschrieben: `GmbH & Co. KG`, `AG & Co. KG`, `SE & Co. KG`, `UG (haftungsbeschränkt) & Co. KG`,
   `GmbH`, `gGmbH`, `mbH`, `Gesellschaft mit beschränkter Haftung`, `AG`, `Aktiengesellschaft` (auch als
   Wortendung: „Wohnungsbau-Aktiengesellschaft“), `SE`, `KGaA`, `KG`, `Kommanditgesellschaft`, `OHG`, `UG`,
   `eG` / `e.G.` / `eingetragene Genossenschaft`, `e.V.` / `eingetragener Verein`, `AöR` /
   `Anstalt des öffentlichen Rechts`, `KdöR`, `Stiftung` (nur als eigenständiges Wort am Ende),
   sowie die **nicht sammelbaren** Formen `GbR`, `e.K.` / `e.Kfm.` / `e.Kfr.` / `Inh.` / `Inhaber`, `PartG` / `PartG mbB`.
   Zusätze wie `i.L.` / `in Liquidation` werden entfernt.
3. `&`, `+`, `u.` → `und`; Satzzeichen und Bindestriche werden zu Leerzeichen; Leerraum zusammenfassen.
4. `normalized` enthält alle übrigen Wörter in Originalreihenfolge – auch Orte und Zahlen.

**Schlagwörter für `classifyByName`** (auf Token-Teilstring geprüft):

- stark (`confirmed`): `wohnungsbaugenossenschaft`, `wohnungsgenossenschaft`, `baugenossenschaft`,
  `wohnungsbaugesellschaft`, `wohnungsgesellschaft`, `wohnungsunternehmen`, `wohnungsbau`, `wohnbau`,
  `wohnungsverein`, `bauverein`, `siedlungsgesellschaft`, `siedlungswerk`, `wohnstaetten`, `wohnungswirtschaft`,
  `hausverwaltung`, `immobilienverwaltung`, `wohnungsverwaltung`, `mietverwaltung`.
  Art: enthält `genossenschaft`/`bauverein`/Rechtsform `EG` → `COOPERATIVE`; `…verwaltung` → `PROPERTY_MANAGER`;
  sonst `HOUSING_COMPANY`. `MUNICIPAL_HOUSING` nur, wenn eine Quelle es ausdrücklich angibt.
- schwach (`likely`, ohne Art): `immobilien`, `grundstueck`, `liegenschaft`, `wohnen`, `wohnraum`, `vermietung`,
  `realestate`.

### 3.2 Abgleich – `companies/matching.ts`

```ts
export interface MatchSubject {
  /** kind "primary" = Anzeigename, "legal" = Rechtsname, "alias" = sonstiger Alias */
  names: Array<{ normalized: string; legalForm: LegalFormCode | null; kind: "primary" | "legal" | "alias" }>;
  identifiers: Array<{ scheme: IdentifierScheme; value: string }>;   // kanonisch
  websiteDomain: string | null;
  postalCode: string | null;
  city: string | null;
}
export function scoreCompanyMatch(a: MatchSubject, b: MatchSubject): { decision: MatchDecision; score: number; reasons: string[] };
```

Regeln in dieser Reihenfolge (die erste zutreffende entscheidet):

0. Beide haben eine LEI und sie unterscheiden sich → **`different`**. Nichts überstimmt das.
1. Gleiche LEI → `same`. Gleiche `GERMAN_REGISTER`-Kennung → `same`.
2. Gleiche Wikidata-QID: bei identischem Kernnamen (Anzeige-/Rechtsname, oder Anzeigename der einen Seite =
   Alias der anderen) → `same`; sonst `candidate` (`shared_qid`). Eine QID ist nie allein ausreichend.
3. Beide haben eine Register-Kennung bzw. QID und sie unterscheiden sich: bei ähnlichen Namen → `candidate`
   (`identifier_conflict`), sonst `different`. Nie stillschweigend `same`.
4. Namensvergleich über Anzeige- und Rechtsnamen (Aliase vom Typ `BRAND`/`SHORT_NAME`/`SPELLING`/`FORMER_NAME`
   können höchstens `candidate` begründen). Tokens werden in **Allerweltswörter** (Branchenbegriffe wie
   `wohnungsbau`, `genossenschaft`, `immobilien`, `hausverwaltung`, `wohnen`, `gesellschaft`, `verwaltung`,
   `grundstueck…`, `bau`, `und`, `der`, …) und **unterscheidende Wörter** (Eigennamen, Orte, Zahlen) geteilt:
   - Leerer Kernname → passt auf nichts (`different`).
   - **Beide** Seiten haben unterscheidende Wörter, die der anderen fehlen („Berlin“ vs. „Hamburg“,
     „Objekt 1“ vs. „Objekt 2“, „Meier“ vs. „Meyer“) → `different`.
   - Identischer Kernname:
     - gleiche (nicht gesperrte) Website-Domain → `same`;
     - gleiche PLZ **und** Rechtsform auf beiden Seiten bekannt und gleich **und** der Name besteht nicht nur
       aus Allerweltswörtern und hat mindestens 2 Tokens oder 5 Zeichen → `same`;
     - sonst `candidate` (auch bei unbekannter oder abweichender Rechtsform, bei bloß gleichem Ortsnamen,
       bei unbekanntem Ort).
   - Die unterscheidenden Wörter der einen Seite sind eine echte Teilmenge der anderen
     („Gewobag“ vs. „Gewobag Wohnungsbau-Aktiengesellschaft Berlin“, „Stadtbau“ + Sitz Würzburg vs.
     „Stadtbau Würzburg“): Entspricht der Überschuss nur Allerweltswörtern und/oder dem Ort der anderen Seite →
     wie „identischer Kernname“ behandeln, aber höchstens `candidate`, solange keine Domain bestätigt.
     Enthält der Überschuss weitere unterscheidende Wörter („Vonovia“ vs. „Vonovia Immobilien Treuhand“):
     Rechtsformen bekannt und verschieden → `different`; sonst `candidate`.
   - Sonst `different`.
5. Rechtsformen gelten nur als vereinbar, wenn sie gleich sind oder eine Seite unbekannt ist.
   `GMBH` vs. `GMBH_CO_KG`, `GMBH` vs. `AG` usw. sind unvereinbar → nie `same` über den Namen.

`score` (0..1) dient nur der Sortierung von Kandidaten.

**Pflicht-Testfälle** (Unit-Tests in `matching.spec.ts`, jeweils mit erwarteter Entscheidung):

| A | B | Erwartung |
| --- | --- | --- |
| „Vonovia SE“, LEI X | „VONOVIA S.E.“, LEI X | `same` |
| „Vonovia SE“, LEI X | „Vonovia SE“, LEI Y | `different` |
| „Vonovia“, Domain vonovia.de | „Vonovia SE“, Domain vonovia.de | `same` |
| „Vonovia“ (ohne Ort, ohne Domain) | „Vonovia SE“ (Bochum) | `candidate` |
| „Vonovia SE“ | „Vonovia Immobilien Treuhand GmbH“ | `different` |
| „Wohnungsbaugenossenschaft Berlin eG“ | „Wohnungsbaugenossenschaft Hamburg eG“ | `different` |
| „Wohnungsgenossenschaft Aufbau eG“, PLZ 01067 | „Wohnungsgenossenschaft Aufbau eG“, PLZ 39104 | `candidate` |
| „Hausverwaltung Müller GmbH“, 80331 | „Hausverwaltung Mueller GmbH“, 80331 | `same` |
| „Hausverwaltung Müller“ (ohne Rechtsform), 80331 | „Hausverwaltung Müller GmbH“, 80331 | `candidate` |
| „Müller Immobilien GmbH“ | „Müller Immobilien GmbH & Co. KG“ (gleiche Adresse, gleiche Domain) | nicht `same` über den Namen; mit gleicher Domain `candidate` |
| „Objekt 12 GmbH & Co. KG“ | „Objekt 13 GmbH & Co. KG“ | `different` |
| „Gewobag“ | „Gewobag Wohnungsbau-Aktiengesellschaft Berlin“ | `candidate` |
| „Stadtbau GmbH“ (Sitz Würzburg) | „Stadtbau Würzburg GmbH“ | `candidate` |
| „Spar- und Bauverein eG“ (Dortmund) | „Spar- und Bauverein eG“ (Hannover) | `candidate` |
| „Deutsche Wohnen SE“ | „Deutsche Wohnen AG“ (gleiche Domain) | `candidate` |
| „Neustadt Wohnbau GmbH“, Ort „Neustadt“ ohne PLZ | gleicher Name, Ort „Neustadt“ ohne PLZ | `candidate` |
| zwei Datensätze, gleiche QID, Namen „LEG“ und „LEG Wohnen NRW GmbH“ | | `candidate` |
| zwei Datensätze, gleiche Registerkennung `R2201_HRB16879` | | `same` |
| leerer Kernname („GmbH“) | beliebig | `different` |

### 3.3 Auflösung – `CompanyResolverService.upsertFromSource`

Alle Identitäts-Schreibvorgänge (Resolver, Merge, Unmerge, Erasure) beginnen ihre Transaktion mit
`SELECT pg_advisory_xact_lock(727001)` – sie laufen damit streng nacheinander. Das reicht aus (der Durchsatz ist
durch die Rate-Limits der Quellen begrenzt) und schließt gleichzeitige Doppelanlagen aus.
Kennungen werden **vor** dem Einfügen nachgeschlagen; ein Unique-Fehler darf nie zur Steuerung dienen, und
`LandlordIdentifier.landlordId` wird außerhalb des Merge nie umgehängt.

Ablauf für einen `DiscoveredCompany`-Datensatz `r`:

1. **Verwerfen** (`skipped`, nichts speichern, Name nicht loggen):
   - Sitzland angegeben und nicht `DE` → `skipped:not_germany`;
   - weder `entityNature = "legal_entity"` noch eine sammelbare Rechtsform (`COLLECTABLE_LEGAL_FORMS`) aus
     `r.legalForm` / Rechtsname / Name → `skipped:not_legal_entity`; ebenso bei erkannter Form `GBR`/`EK`/`PARTG`;
   - Treffer in `DiscoverySuppression` (Quelle+ID, Kennung, Namens-Hash) → `skipped:suppressed`.
2. **Kandidaten sammeln** – alle Treffer, nicht der erste:
   a) `SourceRecord (sourceKey, externalId)`; b) jede kanonische Kennung in `LandlordIdentifier`.
   `MERGED`-Treffer werden zum Überlebenden verfolgt. Treffer auf `REJECTED`/`REMOVED` → `skipped:rejected`
   (nur `lastSeenAt` des SourceRecord aktualisieren).
   - Genau ein Vermieter → Ziel gefunden.
   - Mehrere verschiedene → **nichts umhängen**: Ziel ist der Treffer über die quelleneigene Primärkennung
     (SourceRecord, sonst LEI, sonst Register, sonst QID); die widersprechenden Kennungen werden nicht angelegt;
     je Paar ein `MergeCandidate` (Score 1, Grund `identifier_conflict`), `ChangeLog IDENTIFIER_CONFLICT`,
     Rückgabe mit `conflicts[]`.
   - Treffer nur über den SourceRecord: mit `scoreCompanyMatch` gegenprüfen; ist das Ergebnis `different`
     (die Quell-ID bezeichnet inzwischen etwas anderes), wird der SourceRecord gelöst (`ChangeLog SOURCE_DETACHED`)
     und `r` als neu behandelt.
3. **`recordKind = "location"`:** Lässt sich `locationOf` eindeutig auflösen (Kennung oder Quell-ID), wird
   ausschließlich eine `LandlordLocation (BRANCH)` samt SourceRecord angelegt – kein Alias, kein neuer Vermieter →
   `location_attached`. Mit `via = "brand"` nur, wenn zusätzlich der Kernname passt (Franchise-Büros gehören nicht
   zur Marke). Sonst wird `r` wie ein eigenständiges Unternehmen behandelt (Schritt 4).
4. **Kein Ziel:** Kandidatensuche unter `ACTIVE`, `CANDIDATE` und `REJECTED` (nie `PRIVATE_LANDLORD`):
   exakter `normalizedName` (Landlord und Alias), gleiche `websiteDomain`, dann Trigramm-Treffer
   (`LandlordNameSearchService`, Top 20). Jeden mit `scoreCompanyMatch` bewerten.
   - genau ein `same` → Ziel (bei `REJECTED`: SourceRecord anhängen, `skipped:rejected`);
   - mehrere `same` → neu anlegen als `CANDIDATE` + `MergeCandidate` je Paar;
   - `candidate`-Treffer (max. 5, beste zuerst; Paare mit Status `DISTINCT` werden übersprungen):
     hat `r` eine eigene LEI oder Registerkennung **und** Relevanz `confirmed` → neu als `ACTIVE` plus
     `MergeCandidate` (öffentliches Paar zur Prüfung); sonst neu als `CANDIDATE` plus `MergeCandidate`;
   - kein Treffer → neu anlegen.
   **Status eines neuen Datensatzes:** `ACTIVE` nur bei Relevanz `confirmed` (aus der Quelle oder aus
   `classifyByName` eines registrierten Namens); bei `trigger = "search_on_miss"` zusätzlich nur, wenn eine LEI
   oder Registerkennung vorliegt oder die Quelle nicht öffentlich editierbar ist. Sonst `CANDIDATE`.
   Inaktive, bisher unbekannte Unternehmen → `skipped:inactive_unknown`.
   OSM-Datensätze (`sourceKey = "osm"`) werden nur bei `OSM_AUTO_PUBLISH=true` `ACTIVE`, sonst `CANDIDATE`.
   Slug: `slugifyCompany(name, city, id)` mit vorab erzeugter ID (nie „versuchen und wiederholen“).
5. **Felder aktualisieren** nach Quellen-Priorität (`sourcePriority`, `Landlord.fieldSources`): Eine Quelle darf
   ein Feld (`name`, `legalName`, `legalForm`, `city`, `postalCode`, `state`, `website`, `kind`,
   `operationalStatus`) setzen, wenn es leer ist oder von ihr selbst oder einer Quelle **niedrigerer** Priorität
   stammt. `manual` wird nie überschrieben; `MANUALLY_VERIFIED`-Datensätze werden nur ergänzt (Aliase, Kennungen,
   Standorte, Quellen). Ein ersetzter Name wird Alias. `website` nur über `safeHttpUrl`; `websiteDomain`,
   `normalizedName`, `legalForm`, `companyType` (= `COMPANY_KIND_LABELS[kind]`) werden mitgeführt.
   Relevanz ist das Maximum über alle Quellen. `entityStatus = "inactive"` → `operationalStatus = DISSOLVED`
   (bleibt öffentlich, wird gekennzeichnet).
6. **Kindzeilen** mit `sourceRecordId`: Aliase (aus `aliases[]` und `legalName`; nie aus Standortnamen;
   Invariante: kein Alias wiederholt den eigenen Kernnamen mit gleicher Rechtsform), Kennungen (höchstens eine LEI
   je Vermieter), Standorte (Hauptsitz: `externalRef = "<externalId>#hq"`; ohne Ref: `"<externalId>#" + Hash der
   Adresse`; nur mit PLZ oder Straße; gleiche `addressKey` wird wiederverwendet; höchstens ein `HEADQUARTERS` –
   der der höchstpriorisierten Quelle, andere werden `BRANCH`), `operatingStates` neu berechnen.
   Ändert sich der `contentHash` eines SourceRecord, werden dessen Kindzeilen entfernt, die die Quelle nicht mehr nennt.
7. **Beziehungen:** Gegenseite über Kennung oder Quell-ID eindeutig auflösbar → `CompanyRelation`; sonst
   `PendingRelation`. Nach jedem Anhängen einer Kennung oder eines SourceRecord werden passende `PendingRelation`
   materialisiert. Selbstbezüge werden verworfen.
8. **SourceRecord:** `payload` = Datensatz ohne `fetchedAt`; `contentHash` = sha256 des schlüsselsortierten JSON.
   Unverändert → nur `lastSeenAt`, `removedAt = null`, `lastRefreshedAt`; Ergebnis `unchanged`.
9. `verificationStatus` / `confidence` neu berechnen (`confidence`: 0,3 Basis; +0,4 offizielle Kennung;
   +0,2 zweite unabhängige Quelle; +0,1 Domain; `MANUALLY_VERIFIED` = 1). `ChangeLog` für jede Änderung.
10. Nach Commit: `external.link-landlord` für `created`/`updated`/`candidate_created` einreihen
    (`dedupeKey` aus `linkLandlordDedupeKey`, `rerunIfRunning`).

### 3.4 Zusammenführen, Rückgängig, Löschen

`CompanyMergeService.merge(survivorId, loserId, actor, { force })` in einer Transaktion (Advisory-Lock, beide
Zeilen `FOR UPDATE` in ID-Reihenfolge):

- Vorbedingungen: IDs verschieden; beide `ACTIVE` oder `CANDIDATE`; **keine unterschiedlichen LEI** (harter Fehler,
  auch mit `force`); Paar als `DISTINCT` entschieden oder Verlierer `MANUALLY_VERIFIED` → nur mit `force`.
- Umhängen mit Dubletten-Auflösung: Aliase (bereits vorhandene überspringen), Kennungen, Standorte (gleiche
  `addressKey` zusammenlegen, Hauptsitz des Verlierers wird `BRANCH`), SourceRecords, externe Verweise (bei Kollision
  gewinnt admin-verifiziert, dann `CONFIRMED` > `PROBABLE` > `UNVERIFIED`; `MappingReport.externalReferenceId`
  vorher umhängen), Meldungen, Beziehungen (Selbstbezüge und Doppelte entfernen), `PendingRelation` (über
  SourceRecords), `Property.landlordId`, `PropertyParty`, `User.landlordId`, `Review.targetId` (`targetType = LANDLORD`),
  `PublicSourceSnapshot.targetId`, `ScoreResult` des Verlierers löschen, `MergeCandidate` (Paar neu ordnen,
  Selbstpaar löschen, bei Kollision gewinnt `DISTINCT`; das zusammengeführte Paar wird `MERGED`),
  frühere Verlierer des Verlierers (`mergedIntoId`) auf den Überlebenden umstellen.
- Name und Rechtsname des Verlierers werden Aliase (`source = "merge"`). Verlierer: `status = MERGED`,
  `mergedIntoId`. Leere Felder des Überlebenden werden aus dem Verlierer gefüllt.
- `LandlordMerge.snapshot` hält fest: Felder des Verlierers vorher, IDs aller umgehängten Zeilen je Tabelle,
  vollständige Kopien als Dublette gelöschter Zeilen, geänderte Felder des Überlebenden. `ChangeLog MERGED` auf beiden.
- `unmerge(mergeId)` stellt aus dem Snapshot wieder her, sofern der Verlierer noch `MERGED` ist und der Überlebende
  seither nicht selbst zusammengeführt wurde; sonst Fehler mit Begründung.

Wird ein `MergeCandidate` als `DISTINCT` entschieden, wird jede Seite, die `CANDIDATE` ist, keine weiteren
`PENDING`-Kandidaten und Relevanz `CONFIRMED` hat, `ACTIVE`.

`CompanyErasureService.erase(landlordId, { reason, mappingReportId }, actor)`: Aliase, Kennungen, Standorte,
SourceRecords, externe Verweise, Beziehungen, Kandidaten und ChangeLog-Diffs löschen; Felder neutralisieren
(`name = "Entfernter Eintrag"`, übrige `null`), `status = REMOVED`; zuvor je SourceRecord, je Kennung und für den
Namens-Hash einen `DiscoverySuppression`-Eintrag anlegen, damit nichts wieder importiert wird. Bewertungen bleiben
unberührt (eigene Moderation). Ein hartes `DELETE` gibt es nicht.

Beim Start (`onApplicationBootstrap`, vor dem ersten Job) normalisiert das Modul alle Zeilen mit
`normalizationVersion < NORMALIZATION_VERSION` nach (Vermieter samt Aliasen, in Blöcken). Der Resolver verweigert
die Arbeit (`RescheduleJobError`), solange solche Zeilen existieren. `prisma/seed.ts` setzt die neuen Felder über
dieselben Funktionen.

### 3.5 Namenssuche – `LandlordNameSearchService`

Eine gemeinsame SQL-Implementierung für Resolver und öffentliche Suche: `word_similarity` über
`Landlord.normalizedName` und `LandlordAlias.normalizedName` mit dem Operator `<%` (nutzt die GIN-Indizes),
Schwelle per `SET LOCAL pg_trgm.word_similarity_threshold` **in derselben Transaktion**, dedupliziert je Vermieter,
dazu Präfix-Treffer (`LIKE 'abc%'`) für kurze Eingaben. Raw-SQL-Regel: Spalten der Alt-Tabellen sind
`TIMESTAMP` ohne Zeitzone – dort nie blankes `now()` vergleichen.

### 3.6 Öffentliche Karten – `LandlordSummaryService`

`summarize(ids)` ist die einzige Stelle, die aus Vermieter-Zeilen die öffentliche Karte `LandlordSummary` baut
(Etiketten, `null`-Behandlung, Bewertungsschnitt aus veröffentlichten Bewertungen in **einer** gruppierten Abfrage).
`directory`, `companies` und `discovery` verwenden ausschließlich diesen Dienst, damit überall dieselben Karten
entstehen. Nicht-aktive IDs werden ausgelassen.

`CompaniesModule` ist global und exportiert: `CompanyResolverService`, `CompanyMergeService`,
`PublicLandlordLookupService`, `LandlordNameSearchService`, `LandlordSummaryService`.

## 4. Hintergrundjobs (Modul `jobs`) und ausgehende Aufrufe (`common/http`)

Vertrag und Zustandsautomat: `jobs/job.types.ts` (maßgeblich). Ergänzend:

- Abholen: ein einzelnes Autocommit-Statement `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING *` über `$queryRaw` (Enum-Parameter casten: `$1::"JobStatus"`). Besitz wird über
  `status`/`lockedBy`/`lockExpiresAt` getragen, nie über eine offene Transaktion.
- Lease 60 s, Erneuerung alle 20 s durch den Worker; jedes abschließende `UPDATE` ist mit `lockedBy` abgesichert
  (0 Zeilen → Ergebnis verwerfen). Der Reaper holt abgelaufene Leases zurück (oder setzt `DEAD`).
- Alle Zeitspalten der neuen Tabellen sind `timestamptz`; Raw-SQL nutzt die Datenbankuhr.
- Scheduler: Zeitplan atomar beanspruchen (`UPDATE "JobSchedule" SET "nextRunAt" = now() + Intervall … WHERE
  "nextRunAt" <= now() AND enabled RETURNING *`) und in derselben Transaktion einreihen. Kein Nachholen nach Ausfall.
  `network`-Zeitpläne werden deaktiviert angelegt, außer `DISCOVERY_AUTO_SYNC=true`.
- `JOBS_WORKER_ENABLED`, `JOBS_SCHEDULER_ENABLED` (beide Standard `true`, in Tests `false`),
  `JOBS_WORKER_CONCURRENCY` (Standard 2). Für Tests: `JobQueueService.drain()`.
- Graceful Shutdown: nicht mehr abholen, Signale abbrechen, bis `JOBS_SHUTDOWN_GRACE_MS` (10 s) warten, Rest freigeben.
- `jobs.cleanup` (täglich, lokal): löscht `SUCCEEDED`/`CANCELLED` älter als `JOBS_RETENTION_DAYS` (30).
- Admin (`/admin/jobs`, Rolle ADMIN): `GET /admin/jobs?status&type&limit&offset` (paginiert),
  `GET /admin/jobs/stats` (Anzahl je Typ und Status, älteste wartende, Dead Letters), `POST /admin/jobs/:id/retry`,
  `POST /admin/jobs/:id/cancel`, `GET /admin/jobs/schedules`, `PATCH /admin/jobs/schedules/:key`
  (`intervalMinutes`, `enabled`), `POST /admin/jobs/schedules/:key/run-now`.

`OutboundHttpService` (Vertrag: `outbound-http.types.ts`): nur registrierte Hosts, nur https, keine automatischen
Redirects, Abstand je Host und Tagesbudget in `OutboundHostState` (atomare Slot-Reservierung per `UPDATE … RETURNING`),
429/503 werden nicht im Aufruf ausgesessen, sondern als `rate_limited` mit `retryAt` gemeldet. User-Agent:
`WohnCheckBot/<version> (<OUTBOUND_CONTACT>)`; ohne `OUTBOUND_CONTACT`: `WohnCheckBot/<version> (contact not configured)`
und Mindestabstand 7 s für Wikimedia-Hosts. Fehlertexte und URLs werden von Geheimnissen bereinigt.
Transport über das Token `OUTBOUND_FETCH` austauschbar (Tests).

## 5. Discovery (Modul `discovery`)

Pipeline `discovery.sync-source` (ein Seitenabruf je Lauf, Fortsetzung über `JobContinuation`):
Zustand laden → Provider `fetchPage` → jeden Datensatz dem Resolver übergeben (Fehler eines Datensatzes werden
gezählt und geloggt, brechen die Seite nicht ab) → Cursor speichern → bei `done`: Wasserzeichen = Startzeit des
Laufs, `mode = INCREMENTAL`; nach einem vollständigen `FULL`-Lauf `markUnseenSourceRecords`.
`OutboundHttpError` der Art `rate_limited`/`budget` → `RescheduleJobError(retryAt)`.
Ein Zeitplan-Lauf für einen Bereich, dessen erster Voll-Import noch nicht von einem Admin gestartet wurde
(`fullSyncRequested = false`), tut nichts. Voll-Import starten: `POST /admin/discovery/sources/:key/sync`.

### Quellen

| Quelle | Zugriff | Rolle | Standard |
| --- | --- | --- | --- |
| `wikidata` | SPARQL (`WIKIDATA_SPARQL_URL`), Suche über Action API | bekannte Unternehmen, Aliase, Websites, QID | aktiv |
| `gleif` | `api.gleif.org` | Rechtsname, Rechtsform, Sitz, Register, LEI, Mutter/Tochter | aktiv |
| `offeneregister` | lokale JSONL-Datei (`OFFENEREGISTER_FILE`) | einmaliger Grundstock, Stand 2018/19 | aus (Datei nötig) |
| `osm` | lokale GeoJSON-Seq-Datei aus osmium (`OSM_EXPORT_FILE`) | Standorte und kleine Hausverwaltungen | aus (Datei nötig) |

Einzelheiten zu Abfragen, Feldern und Limits: `docs/quellenrecherche-2026-11-15.json`. Verbindlich:

- **Wikidata:** Aufzählung per SPARQL (Klassen `Q562166`, `Q1534992`, `Q1618728`, `Q4986589` → Relevanz
  `confirmed`; `Q1660104` und Branchen `Q1660132`/`Q2588161` → `likely`), ohne `SERVICE wikibase:label` und ohne
  `wikibase:mwapi` (entfallen mit der Umstellung des Abfragedienstes). Personen (`Q5`), aufgelöste (`P576`) und
  Nicht-Organisationen ausschließen. Namenssuche über `action=query&list=search` mit `haswbstatement:P17=Q183`,
  Anreicherung über `wbgetentities` (bis 50 IDs). Kennungen: QID immer; LEI (`P1278`); Register aus `P1320`
  (`de/<Gericht>_<Art><Nummer>`). `P159` ist nicht immer eine Stadt – nur übernehmen, wenn das Ziel eine Gemeinde ist,
  sonst `city` weglassen. Limits: höchstens 1 Anfrage/s, seriell.
- **GLEIF:** Aufzählung über `filter[entity.legalForm]=AZFE` (eG) sowie Namens-Schlagwörter aus Abschnitt 3.1,
  jeweils `filter[entity.legalAddress.country]=DE`, Seitengröße 200, Cursor-Paging; inkrementell über
  `filter[registration.lastUpdateDate]`. `EntityCategory` `SOLE_PROPRIETOR` verwerfen. `entity.status = INACTIVE` →
  `inactive`; ein `LAPSED` der Registrierung allein nicht. Register nur, wenn der XJustiz-Gerichtscode bekannt ist
  (aus `ocid`, sonst über die mitgelieferte Zuordnung `RA-Code → XJustiz`, die per Skript aus GLEIF-Daten erzeugt
  wird; unbekannt → Kennung weglassen). Direkte Mutter über `relationships.direct-parent`; keine Konzernspitze.
  Höchstens 1 Anfrage/s.
- **OffeneRegister:** nur Unternehmensfelder (Name, Register, Sitz, Status); keine Personen (officers).
  Nur `current_status = "currently registered"`; Relevanz über `classifyByName`. Jeder Datensatz ist `CANDIDATE`,
  bis eine zweite Quelle ihn bestätigt oder ein Admin ihn freigibt.
- **OSM:** nur aus lokaler Datei; die öffentliche Overpass-Schnittstelle wird nicht verwendet. Elemente sind
  Standorte (`recordKind = "location"`); `operator:wikidata`/`brand:wikidata` → `locationOf`. Keine `user`/`uid`-Felder.

### Search-on-Miss

1. `GET /search` liefert `discoveryEligible`. Die Suchseite zeigt dann eine **Schaltfläche**
   („Unternehmen nicht gefunden? In offenen Quellen suchen“) mit dem Hinweis, dass der Begriff an Wikidata und GLEIF
   gesendet wird. Nie automatisch, nie aus der Autovervollständigung.
2. `POST /discovery/requests { query }` (gedrosselt: 5 je 10 min je IP) prüft serverseitig in dieser Reihenfolge:
   Funktion eingeschaltet und mindestens ein Provider mit `searchByName` aktiv (sonst `UNAVAILABLE`);
   `looksLikeCompanyQuery` (sonst 400); lokale Suche – gibt es einen aktiven Treffer, Antwort `NOT_NEEDED` mit den
   Treffern, ohne etwas zu speichern; globales Stundenlimit (`DISCOVERY_SEARCH_ON_MISS_MAX_PER_HOUR`, sonst 429).
3. In **einer** Transaktion: `DiscoveryQuery` per `INSERT … ON CONFLICT (queryHash) DO UPDATE` anlegen/zählen;
   läuft sie → Status zurück; abgeschlossen und `retryAfter` in der Zukunft → gespeichertes Ergebnis; sonst
   per Compare-and-Swap auf `PENDING` setzen und den Job mit `enqueue(…, tx)` einreihen (`dedupeKey` aus der ID,
   Priorität 10). Schlüssel ist `HMAC-SHA256(normalisierter Begriff, PRIVACY_HASH_SECRET)`.
4. Job: alle aktiven Provider mit `searchByName` (`Promise.allSettled`), je Treffer Prüfung der Namensähnlichkeit
   zum Suchbegriff, höchstens 5 Resolver-Aufrufe mit `trigger = "search_on_miss"`.
   Ergebnis: `FOUND` (mindestens ein aktiver Vermieter), `NEEDS_REVIEW` (nur Kandidaten), `NOT_FOUND`
   (**nur** wenn alle Provider fehlerfrei geantwortet haben), sonst `FAILED`.
   `retryAfter`: `FOUND` 1 Tag, `NEEDS_REVIEW` 7 Tage, `NOT_FOUND` 14 Tage, `FAILED` `min(15 min · 2^n, 24 h)`.
   Der Klartext wird bei `FOUND`/`NOT_FOUND`/`FAILED` sofort gelöscht.
5. `GET /discovery/requests/:id` liefert nie den Suchtext. Die ID ist eine Zufalls-UUID.
6. `discovery.purge-queries` (stündlich, lokal): löscht abgelaufene Zeilen, setzt hängende `PENDING`/`RUNNING`
   (älter als 15 min) auf `FAILED`.

Admin (`/admin/discovery`): `GET sources` (aktiv/Grund, Sync-Stände je Bereich), `POST sources/:key/sync`
(`{ scope?, mode?: "FULL" }`), `GET queries?status=NEEDS_REVIEW`.

## 6. Externe Plattformen (Modul `external`)

Alle Plattformen sind **nur verlinkt**; Provider machen keine Netzwerkaufrufe (Vertrag: `external.types.ts`).

| Plattform | Suchlinks | Gespeicherte Verweise |
| --- | --- | --- |
| `trustpilot` | `https://de.trustpilot.com/search?query=<Name>` | Profil-URL `https://de.trustpilot.com/review/<slug>` (Slug vom Admin bestätigt oder aus Wikidata `P5161`) |
| `google_maps` | `https://www.google.com/maps/search/?api=1&query=<Name Ort>` | Place ID (manuell ermittelt) → Link mit `query_place_id` |
| `reddit` | Suche gesamt und in `r/wohnen`, `r/LegaladviceGerman`, `r/de`, `r/Finanzen`, `r/Immobilieninvestments` | Diskussion als `https://www.reddit.com/comments/<id>` (ohne Titel-Slug) |
| `golocal` | `https://www.golocal.de/suchen/?q=location&what=<Name>&address=<Ort>` | Profil-URL (manuell) |
| `provenexpert` | – | Profil-URL (manuell) |
| `immoscout24` | – | Anbieterseite `https://www.immobilienscout24.de/anbieter/<slug>/<id>` (manuell) |

Regeln:

- Firmennamen in Suchlinks in Anführungszeichen und URL-kodiert; bei kurzen/mehrdeutigen Namen (< 5 Zeichen oder
  nur Allerweltswörter) zusätzlich der Ort.
- `parseReferenceUrl` ist die einzige Tür für URLs: Host-Whitelist je Plattform, https, kanonische Form, keine
  Nutzerprofil-URLs. Es wird nur die kanonische URL gespeichert.
- Aus Quellen stammende Verweise (`external.link-landlord`): `CONFIRMED` nur, wenn die Angabe zu unseren Daten passt
  (z. B. Trustpilot-Slug = `websiteDomain`); sonst `PROBABLE`. Abgeleitete Vorschläge
  (`deriveProfileSuggestions`) immer `UNVERIFIED` – sie erscheinen nur in der Admin-Warteschlange.
- Ein Profil (Plattform + `externalId` bzw. URL) kann nur für **einen** Vermieter `CONFIRMED`/`PROBABLE` sein;
  ein als `REJECTED` markierter Verweis wird nicht erneut vorgeschlagen.
- Diskussionen nur für juristische Personen, nur vom Admin angelegt; öffentlich erscheint ein generiertes Etikett
  („Diskussion auf Reddit (r/wohnen)“) plus optional Themen aus der festen Themenliste – kein Titel, kein Zitat,
  kein Nutzername. `internalNote` wird nie öffentlich ausgegeben.
- `external.review-due` (täglich, lokal): setzt `recheckDueAt` für Verweise, deren Bestätigung älter als
  `EXTERNAL_RECHECK_DAYS` ist. Eine automatische Erreichbarkeitsprüfung findet nicht statt (wäre automatisierter
  Zugriff auf die Plattform).
- `GET /landlords/:id/external` → `LandlordExternalResponse`; `helpLinks` enthält
  „Mieterverein vor Ort finden“ (`https://mieterbund.de/mieterverein-vor-ort/`).
- `POST /landlords/:id/reports` (gedrosselt: 5 je Stunde je IP; optional angemeldet über `OptionalJwtAuthGuard`)
  → `MappingReport`. Beim Schließen (`RESOLVED`/`DISMISSED`) werden `contactEmail` und `message` geleert.
- Admin (`/admin/external`): `GET references?matchStatus&platform&recheckDue`, `POST landlords/:id/references`
  (manuell, über `parseReferenceUrl`), `PATCH references/:id` (`matchStatus`, `label`, `internalNote`, `topics`,
  `locationId`), `DELETE references/:id`, `GET reports?status`, `PATCH reports/:id`
  (`status`, `resolutionNote`).

## 7. Themenanalyse (Modul `topics`)

- Analysiert werden nur **eigene, veröffentlichte** Bewertungen mit `targetType = LANDLORD`.
- Standard-Analyzer `rules-v1`: je Thema eine Schlagwortliste (auf gefaltetem Text), Fundstelle = der vollständige
  Satz, in dem das Schlagwort steht (höchstens 300 Zeichen, wörtlich). Aussageart je Fundstelle:
  `ALLEGATION`, wenn der Satz ein Vorwurfswort enthält (z. B. `betrug`, `abzocke`, `illegal`, `rechtswidrig`,
  `kriminell`, `schikane`, `luege`); sonst `FACT_CLAIM`, wenn er eine konkrete Angabe enthält (Geldbetrag, Datum,
  Zeitraum wie „seit 3 Monaten“); sonst `EXPERIENCE`.
- `topics.analyze-pending` (alle 10 min, lokal): verarbeitet veröffentlichte Bewertungen, deren `topicsAnalyzer`
  nicht der aktuellen Analyzer-ID entspricht; setzt `topicsAnalyzer`/`topicsAnalyzedAt` auch ohne Fund.
- Anzeige (`GET /landlords/:id/topics`): je Thema eine **neutrale Erwähnungszahl** („In N Bewertungen erwähnt“),
  keine Wertung, keine Rangfolge als „Probleme“, keine Zusammenfassung nach Aussageart. Die Aussageart steht nur
  neben dem einzelnen Ausschnitt und beschreibt den Text („Vorwurf des Verfassers (von WohnCheck nicht geprüft)“).
  Nur Bewertungen, die beim Abruf `PUBLISHED` sind. Fester Hinweis, dass WohnCheck die Aussagen nicht geprüft hat.
- Keine plattformübergreifenden Durchschnittswerte, keine Analyse fremder Inhalte.

## 8. Öffentliche API und bestehende Module

Antworttypen: `backend/src/common/api/api-types.ts`.

| Endpunkt | Modul |
| --- | --- |
| `GET /landlords?limit&offset&kind&state&sort` → `LandlordListResponse` | directory |
| `GET /landlords/:id` → `LandlordDetailResponse` | directory |
| `GET /properties`, `GET /properties/:id` (zusätzlich `parties: PropertyPartyView[]`; nicht öffentlicher Vermieter → `landlord: null`) | directory |
| `GET /search?q&kind&state` → `SearchResponse`, `GET /search/suggest?q` → `SuggestResponse` | directory |
| `GET /directory/stats` → `DirectoryStatsResponse` | directory |
| `GET /landlords/:id/profile` → `LandlordProfileResponse` | companies |
| `GET /landlords/:id/external`, `POST /landlords/:id/reports` | external |
| `GET /landlords/:id/topics` | topics |
| `POST /discovery/requests`, `GET /discovery/requests/:id` | discovery |

Admin-Endpunkte von `companies` (`/admin/companies`, Rolle ADMIN):
`GET landlords?status&q&limit&offset`, `GET landlords/:id` (voll, inkl. Quellen, Kandidaten, Protokoll),
`PATCH landlords/:id` (Felder → `fieldSources = manual`; `status`, `verificationStatus`, `kind`),
`POST landlords/:id/aliases`, `DELETE aliases/:id`, `POST landlords/:id/relations`, `DELETE relations/:id`,
`GET merge-candidates?status&limit&offset`, `POST merge-candidates/:id/merge { survivorId }`,
`POST merge-candidates/:id/distinct`, `POST merge { survivorId, loserId, force? }`,
`POST merges/:id/undo`, `POST landlords/:id/erase { reason, mappingReportId? }`,
`PUT properties/:propertyId/parties` (Rollen setzen).

Anpassungen bestehender Module:

- **directory:** alle Vermieter-Lesezugriffe nur `ACTIVE` und mit explizitem `select` (keine internen Felder);
  `sort`: `name` | `reviews` | `rating` | `recent`; Suche über `LandlordNameSearchService`, Ort/PLZ-Suche für
  Immobilien und Stadtteile wie bisher; `state`-Filter = Mitgliedschaft in `operatingStates`.
- **reviews:** Ziel `LANDLORD` über `PublicLandlordLookupService` auflösen und die ID des Überlebenden speichern;
  nicht-aktive Ziele → 400. `GET /reviews` liefert für nicht-Admins ausschließlich `PUBLISHED` und **ohne**
  `reports`. Pro Nutzer höchstens eine Meldung je Bewertung und höchstens eine nicht abgelehnte Bewertung je Ziel.
  `POST /reviews` und `POST /reviews/:id/report` gedrosselt. Lese-Endpunkte lösen zusammengeführte IDs auf.
- **auth:** Registrierung mit Rolle `LANDLORD` nur für aktive, nicht-private Vermieter (über den Lookup); das Konto
  bleibt `isVerified = false`. (Offen: geprüfter Vermieter-Claim, siehe Abschnitt 11.)
- **admin:** `POST /admin/imports/run` (Tabelle `ImportJob`) ist Altbestand und wird von Discovery nicht benutzt.

Konventionen für neue Controller: DTO-Klassen mit class-validator für `@Query`/`@Body` (globale `ValidationPipe`
mit `whitelist` + `forbidNonWhitelisted` + `transform`; Zahlen mit `@Type(() => Number)`; leere Filterparameter
sendet das Frontend nicht); Fehler als Nest-`HttpException` mit deutscher Meldung; jede Antwort ist ein JSON-Objekt
(nie 204); Listen als `Paginated<T>`; Admin über `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)`;
nur relative Importe.

## 9. Konfiguration

Siehe `backend/.env.example`. Alle neuen Variablen sind optional; die Standardwerte sind sicher für die lokale
Entwicklung (kein automatischer Netzwerk-Import).

## 10. Quellen, Plattformen und rechtliche Einordnung

Geprüft am 15.11.2026, Belege mit Fundstellen in `docs/quellenrecherche-2026-11-15.json`.

| Quelle / Plattform | Einordnung | Was gespeichert wird | Was ausdrücklich nicht geschieht |
| --- | --- | --- | --- |
| Wikidata | CC0, schlüsselfrei; User-Agent mit Kontakt Pflicht | Namen, Aliase, Website, Sitz, Kennungen | – |
| GLEIF | CC0, schlüsselfrei | Rechtsname, Rechtsform, Sitz, Register, LEI, Beziehungen | keine Einzelunternehmer |
| OffeneRegister.de | CC BY 4.0, Stand 2018/19, einmaliger Grundstock | Name, Register, Sitz | keine Personen; nicht ungeprüft öffentlich |
| OpenStreetMap | ODbL: Attribution und Share-Alike | Standorte getrennt zuordenbar (`SourceRecord`, `fieldSources`) | keine Overpass-/Nominatim-Abrufe; nicht öffentlich ohne Freigabe |
| Handelsregister, Unternehmensregister, Bundesanzeiger, EU-Registersuche | Nutzungsordnung untersagt systematischen Abruf | nichts; nur Links zur manuellen Prüfung | kein Abruf |
| Verbandsverzeichnisse (GdW u. a.), Branchenbücher | Datenbankrecht (§ 87a ff. UrhG), keine Lizenz | nichts | keine Übernahme |
| Trustpilot | Anzeige fremder Bewertungen nur mit Partnervertrag | bestätigte Profil-URL | keine Scores, Sterne, Texte, kein Logo |
| Google Maps / Places | EWR-Bedingungen: Bewertungen dürfen in einem Verzeichnis nicht angezeigt werden | Place ID (unbefristet erlaubt) | keine Ratings, Namen, Adressen aus der API |
| Reddit | kommerzielle API-Nutzung nur mit Vertrag; Embeds ebenfalls | URL einer Diskussion + eigenes Etikett | keine Titel, Texte, Nutzernamen, kein Embed |
| golocal, ProvenExpert, ImmoScout24, Yelp | keine erlaubte Fremdnutzung | bestätigte Profil-URL | keine Inhalte |

## 11. Offene Punkte vor dem Produktivbetrieb (juristisch zu prüfen)

1. Rechtsgrundlage und Informationspflichten (Art. 6 Abs. 1 lit. f, Art. 14 DSGVO) für das Verzeichnis, besonders
   für personennahe Firmennamen; Datenschutzerklärung und Impressum sind Platzhalter.
2. ODbL-Share-Alike beim Zusammenführen von OSM-Daten mit anderen Quellen (kollektive vs. abgeleitete Datenbank) –
   bis dahin bleiben OSM-Einträge Kandidaten.
3. Verlinkung einzelner Diskussionen (Haftung ab Kenntnis, Notice-and-Takedown) und Zulässigkeit der
   ImmoScout24-Verlinkung.
4. Themenanalyse: Wortlaut der Hinweise, Umgang mit Tatsachenbehauptungen (§ 824 BGB, UWG).
5. Stellungnahme-/Gegendarstellungsrecht für Unternehmen und geprüfter Vermieter-Claim (derzeit kann sich jeder als
   Vertreter eines aktiven Unternehmens registrieren; das Konto hat keine Sonderrechte).
6. Verträge für erweiterte Integrationen: Trustpilot (Master Partner Agreement + Addendum External),
   Reddit (kommerzielle Vereinbarung), Verbände (Mitgliederdaten).
7. GLEIF-Nutzungsbedingungen als datierten Stand ablegen; OSM-Attribution an allen Anzeigeorten.
8. Aufbewahrungsfristen für `ChangeLog` (Admin-IDs) und Job-Tabellen.
