export default function DatenschutzPage() {
  return (
    <div className="container page-shell max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">Datenschutzerklärung</h1>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <h2 className="text-lg font-semibold text-foreground">1. Verantwortlicher</h2>
        <p>Verantwortlich für die Datenverarbeitung ist die WohnCheck GmbH (Platzhalter), Musterstraße 1, 10115 Berlin.</p>

        <h2 className="text-lg font-semibold text-foreground">2. Erhebung und Verarbeitung personenbezogener Daten</h2>
        <p>Wir erheben personenbezogene Daten (z.B. Name, E-Mail-Adresse) nur, wenn Sie uns diese im Rahmen einer Registrierung oder Bewertung freiwillig mitteilen.</p>

        <h2 className="text-lg font-semibold text-foreground">3. Nutzung der Daten</h2>
        <p>Die erhobenen Daten werden ausschließlich zur Erbringung unseres Dienstes verwendet, insbesondere zur Anzeige von Bewertungen und zur Kontoverwaltung.</p>

        <h2 className="text-lg font-semibold text-foreground">4. Ihre Rechte</h2>
        <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten. Kontaktieren Sie uns hierzu unter datenschutz@wohncheck.de.</p>

        <h2 className="text-lg font-semibold text-foreground">5. Externe Karteninhalte</h2>
        <p>Für die Kartenansicht laden wir Kartenmaterial des Dienstes OpenFreeMap (Kartendaten © OpenStreetMap-Mitwirkende). Diese externen Inhalte werden erst geladen, wenn Sie dazu ausdrücklich einwilligen; dabei wird Ihre IP-Adresse an den Kartendienst übertragen. Ohne Einwilligung bleibt die Karte deaktiviert, die Ortsliste ist weiterhin nutzbar.</p>
        <p>Für die Adresssuche und die Orte in der Umgebung fragt unser Server den Dienst Geoapify ab. Dabei werden der eingegebene Adresstext beziehungsweise die Koordinaten der geprüften Adresse übermittelt, nicht jedoch Ihre IP-Adresse. Gesuchte Adressen speichern wir nicht dauerhaft; Umgebungsdaten werden bis zu sieben Tage zwischengespeichert.</p>

        <p className="border-t pt-4 text-xs">
          Dies ist ein Platzhalter-Datenschutztext für Demo-Zwecke. In der Produktivversion muss hier eine vollständige DSGVO-konforme Datenschutzerklärung stehen.
        </p>
      </div>
    </div>
  );
}
