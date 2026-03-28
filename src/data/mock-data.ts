export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  verified: boolean;
}

export interface Landlord {
  id: string;
  name: string;
  company_type: string;
  city: string;
  website?: string;
  rating_overall: number;
  review_count: number;
  ratings: Record<string, number>;
}

export interface Property {
  id: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  landlord_id: string;
  landlord_name: string;
  rating_overall: number;
  review_count: number;
  ratings: Record<string, number>;
}

export interface Neighborhood {
  id: string;
  district_name: string;
  city: string;
  postal_code: string;
  rating_overall: number;
  review_count: number;
  ratings: Record<string, number>;
}

export interface Review {
  id: string;
  user_id: string;
  user_name: string;
  user_verified: boolean;
  target_type: "landlord" | "property" | "neighborhood";
  target_id: string;
  title: string;
  text: string;
  rating_overall: number;
  category_ratings: Record<string, number>;
  created_at: string;
  status: "published" | "pending" | "reported" | "rejected";
  helpful_count: number;
}

export interface Report {
  id: string;
  review_id: string;
  user_id: string;
  reason: string;
  created_at: string;
  status: "pending" | "resolved" | "dismissed";
}

export const landlords: Landlord[] = [
  {
    id: "l1",
    name: "Vonovia SE",
    company_type: "Wohnungsgesellschaft",
    city: "Berlin",
    website: "https://vonovia.de",
    rating_overall: 2.8,
    review_count: 47,
    ratings: { Kommunikation: 2.5, Fairness: 2.8, Reaktionszeit: 2.2, "Nebenkosten-Transparenz": 3.0, Kautionsrückgabe: 2.6, Instandhaltung: 3.1 },
  },
  {
    id: "l2",
    name: "Müller Hausverwaltung",
    company_type: "Hausverwaltung",
    city: "München",
    rating_overall: 4.2,
    review_count: 23,
    ratings: { Kommunikation: 4.5, Fairness: 4.3, Reaktionszeit: 4.0, "Nebenkosten-Transparenz": 4.1, Kautionsrückgabe: 4.2, Instandhaltung: 4.1 },
  },
  {
    id: "l3",
    name: "Schmidt & Partner Immobilien",
    company_type: "Privatvermieter",
    city: "Hamburg",
    rating_overall: 3.5,
    review_count: 12,
    ratings: { Kommunikation: 3.8, Fairness: 3.5, Reaktionszeit: 3.0, "Nebenkosten-Transparenz": 3.6, Kautionsrückgabe: 3.4, Instandhaltung: 3.7 },
  },
  {
    id: "l4",
    name: "Berliner Wohnungsbau GmbH",
    company_type: "Wohnungsgesellschaft",
    city: "Berlin",
    rating_overall: 3.9,
    review_count: 34,
    ratings: { Kommunikation: 3.7, Fairness: 4.0, Reaktionszeit: 3.5, "Nebenkosten-Transparenz": 4.2, Kautionsrückgabe: 4.0, Instandhaltung: 3.8 },
  },
];

export const properties: Property[] = [
  {
    id: "p1",
    street: "Kastanienallee",
    house_number: "12",
    postal_code: "10435",
    city: "Berlin",
    landlord_id: "l1",
    landlord_name: "Vonovia SE",
    rating_overall: 3.2,
    review_count: 8,
    ratings: { Sauberkeit: 3.0, Lärm: 2.8, Zustand: 3.5, Sicherheit: 3.8, Gemeinschaft: 3.0, Müllsituation: 3.1 },
  },
  {
    id: "p2",
    street: "Leopoldstraße",
    house_number: "45",
    postal_code: "80802",
    city: "München",
    landlord_id: "l2",
    landlord_name: "Müller Hausverwaltung",
    rating_overall: 4.5,
    review_count: 15,
    ratings: { Sauberkeit: 4.8, Lärm: 4.2, Zustand: 4.6, Sicherheit: 4.7, Gemeinschaft: 4.3, Müllsituation: 4.4 },
  },
  {
    id: "p3",
    street: "Schanzenviertel Str.",
    house_number: "7",
    postal_code: "20357",
    city: "Hamburg",
    landlord_id: "l3",
    landlord_name: "Schmidt & Partner Immobilien",
    rating_overall: 3.8,
    review_count: 6,
    ratings: { Sauberkeit: 3.5, Lärm: 3.2, Zustand: 4.0, Sicherheit: 4.2, Gemeinschaft: 3.8, Müllsituation: 3.9 },
  },
  {
    id: "p4",
    street: "Karl-Marx-Allee",
    house_number: "89",
    postal_code: "10243",
    city: "Berlin",
    landlord_id: "l4",
    landlord_name: "Berliner Wohnungsbau GmbH",
    rating_overall: 4.0,
    review_count: 11,
    ratings: { Sauberkeit: 4.1, Lärm: 3.8, Zustand: 4.2, Sicherheit: 4.0, Gemeinschaft: 3.9, Müllsituation: 4.0 },
  },
];

