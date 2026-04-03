import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SearchBar } from "@/components/SearchBar";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StarRating } from "@/components/StarRating";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  landlords as fallbackLandlords,
  neighborhoods as fallbackNeighborhoods,
  properties as fallbackProperties,
  reviews as fallbackReviews,
} from "@/data/mock-data";
import { adaptLandlord } from "@/features/directory/directory-adapter";
import { fetchLandlords, fetchNeighborhoods, fetchProperties } from "@/features/directory/directory-api";
import { fetchReviews } from "@/features/reviews/review-api";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { Building2, Home, MapPin, Users, Shield, TrendingUp, PenSquare } from "lucide-react";

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
  const properties =
    apiProperties?.map((property) => ({
      id: property.id,
      street: property.street,
      house_number: property.houseNumber,
      postal_code: property.postalCode,
      city: property.city,
      landlord_id: property.landlordId,
      landlord_name: property.landlord?.name ?? "",
      rating_overall: 0,
      review_count: 0,
      ratings: {},
    })) ?? fallbackProperties;
  const neighborhoods =
    apiNeighborhoods?.map((neighborhood) => ({
      id: neighborhood.id,
      district_name: neighborhood.districtName,
      city: neighborhood.city,
      postal_code: neighborhood.postalCode,
      rating_overall: 0,
      review_count: 0,
      ratings: {},
    })) ?? fallbackNeighborhoods;
  const recentReviews =
    latestLandlordReviews?.map(adaptApiReview).slice(0, 3) ??
    fallbackReviews.filter((review) => review.status === "published").slice(0, 3);

  const stats = [
    { icon: Building2, label: "Vermieter bewertet", value: landlords.length.toString() },
    { icon: Home, label: "Gebäude bewertet", value: properties.length.toString() },
    { icon: MapPin, label: "Stadtteile bewertet", value: neighborhoods.length.toString() },
    { icon: Users, label: "Bewertungen gesamt", value: recentReviews.length.toString() },
  ];

  return (
    <div className="min-h-screen">
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
              Bewerte Vermieter, Gebäude und Nachbarschaften - oder informiere dich vor dem Einzug über ehrliche
              Mietererfahrungen.
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
                    <ScoreBadge score={landlord.rating_overall} size="sm" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{landlord.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {landlord.company_type} · {landlord.city}
                      </p>
                    </div>
                  </div>
                  <StarRating rating={landlord.rating_overall} size={14} />
                  <p className="text-xs text-muted-foreground mt-2">{landlord.review_count} Bewertungen</p>
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
