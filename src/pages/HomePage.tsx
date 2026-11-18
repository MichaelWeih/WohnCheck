import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  House,
  MapPin,
  MessageSquareText,
  PenLine,
} from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { DirectoryRow } from "@/components/DirectoryRow";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { searchDirectory } from "@/features/directory/directory-api";
import { adaptSearchResults } from "@/features/directory/directory-adapter";
import { fetchLatestReviews } from "@/features/reviews/review-api";
import { adaptApiReview } from "@/features/reviews/review-adapter";
import { resultRoutes } from "@/features/directory/routes";

const categories = [
  {
    key: "property",
    label: "Immobilien",
    icon: House,
    description: "Zustand, Lärm und das Leben im Haus.",
  },
  {
    key: "neighborhood",
    label: "Wohngegenden",
    icon: MapPin,
    description: "Wie sich der Alltag im Viertel anfühlt.",
  },
  {
    key: "landlord",
    label: "Vermieter",
    icon: Building2,
    description: "Kommunikation, Reparaturen und Fairness.",
  },
] as const;

export default function HomePage() {
  const [category, setCategory] =
    useState<(typeof categories)[number]["key"]>("property");
  const directory = useQuery({
    queryKey: ["directory-search", ""],
    queryFn: () => searchDirectory(""),
    staleTime: 60_000,
  });
  const latest = useQuery({
    queryKey: ["reviews", "latest", 3],
    queryFn: () => fetchLatestReviews(3),
    staleTime: 60_000,
  });
  const allEntries = directory.data ? adaptSearchResults(directory.data) : [];
  const entries = allEntries
    .filter((item) => item.type === category)
    .slice(0, 3);
  const reviews =
    latest.data
      ?.filter((review) => review.verificationLevel !== "public-source-summary")
      .map(adaptApiReview) ?? [];

  return (
    <div className="portal-home">
      <section className="portal-intro" aria-labelledby="home-title">
        <div className="container portal-intro-grid">
          <div className="portal-intro-copy">
            <p className="portal-kicker">DAS BEWERTUNGSPORTAL FÜRS WOHNEN</p>
            <h1 id="home-title">
              Wie wohnt es sich
              <br />
              <span>wirklich?</span>
            </h1>
            <p className="portal-lead">
              Eine Wohnung sieht man bei der Besichtigung.
              <br className="hidden md:block" /> Wie es sich dort lebt, wissen
              die Menschen vor Ort.
            </p>
            <SearchBar large />
            <p className="portal-search-help">
              Adresse, Wohngegend oder Vermieter eingeben.
            </p>
          </div>
          <nav className="portal-categories" aria-label="Bewertungsbereiche">
            <p className="portal-categories-title">
              Drei Perspektiven. Ein besseres Bild.
            </p>
            {categories.map(({ key, label, icon: Icon, description }) => (
              <Link
                key={key}
                to={`/suche?type=${key}`}
                className="portal-category"
              >
                <span className={`category-icon category-${key}`}>
                  <Icon size={24} strokeWidth={1.6} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <div className="container portal-content">
        <section aria-labelledby="directory-title">
          <div className="portal-section-heading">
            <div>
              <p className="portal-kicker">DAS VERZEICHNIS</p>
              <h2 id="directory-title">
                Dein nächstes Zuhause beginnt mit Einblicken.
              </h2>
            </div>
            <Link className="text-link" to={`/suche?type=${category}`}>
              Alle ansehen <ArrowRight size={17} />
            </Link>
          </div>
          <div
            className="category-tabs"
            role="group"
            aria-label="Verzeichnisbereich auswählen"
          >
            {categories.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          {directory.isLoading ? (
            <p className="state-message" role="status">
              Verzeichnis wird geladen …
            </p>
          ) : directory.isError ? (
            <div role="alert" className="state-message">
              <p>Das Verzeichnis konnte nicht geladen werden.</p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => directory.refetch()}
              >
                Erneut versuchen
              </Button>
            </div>
          ) : entries.length ? (
            <div className="portal-entry-grid">
              {entries.map((item) => (
                <DirectoryRow
                  key={item.id}
                  to={resultRoutes[item.type] + item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  rating={item.rating}
                  reviewCount={item.reviewCount}
                />
              ))}
            </div>
          ) : (
            <p className="state-message">
              In diesem Bereich sind noch keine Einträge verfügbar.
            </p>
          )}
        </section>

        <section className="portal-recent" aria-labelledby="recent-title">
          <div className="portal-section-heading">
            <div>
              <p className="portal-kicker">PERSÖNLICHE ERFAHRUNGEN</p>
              <h2 id="recent-title">So erleben andere ihr Zuhause.</h2>
            </div>
            <MessageSquareText
              size={24}
              className="text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          {latest.isLoading ? (
            <p className="state-message" role="status">
              Erfahrungen werden geladen …
            </p>
          ) : latest.isError ? (
            <div className="state-message" role="alert">
              <p>Die aktuellen Erfahrungen konnten nicht geladen werden.</p>
              <Button variant="outline" onClick={() => latest.refetch()}>
                Erneut versuchen
              </Button>
            </div>
          ) : reviews.length ? (
            <div className="portal-review-grid">
              {reviews.map((review) => {
                const target = allEntries.find(
                  (item) =>
                    item.type === review.target_type &&
                    item.id === review.target_id,
                );
                return (
                  <Link
                    className="portal-review"
                    key={review.id}
                    to={`${resultRoutes[review.target_type]}${review.target_id}#review-${review.id}`}
                  >
                    <div className="portal-review-meta">
                      <span>
                        {
                          categories.find(
                            (item) => item.key === review.target_type,
                          )?.label
                        }
                      </span>
                      <span>{review.created_at}</span>
                    </div>
                    <StarRating rating={review.rating_overall} size={16} />
                    <h3>{review.title}</h3>
                    <p className="line-clamp-3">{review.text}</p>
                    <div className="portal-review-target">
                      <span>{target?.title ?? "Zum bewerteten Profil"}</span>
                      <ArrowRight size={16} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="state-message">
              Noch keine Erfahrungen veröffentlicht. Mach mit deiner den Anfang.
            </p>
          )}
        </section>

        <section className="portal-contribute">
          <div className="contribute-symbol">
            <PenLine size={29} strokeWidth={1.5} />
          </div>
          <div>
            <h2>Du wohnst dort. Du weißt mehr.</h2>
            <p>
              Teile deine Erfahrung mit deiner Immobilie, Wohngegend oder deinem
              Vermieter.
            </p>
          </div>
          <Button
            asChild
            className="h-auto min-h-11 max-w-full whitespace-normal text-center"
          >
            <Link to="/bewertung/neu">
              Bewertung schreiben <ArrowRight size={17} />
            </Link>
          </Button>
        </section>
        <p className="portal-source-note">
          Bewertungen auf WohnCheck sind persönliche Nutzererfahrungen. Externe
          Plattformbewertungen fließen nicht in die angezeigten Bewertungen ein.
        </p>
      </div>
    </div>
  );
}
