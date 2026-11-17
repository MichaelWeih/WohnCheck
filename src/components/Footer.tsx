import { Link } from "react-router-dom";
export function Footer() {
  return <footer className="site-footer"><div className="container footer-inner"><div><Link to="/" className="footer-brand">WohnCheck</Link><p>Wissen, wie es sich wirklich wohnt.</p></div><nav aria-label="Verzeichnis"><Link to="/suche?type=property">Immobilien</Link><Link to="/suche?type=neighborhood">Wohngegenden</Link><Link to="/suche?type=landlord">Vermieter</Link></nav><nav aria-label="Rechtliche Informationen"><Link to="/impressum">Impressum</Link><Link to="/datenschutz">Datenschutz</Link></nav></div></footer>;
}
