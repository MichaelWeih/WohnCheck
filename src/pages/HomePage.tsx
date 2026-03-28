import { SearchBar } from "@/components/SearchBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { landlords, properties, neighborhoods, reviews } from "@/data/mock-data";
import { Building2, Home, MapPin, Users, Shield, TrendingUp, PenSquare } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { icon: Building2, label: "Vermieter bewertet", value: landlords.length.toString() },
  { icon: Home, label: "Gebäude bewertet", value: properties.length.toString() },
  { icon: MapPin, label: "Stadtteile bewertet", value: neighborhoods.length.toString() },
  { icon: Users, label: "Bewertungen gesamt", value: reviews.filter((r) => r.status === "published").length.toString() },
];

const recentReviews = reviews.filter((r) => r.status === "published").slice(0, 3);

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary/[0.03] border-b">
        <div className="container py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <Shield size={14} /> Echte Erfahrungsberichte von Mietern
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight mb-5 text-balance">
              Wissen, wie du <span className="text-primary">wirklich</span> wohnst
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto text-balance">
              Bewerte Vermieter, Gebäude und Nachbarschaften – oder informiere dich vor dem Einzug über ehrliche Mietererfahrungen.
            </p>
            <div className="flex justify-center mb-6">
              <SearchBar large />
            </div>
            <p className="text-sm text-muted-foreground">
              z.B. <Link to="/suche?q=Berlin" className="text-primary hover:underline">Berlin</Link>,{" "}
              <Link to="/suche?q=Vonovia" className="text-primary hover:underline">Vonovia</Link>,{" "}
              <Link to="/suche?q=80802" className="text-primary hover:underline">80802</Link>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="container -mt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              <Card className="p-4 text-center">
                <s.icon size={24} className="mx-auto text-primary mb-2" />
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16">
        <h2 className="text-2xl font-bold text-center text-foreground mb-10">So funktioniert WohnCheck</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: MapPin, title: "Suchen", desc: "Finde Vermieter, Gebäude oder Stadtteile über die Suche." },
            { icon: TrendingUp, title: "Vergleichen", desc: "Sieh Gesamt-Scores, Unterkategorien und echte Erfahrungsberichte." },
            { icon: PenSquare, title: "Bewerten", desc: "Teile deine eigene Wohnerfahrung und hilf anderen Mietern." },
          ].map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.15 }}
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

      {/* Top rated */}
      <section className="bg-secondary/50 border-y">
        <div className="container py-16">
          <h2 className="text-2xl font-bold text-foreground mb-8">Bestbewertete Vermieter</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {landlords
              .sort((a, b) => b.rating_overall - a.rating_overall)
              .map((l) => (
                <Link to={`/vermieter/${l.id}`} key={l.id}>
                  <Card className="p-5 hover:shadow-md transition-shadow h-full">
                    <div className="flex items-start gap-3 mb-3">
                      <ScoreBadge score={l.rating_overall} size="sm" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{l.name}</h3>
                        <p className="text-xs text-muted-foreground">{l.company_type} · {l.city}</p>
                      </div>
                    </div>
                    <StarRating rating={l.rating_overall} size={14} />
                    <p className="text-xs text-muted-foreground mt-2">{l.review_count} Bewertungen</p>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Recent reviews */}
      <section className="container py-16">
        <h2 className="text-2xl font-bold text-foreground mb-8">Aktuelle Bewertungen</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {recentReviews.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <StarRating rating={r.rating_overall} size={14} />
                <span className="text-xs text-muted-foreground">{r.created_at}</span>
              </div>
              <h4 className="font-semibold text-foreground mb-1 text-sm">{r.title}</h4>
              <p className="text-sm text-muted-foreground line-clamp-3">{r.text}</p>
              <div className="mt-3 text-xs text-muted-foreground">
                {r.target_type === "landlord" && "Vermieter"}
                {r.target_type === "property" && "Gebäude"}
                {r.target_type === "neighborhood" && "Nachbarschaft"}
                {" · "}{r.user_name}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-16">
        <Card className="p-10 text-center bg-primary/5 border-primary/20">
          <h2 className="text-2xl font-bold text-foreground mb-3">Deine Erfahrung zählt!</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Hilf anderen Wohnungssuchenden und teile deine Erfahrungen mit Vermietern, Gebäuden und deiner Nachbarschaft.
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
