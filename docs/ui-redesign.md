# WohnCheck – Bewertungsportal

## Überarbeitete Richtung

Die erste, zu stark reduzierte Fassung wurde ersetzt. WohnCheck präsentiert jetzt Immobilien, Wohngegenden und Vermieter gleichwertig. Eine eigenständige blaue Wortmarke, dunkelblaue Typografie, ein strukturierter Einstieg und ein dunkler Footer geben der Seite einen zusammenhängenden Auftritt.

- Einstieg mit zentraler Suche und drei direkt erreichbaren Bewertungsbereichen.
- Verzeichnis mit umschaltbaren Bereichen und echten Objekteinträgen.
- Aktuelle veröffentlichte Erfahrungen mit Bewertung, Datum und direktem Link zum jeweiligen Bericht.
- Sichtbarer Zugang zum Schreiben einer Bewertung.
- Suchfilter über URL-Parameter `type`: bleibt beim Suchen und in der Browserhistorie erhalten.
- Deutlichere Profilköpfe, Bewertungszusammenfassung und getrennte Unternehmens-/Umgebungsinformationen.
- Mobile Darstellung mit einspaltigen Einträgen und lesbarer Navigation.

Die vorhandenen Backend-Endpunkte werden verwendet. Keine neuen Dependencies. Verzeichnis und Rezensionen stammen aus der lokalen API; bestehende Demo-/Seed-Inhalte wurden nicht geändert oder moderiert. Externe Plattformbewertungen und Alias-Auflösung sind weiterhin nicht implementiert und werden nicht vorgetäuscht.

## Prüfung

Produktionsbuild und TypeScript erfolgreich. Geänderte React-Komponenten bestehen ESLint ohne Fehler oder Warnungen. Screenshots unter `artifacts/redesign` zeigen Startseite, Suche, Profile, Anmeldung und Registrierung bei 390, 768 und 1440 px ohne horizontalen Überlauf.

Browserprüfungen unter `e2e/redesign.spec.ts` decken zusätzlich 320 px, vergrößerte Schrift, alle drei Kategorien, Suchbereich-Erhaltung, Autocomplete, Tastaturbedienung, Lade-/Fehler-/Leerzustände, Profilnavigation, Karten-Zustimmung und eine abgefangene Test-Bewertungsabgabe ab. Es werden keine Testbewertungen gegen die echte API geschrieben.

Ausführen bei laufendem Frontend (8080) und Backend (3001):

```
npm.cmd run build
npx.cmd tsc --noEmit -p tsconfig.app.json
npm.cmd test
npx.cmd playwright test --config playwright.redesign.config.ts
node verify-redesign.mjs
```

Der globale Repository-Lint enthält weiterhin bereits vorhandene Backend- und generierte Typfehler. Bestehende Rechtstexte sind Platzhalter. Kein vollständiges WCAG-Zertifizierungsaudit.
