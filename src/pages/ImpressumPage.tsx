export default function ImpressumPage() {
  return (
    <div className="container py-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">Impressum</h1>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p><strong className="text-foreground">WohnCheck GmbH (Platzhalter)</strong></p>
        <p>Musterstraße 1<br />10115 Berlin<br />Deutschland</p>
        <p>E-Mail: info@wohncheck.de<br />Telefon: +49 30 123456789</p>
        <p>Geschäftsführer: Max Mustermann</p>
        <p>Registergericht: Amtsgericht Berlin-Charlottenburg<br />HRB 123456</p>
        <p>USt-IdNr.: DE123456789</p>
        <p className="border-t pt-4 text-xs">
          Dies ist ein Platzhalter-Impressum für Demo-Zwecke. In der Produktivversion müssen hier die tatsächlichen Angaben gemäß § 5 TMG stehen.
        </p>
      </div>
    </div>
  );
}