export const neighborhoods: Neighborhood[] = [
  {
    id: "n1",
    district_name: "Prenzlauer Berg",
    city: "Berlin",
    postal_code: "10435",
    rating_overall: 4.1,
    review_count: 29,
    ratings: { Sicherheit: 4.0, Ruhe: 3.5, Einkaufsmöglichkeiten: 4.5, ÖPNV: 4.8, Familienfreundlichkeit: 4.2, Grünflächen: 3.8 },
  },
  {
    id: "n2",
    district_name: "Schwabing",
    city: "München",
    postal_code: "80802",
    rating_overall: 4.4,
    review_count: 19,
    ratings: { Sicherheit: 4.5, Ruhe: 3.8, Einkaufsmöglichkeiten: 4.6, ÖPNV: 4.7, Familienfreundlichkeit: 4.0, Grünflächen: 4.5 },
  },
  {
    id: "n3",
    district_name: "Sternschanze",
    city: "Hamburg",
    postal_code: "20357",
    rating_overall: 3.7,
    review_count: 14,
    ratings: { Sicherheit: 3.2, Ruhe: 2.8, Einkaufsmöglichkeiten: 4.3, ÖPNV: 4.5, Familienfreundlichkeit: 3.0, Grünflächen: 3.6 },
  },
  {
    id: "n4",
    district_name: "Friedrichshain",
    city: "Berlin",
    postal_code: "10243",
    rating_overall: 3.9,
    review_count: 22,
    ratings: { Sicherheit: 3.5, Ruhe: 3.0, Einkaufsmöglichkeiten: 4.2, ÖPNV: 4.6, Familienfreundlichkeit: 3.4, Grünflächen: 4.0 },
  },
];

export const reviews: Review[] = [
  {
    id: "r1", user_id: "u1", user_name: "Anna M.", user_verified: true,
    target_type: "landlord", target_id: "l1",
    title: "Schwierige Kommunikation, aber passabel",
    text: "Die Verwaltung ist oft schwer erreichbar, aber wenn man durchkommt, werden Anliegen meistens bearbeitet. Die Nebenkostenabrechnung kam pünktlich, aber mit Fehlern.",
    rating_overall: 2.5, category_ratings: { Kommunikation: 2.0, Fairness: 2.5, Reaktionszeit: 2.0, "Nebenkosten-Transparenz": 3.0, Kautionsrückgabe: 2.5, Instandhaltung: 3.0 },
    created_at: "2024-11-15", status: "published", helpful_count: 12,
  },
  {
    id: "r2", user_id: "u2", user_name: "Thomas K.", user_verified: true,
    target_type: "landlord", target_id: "l2",
    title: "Sehr zufrieden – top Hausverwaltung!",
    text: "Herr Müller kümmert sich wirklich um seine Mieter. Reparaturen werden schnell erledigt und die Kommunikation ist immer freundlich und transparent.",
    rating_overall: 4.5, category_ratings: { Kommunikation: 4.8, Fairness: 4.5, Reaktionszeit: 4.2, "Nebenkosten-Transparenz": 4.3, Kautionsrückgabe: 4.5, Instandhaltung: 4.5 },
    created_at: "2024-12-03", status: "published", helpful_count: 8,
  },
  {
    id: "r3", user_id: "u3", user_name: "Lisa W.", user_verified: false,
    target_type: "property", target_id: "p1",
    title: "Altbau mit Charme, aber laut",
    text: "Die Wohnung selbst ist schön, typischer Berliner Altbau. Allerdings ist es durch die Straßenlage oft laut und die Hausverwaltung reagiert langsam auf Mängel.",
    rating_overall: 3.0, category_ratings: { Sauberkeit: 3.0, Lärm: 2.0, Zustand: 3.5, Sicherheit: 3.5, Gemeinschaft: 3.0, Müllsituation: 3.0 },
    created_at: "2025-01-10", status: "published", helpful_count: 5,
  },
  {
    id: "r4", user_id: "u4", user_name: "Markus B.", user_verified: true,
    target_type: "property", target_id: "p2",
    title: "Traumwohnung in Bestlage",
    text: "Alles top gepflegt, super Nachbarn, ruhig trotz zentraler Lage. Die Hausverwaltung kümmert sich vorbildlich um das Gebäude.",
    rating_overall: 4.8, category_ratings: { Sauberkeit: 5.0, Lärm: 4.5, Zustand: 4.8, Sicherheit: 4.8, Gemeinschaft: 4.5, Müllsituation: 4.5 },
    created_at: "2025-02-01", status: "published", helpful_count: 15,
  },
  {
    id: "r5", user_id: "u5", user_name: "Sarah L.", user_verified: true,
    target_type: "neighborhood", target_id: "n1",
    title: "Familienfreundlich, aber teuer",
    text: "Prenzlauer Berg ist wunderbar zum Leben – viele Parks, Cafés und gute Anbindung. Allerdings sind die Mieten mittlerweile sehr hoch.",
    rating_overall: 4.0, category_ratings: { Sicherheit: 4.0, Ruhe: 3.5, Einkaufsmöglichkeiten: 4.5, ÖPNV: 4.8, Familienfreundlichkeit: 4.5, Grünflächen: 3.8 },
    created_at: "2025-01-20", status: "published", helpful_count: 20,
  },
  {
    id: "r6", user_id: "u1", user_name: "Anna M.", user_verified: true,
    target_type: "neighborhood", target_id: "n3",
    title: "Lebendig, aber nicht für jeden",
    text: "Die Sternschanze ist bunt und lebendig, aber es kann nachts sehr laut werden. Nicht ideal für Familien mit kleinen Kindern, aber perfekt für junge Leute.",
    rating_overall: 3.5, category_ratings: { Sicherheit: 3.0, Ruhe: 2.5, Einkaufsmöglichkeiten: 4.0, ÖPNV: 4.5, Familienfreundlichkeit: 2.8, Grünflächen: 3.5 },
    created_at: "2025-02-15", status: "published", helpful_count: 7,
  },
  {
    id: "r7", user_id: "u6", user_name: "Klaus R.", user_verified: true,
    target_type: "landlord", target_id: "l1",
    title: "Kaution nach 8 Monaten zurück",
    text: "Musste meine Kaution regelrecht einklagen. Erst nach anwaltlichem Schreiben wurde sie nach 8 Monaten zurückgezahlt. Absolut inakzeptabel.",
    rating_overall: 1.5, category_ratings: { Kommunikation: 1.5, Fairness: 1.0, Reaktionszeit: 1.0, "Nebenkosten-Transparenz": 2.5, Kautionsrückgabe: 1.0, Instandhaltung: 2.0 },
    created_at: "2024-10-05", status: "published", helpful_count: 31,
  },
  {
    id: "r8", user_id: "u7", user_name: "Maria S.", user_verified: false,
    target_type: "landlord", target_id: "l4",
    title: "Solide Verwaltung, nichts Besonderes",
    text: "Die Berliner Wohnungsbau macht ihren Job. Nicht herausragend, aber zuverlässig. Reparaturen dauern manchmal etwas, aber werden erledigt.",
    rating_overall: 3.8, category_ratings: { Kommunikation: 3.5, Fairness: 4.0, Reaktionszeit: 3.2, "Nebenkosten-Transparenz": 4.0, Kautionsrückgabe: 4.0, Instandhaltung: 3.8 },
    created_at: "2025-03-01", status: "published", helpful_count: 4,
  },
  {
    id: "r9", user_id: "u2", user_name: "Thomas K.", user_verified: true,
    target_type: "property", target_id: "p4",
    title: "Gute Substanz, lebhaftes Viertel",
    text: "Das Gebäude ist gut instand gehalten. Die Nachbarn sind freundlich und es herrscht ein angenehmes Miteinander im Haus.",
    rating_overall: 4.0, category_ratings: { Sauberkeit: 4.0, Lärm: 3.5, Zustand: 4.2, Sicherheit: 4.0, Gemeinschaft: 4.2, Müllsituation: 4.0 },
    created_at: "2025-02-20", status: "published", helpful_count: 6,
  },
  {
    id: "r10", user_id: "u8", user_name: "Peter H.", user_verified: true,
    target_type: "landlord", target_id: "l1",
    title: "Spam-Bewertung – nicht ernst nehmen",
    text: "Dieser Vermieter ist der beste! 10/10 würde wieder mieten!!!",
    rating_overall: 5.0, category_ratings: { Kommunikation: 5.0, Fairness: 5.0, Reaktionszeit: 5.0, "Nebenkosten-Transparenz": 5.0, Kautionsrückgabe: 5.0, Instandhaltung: 5.0 },
    created_at: "2025-03-10", status: "reported", helpful_count: 0,
  },
];

