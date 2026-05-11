import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SearchBar } from "@/components/SearchBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { LandlordLogo } from "@/components/LandlordLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  landlords as fallbackLandlords,
  neighborhoods as fallbackNeighborhoods,
  properties as fallbackProperties,
  reviews as fallbackReviews,
} from "@/data/mock-data";
import { adaptLandlord, adaptNeighborhood, adaptProperty } from "@/features/directory/directory-adapter";
import { fetchLandlords, fetchNeighborhoods, fetchProperties } from "@/features/directory/directory-api";
import { fetchReviews } from "@/features/reviews/review-api";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import {
  BadgeCheck,
  Building2,
  Home,
  Layers3,
  MapPinned,
  MapPin,
  MessageSquareText,
  PenSquare,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

const heroMapPlaces = [
  {
    name: "Kastanienallee 12",
    area: "Prenzlauer Berg",
    score: 83,
    reviews: 8,
    rentTrend: "+6%",
    x: "20%",
    y: "34%",
    tone: "bg-primary",
    ring: "border-primary/40",
    signals: [92, 88, 76],
  },
  {
    name: "Karl-Marx-Allee 89",
    area: "Friedrichshain",
    score: 74,
    reviews: 11,
    rentTrend: "+3%",
    x: "67%",
    y: "29%",
    tone: "bg-warning",
    ring: "border-warning/45",
    signals: [89, 83, 68],
  },
  {
    name: "Sonnenstraße 4",
    area: "Dortmund Eving",
    score: 58,
    reviews: 5,
    rentTrend: "+1%",
    x: "49%",
    y: "66%",
    tone: "bg-destructive",
    ring: "border-destructive/35",
    signals: [71, 58, 42],
  },
];

const heroPreviewReviews = [
  { name: "Vonovia SE", city: "Berlin", rating: 2.7, text: "Nebenkosten und Reaktionszeit im Blick behalten." },
  { name: "DOGEWO21", city: "Dortmund", rating: 3.2, text: "Solide Struktur, gemischtes Bild im Bestand." },
  { name: "VIVAWEST", city: "Gelsenkirchen", rating: 3.1, text: "Beratung positiv, Kommunikation teils wechselhaft." },
];

const heroScoreSignals = [
  { label: "ÖPNV", value: 92 },
  { label: "Infrastruktur", value: 88 },
  { label: "Service", value: 64 },
];

function HeroProductPreview() {
  const [selectedPlaceName, setSelectedPlaceName] = useState(heroMapPlaces[0].name);
  const [activeFilter, setActiveFilter] = useState<"all" | "high" | "warning">("all");
  const selectedPlace =
    heroMapPlaces.find((place) => place.name === selectedPlaceName) ?? heroMapPlaces[0];
  const visiblePlaces = heroMapPlaces.filter((place) => {
    if (activeFilter === "high") return place.score >= 80;
    if (activeFilter === "warning") return place.score < 65;
    return true;
  });

  const handleFilterChange = (filter: "all" | "high" | "warning") => {
    setActiveFilter(filter);

    const nextPlace = heroMapPlaces.find((place) => {
      if (filter === "high") return place.score >= 80;
      if (filter === "warning") return place.score < 65;
      return true;
    });

    if (nextPlace) {
      setSelectedPlaceName(nextPlace.name);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="relative mx-auto w-full max-w-xl"
      aria-label="WohnCheck Produktvorschau"
    >
      <div className="overflow-hidden rounded-lg border bg-card shadow-xl shadow-primary/10">
        <div className="flex h-11 items-center justify-between border-b bg-muted/50 px-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-xs text-muted-foreground">
            <MapPin size={13} />
            Berlin, Dortmund, NRW
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
          <div className="relative min-h-[420px] overflow-hidden border-b bg-[hsl(var(--secondary))] md:border-b-0 md:border-r">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage:
                  "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="absolute inset-0 opacity-80">
              <div className="absolute left-[8%] top-[22%] h-28 w-[70%] rounded-full border-2 border-primary/25" />
              <div className="absolute bottom-[22%] right-[4%] h-32 w-[78%] rounded-full border-2 border-warning/30" />
              <div className="absolute left-[24%] top-[52%] h-1 w-[58%] rotate-[-18deg] rounded-full bg-primary/30" />
              <div className="absolute left-[12%] top-[71%] h-1 w-[64%] rotate-[12deg] rounded-full bg-warning/25" />
            </div>

            <div className="absolute left-3 top-3 right-3 z-10 flex flex-wrap items-center gap-2">
              {[
                { id: "all" as const, label: "Alle" },
                { id: "high" as const, label: "Hoher Score" },
                { id: "warning" as const, label: "Warnsignale" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => handleFilterChange(filter.id)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm transition ${
                    activeFilter === filter.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background/95 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="absolute bottom-4 left-4 z-10 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
              <div className="mb-2 text-xs font-semibold text-foreground">Kartenlegende</div>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> empfehlenswert</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warning" /> genauer prüfen</div>
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Warnsignale</div>
              </div>
            </div>

            {heroMapPlaces.map((place) => {
              const isVisible = visiblePlaces.some((visiblePlace) => visiblePlace.name === place.name);
              const isSelected = selectedPlace.name === place.name;

              return (
              <motion.button
                key={place.name}
                type="button"
                className={`absolute z-20 text-left transition ${isVisible ? "opacity-100" : "pointer-events-none opacity-25"}`}
                style={{ left: place.x, top: place.y }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelectedPlaceName(place.name)}
                aria-label={`${place.name} auswählen, Score ${place.score}`}
              >
                <div className={`absolute -inset-2 rounded-full border-2 ${place.ring} ${isSelected ? "animate-pulse" : ""}`} />
                <div className={`relative flex h-12 w-12 items-center justify-center rounded-full ${place.tone} text-sm font-bold text-white shadow-lg`}>
                  {place.score}
                </div>
                <div className={`mx-auto h-3 w-3 -translate-y-1 rotate-45 ${place.tone}`} />
                <div className="absolute left-10 top-1 hidden min-w-32 rounded-md border bg-background/95 px-2 py-1 text-[11px] shadow-md sm:block">
                  <div className="font-semibold text-foreground">{place.name}</div>
                  <div className="text-muted-foreground">{place.reviews} Bewertungen</div>
                </div>
              </motion.button>
              );
            })}
          </div>

          <div className="space-y-3 p-4">
            <motion.div
              key={selectedPlace.name}
              className="rounded-lg border bg-background p-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <MapPinned size={16} className="shrink-0 text-primary" />
                    <span className="truncate">{selectedPlace.name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{selectedPlace.area}</div>
                </div>
                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {selectedPlace.score} / 100
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-muted px-2 py-1.5">
                  <div className="font-semibold text-foreground">{selectedPlace.reviews}</div>
                  <div className="text-muted-foreground">Bewertungen</div>
                </div>
                <div className="rounded-md bg-muted px-2 py-1.5">
                  <div className="font-semibold text-foreground">{selectedPlace.rentTrend}</div>
                  <div className="text-muted-foreground">Miettrend</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {heroScoreSignals.map((signal, index) => (
                  <div key={signal.label} className="min-w-0">
                    <div className="truncate text-[11px] text-muted-foreground">{signal.label}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ width: `${selectedPlace.signals[index] ?? signal.value}%` }}
                        transition={{ duration: 0.35 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="rounded-lg border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquareText size={16} className="text-primary" />
                    Aktuelle Bewertungen
                  </div>
                  <p className="text-xs text-muted-foreground">Vermieter, Gebäude, Nachbarschaft</p>
                </div>
                <Sparkles size={16} className="text-warning" />
              </div>
              <div className="space-y-2">
                {heroPreviewReviews.map((review, index) => (
                  <motion.div
                    key={review.name}
                    className="rounded-md border bg-card p-3"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + index * 0.15 }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{review.name}</div>
                        <div className="text-xs text-muted-foreground">{review.city}</div>
                      </div>
                      <div className="shrink-0 rounded-md bg-secondary px-2 py-1 text-sm font-bold">{review.rating.toFixed(1)}</div>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{review.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-background p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Layers3 size={15} className="text-primary" />
                  Score-Mix
                </div>
                <div className="space-y-2">
                  {["Reviews", "Lage", "Quellen"].map((label, index) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                        <span>{label}</span>
                        <span>{[72, 88, 76][index]}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full bg-warning"
                          initial={{ width: 0 }}
                          animate={{ width: `${[72, 88, 76][index]}%` }}
                          transition={{ duration: 1, delay: 0.55 + index * 0.12 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-primary p-3 text-primary-foreground">
                <div className="mb-3 flex items-center justify-between">
                  <BadgeCheck size={18} />
                  <span className="text-xs opacity-90">Live</span>
                </div>
                <div className="text-2xl font-extrabold">4.218</div>
                <div className="text-xs opacity-90">Signale aus Reviews und Quellen</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const { data: apiLandlords } = useQuery({
    queryKey: ["landlords"],
    queryFn: fetchLandlords,
  });
  const { data: apiProperties } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: apiNeighborhoods } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: fetchNeighborhoods,
  });
  const { data: latestLandlordReviews } = useQuery({
    queryKey: ["home", "reviews", "landlord"],
    queryFn: () => fetchReviews("landlord", "l1"),
    retry: false,
  });

  const landlords = apiLandlords?.map(adaptLandlord) ?? fallbackLandlords;
  const properties = apiProperties?.map(adaptProperty) ?? fallbackProperties;
  const neighborhoods = apiNeighborhoods?.map(adaptNeighborhood) ?? fallbackNeighborhoods;
  const recentReviews =
    latestLandlordReviews
      ?.map(adaptApiReview)
      .filter((review) => review.verification_level !== "public-source-summary")
      .slice(0, 3) ??
    fallbackReviews.filter((review) => review.status === "published").slice(0, 3);

  const stats = [
    { icon: Building2, label: "Vermieter bewertet", value: landlords.length.toString() },
    { icon: Home, label: "Gebäude bewertet", value: properties.length.toString() },
    { icon: MapPin, label: "Stadtteile bewertet", value: neighborhoods.length.toString() },
    { icon: Users, label: "Bewertungen gesamt", value: recentReviews.length.toString() },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <section className="relative overflow-hidden border-b bg-primary/[0.03]">
        <div className="container grid items-center gap-12 py-14 md:grid-cols-[0.9fr_1.1fr] md:py-20 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <Shield size={14} /> Echte Erfahrungsberichte von Mietern
            </div>
            <h1 className="mb-5 text-balance text-4xl font-extrabold tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Wissen, wie du <span className="text-primary">wirklich</span> wohnst
            </h1>
            <p className="mb-8 max-w-xl text-balance text-lg text-muted-foreground">
              Bewerte Vermieter, Gebäude und Nachbarschaften oder informiere dich vor dem Einzug über ehrliche
              Mietererfahrungen.
            </p>
            <div className="mb-5">
              <SearchBar large />
            </div>
            <p className="text-sm text-muted-foreground">
              z.B. <Link to="/suche?q=Berlin" className="text-primary hover:underline">Berlin</Link>,{" "}
              <Link to="/suche?q=Vonovia" className="text-primary hover:underline">Vonovia</Link>,{" "}
              <Link to="/suche?q=80802" className="text-primary hover:underline">80802</Link>
            </p>
          </motion.div>

          <HeroProductPreview />
        </div>
      </section>

      <section className="container pt-8 md:pt-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Card className="p-4 text-center">
                <stat.icon size={24} className="mx-auto text-primary mb-2" />
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-2xl font-bold text-center text-foreground mb-10">So funktioniert WohnCheck</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: MapPin, title: "Suchen", desc: "Finde Vermieter, Gebäude oder Stadtteile über die Suche." },
            {
              icon: TrendingUp,
              title: "Vergleichen",
              desc: "Sieh Gesamt-Scores, Unterkategorien und echte Erfahrungsberichte.",
            },
            { icon: PenSquare, title: "Bewerten", desc: "Teile deine eigene Wohnerfahrung und hilf anderen Mietern." },
          ].map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.15 }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <step.icon size={24} className="text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/50 border-y">
        <div className="container py-16">
          <h2 className="text-2xl font-bold text-foreground mb-8">Vermieter im Verzeichnis</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {landlords.slice(0, 4).map((landlord) => (
              <Link to={`/vermieter/${landlord.id}`} key={landlord.id}>
                <Card className="p-5 hover:shadow-md transition-shadow h-full">
                  <div className="flex items-start gap-3 mb-3">
                    <LandlordLogo name={landlord.name} logoUrl={landlord.logo_url} size="sm" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{landlord.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {landlord.company_type} · {landlord.city}
                      </p>
                    </div>
                  </div>
                  {landlord.review_count > 0 ? (
                    <>
                      <StarRating rating={landlord.rating_overall} size={14} />
                      <p className="text-xs text-muted-foreground mt-2">{landlord.review_count} Bewertungen</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">Noch keine WohnCheck-Bewertungen</p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-2xl font-bold text-foreground mb-8">Aktuelle Bewertungen</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {recentReviews.map((review) => (
            <Card key={review.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <StarRating rating={review.rating_overall} size={14} />
                <span className="text-xs text-muted-foreground">{review.created_at}</span>
              </div>
              <h4 className="font-semibold text-foreground mb-1 text-sm">{review.title}</h4>
              <p className="text-sm text-muted-foreground line-clamp-3">{review.text}</p>
              <div className="mt-3 text-xs text-muted-foreground">
                {review.target_type === "landlord" && "Vermieter"}
                {review.target_type === "property" && "Gebäude"}
                {review.target_type === "neighborhood" && "Nachbarschaft"}
                {" · "}
                {review.user_name}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-16">
        <Card className="p-10 text-center bg-primary/5 border-primary/20">
          <h2 className="text-2xl font-bold text-foreground mb-3">Deine Erfahrung zählt!</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Hilf anderen Wohnungssuchenden und teile deine Erfahrungen mit Vermietern, Gebäuden und deiner
            Nachbarschaft.
          </p>
          <Button size="lg" asChild>
            <Link to="/bewertung/neu" className="gap-2">
              <PenSquare size={18} /> Jetzt bewerten
            </Link>
          </Button>
        </Card>
      </section>
    </div>
  );
}