export const reports: Report[] = [
  {
    id: "rep1", review_id: "r10", user_id: "u3",
    reason: "Verdacht auf Fake-Bewertung – unrealistisch positive Wertung",
    created_at: "2025-03-11", status: "pending",
  },
];

export type SearchResult = {
  type: "landlord" | "property" | "neighborhood";
  id: string;
  title: string;
  subtitle: string;
  rating: number;
  reviewCount: number;
  city: string;
};

export function searchAll(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  landlords.forEach((l) => {
    if (l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q))
      results.push({ type: "landlord", id: l.id, title: l.name, subtitle: l.company_type, rating: l.rating_overall, reviewCount: l.review_count, city: l.city });
  });

  properties.forEach((p) => {
    const addr = `${p.street} ${p.house_number}`;
    if (addr.toLowerCase().includes(q) || p.postal_code.includes(q) || p.city.toLowerCase().includes(q))
      results.push({ type: "property", id: p.id, title: addr, subtitle: `${p.postal_code} ${p.city}`, rating: p.rating_overall, reviewCount: p.review_count, city: p.city });
  });

  neighborhoods.forEach((n) => {
    if (n.district_name.toLowerCase().includes(q) || n.city.toLowerCase().includes(q) || n.postal_code.includes(q))
      results.push({ type: "neighborhood", id: n.id, title: n.district_name, subtitle: n.city, rating: n.rating_overall, reviewCount: n.review_count, city: n.city });
  });

  return results;
}

export function getReviewsForTarget(type: string, id: string): Review[] {
  return reviews.filter((r) => r.target_type === type && r.target_id === id && r.status === "published");
}
