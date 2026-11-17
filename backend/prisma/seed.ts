import {
  GeoAccuracy,
  LegalUseStatus,
  ListingSourceMethod,
  ListingStatus,
  Prisma,
  PrismaClient,
  ProviderKind,
  ReviewStatus,
  TargetType,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const landlordPasswordHash = await bcrypt.hash("Landlord123!", 12);
  const adminPasswordHash = await bcrypt.hash("Admin123!", 12);
  const userPasswordHash = await bcrypt.hash("User12345!", 12);

  const landlords = [
    { id: "l1", name: "Vonovia SE", normalizedName: "vonovia se", companyType: "Wohnungsgesellschaft", landlordType: ProviderKind.PRIVATE_COMPANY, city: "Berlin", website: "https://vonovia.de", slug: "vonovia-se-berlin" },
    { id: "l2", name: "Müller Hausverwaltung", normalizedName: "muller hausverwaltung", companyType: "Hausverwaltung", landlordType: ProviderKind.PROPERTY_MANAGER, city: "München", website: null, slug: "mueller-hausverwaltung-muenchen" },
    { id: "l3", name: "Schmidt und Partner Immobilien", normalizedName: "schmidt und partner immobilien", companyType: "Privatvermieter", landlordType: ProviderKind.PRIVATE_INDIVIDUAL, city: "Hamburg", website: null, slug: "schmidt-und-partner-immobilien-hamburg" },
    { id: "l4", name: "Berliner Wohnungsbau GmbH", normalizedName: "berliner wohnungsbau gmbh", companyType: "Wohnungsgesellschaft", landlordType: ProviderKind.MUNICIPAL, city: "Berlin", website: null, slug: "berliner-wohnungsbau-gmbh-berlin" },
    { id: "l5", name: "DOGEWO21", normalizedName: "dogewo21", companyType: "Kommunale Wohnungsgesellschaft", landlordType: ProviderKind.MUNICIPAL, city: "Dortmund", website: "https://www.dogewo21.de", slug: "dogewo21-dortmund" },
    { id: "l6", name: "ha.ge.we Hagener Gemeinnützige Wohnungsgesellschaft", normalizedName: "ha ge we hagener gemeinnutzige wohnungsgesellschaft", companyType: "Kommunale Wohnungsgesellschaft", landlordType: ProviderKind.NON_PROFIT, city: "Hagen", website: "https://www.hagewe.com", slug: "hagewe-hagen" },
    { id: "l7", name: "LEG Wohnen NRW GmbH", normalizedName: "leg wohnen nrw gmbh", companyType: "Wohnungsgesellschaft", landlordType: ProviderKind.INSTITUTIONAL, city: "Düsseldorf", website: "https://www.leg-wohnen.de", slug: "leg-wohnen-nrw-duesseldorf" },
    { id: "l8", name: "VIVAWEST", normalizedName: "vivawest", companyType: "Wohnungsgesellschaft", landlordType: ProviderKind.PRIVATE_COMPANY, city: "Gelsenkirchen", website: "https://www.vivawest.de", slug: "vivawest-gelsenkirchen" },
  ];

  const neighborhoods = [
    { id: "n1", districtName: "Prenzlauer Berg", city: "Berlin", postalCode: "10435", slug: "prenzlauer-berg-berlin-10435" },
    { id: "n2", districtName: "Schwabing", city: "München", postalCode: "80802", slug: "schwabing-muenchen-80802" },
    { id: "n3", districtName: "Sternschanze", city: "Hamburg", postalCode: "20357", slug: "sternschanze-hamburg-20357" },
    { id: "n4", districtName: "Friedrichshain", city: "Berlin", postalCode: "10243", slug: "friedrichshain-berlin-10243" },
  ];

  const properties = [
    { id: "p1", street: "Kastanienallee", houseNumber: "12", postalCode: "10435", city: "Berlin", slug: "kastanienallee-12-10435-berlin", landlordId: "l1", neighborhoodId: "n1" },
    { id: "p2", street: "Leopoldstraße", houseNumber: "45", postalCode: "80802", city: "München", slug: "leopoldstrasse-45-80802-muenchen", landlordId: "l2", neighborhoodId: "n2" },
    { id: "p3", street: "Schanzenviertel Str.", houseNumber: "7", postalCode: "20357", city: "Hamburg", slug: "schanzenviertel-str-7-20357-hamburg", landlordId: "l3", neighborhoodId: "n3" },
    { id: "p4", street: "Karl-Marx-Allee", houseNumber: "89", postalCode: "10243", city: "Berlin", slug: "karl-marx-allee-89-10243-berlin", landlordId: "l4", neighborhoodId: "n4" },
  ];

  for (const landlord of landlords) {
    await prisma.landlord.upsert({
      where: { id: landlord.id },
      update: landlord,
      create: landlord,
    });
  }

  for (const neighborhood of neighborhoods) {
    await prisma.neighborhood.upsert({
      where: { id: neighborhood.id },
      update: neighborhood,
      create: neighborhood,
    });
  }

  for (const property of properties) {
    await prisma.property.upsert({
      where: { id: property.id },
      update: property,
      create: property,
    });
  }

  const districts = [
    { id: "d-berlin-prenzlauer-berg", name: "Prenzlauer Berg", city: "Berlin", postalCode: "10435", slug: "berlin-prenzlauer-berg", centroidLat: 52.5390, centroidLon: 13.4240, rent: 15.8 },
    { id: "d-berlin-friedrichshain", name: "Friedrichshain", city: "Berlin", postalCode: "10243", slug: "berlin-friedrichshain", centroidLat: 52.5158, centroidLon: 13.4542, rent: 16.4 },
    { id: "d-dortmund-hoerde", name: "Hörde", city: "Dortmund", postalCode: "44263", slug: "dortmund-hoerde", centroidLat: 51.4889, centroidLon: 7.5008, rent: 11.22 },
    { id: "d-stuttgart-west", name: "Stuttgart-West", city: "Stuttgart", postalCode: "70197", slug: "stuttgart-west", centroidLat: 48.7758, centroidLon: 9.1566, rent: 17.2 },
  ];

  for (const district of districts) {
    await prisma.district.upsert({
      where: { id: district.id },
      update: {
        name: district.name,
        city: district.city,
        postalCode: district.postalCode,
        slug: district.slug,
        centroidLat: new Prisma.Decimal(district.centroidLat),
        centroidLon: new Prisma.Decimal(district.centroidLon),
      },
      create: {
        id: district.id,
        name: district.name,
        city: district.city,
        postalCode: district.postalCode,
        slug: district.slug,
        centroidLat: new Prisma.Decimal(district.centroidLat),
        centroidLon: new Prisma.Decimal(district.centroidLon),
      },
    });

    await prisma.districtRentPrice.upsert({
      where: { id: `rent-${district.id}` },
      update: {
        valuePerSqm: new Prisma.Decimal(district.rent),
        periodLabel: "MVP-Baseline 2026",
      },
      create: {
        id: `rent-${district.id}`,
        districtId: district.id,
        metric: "rent_cold",
        valuePerSqm: new Prisma.Decimal(district.rent),
        p25: new Prisma.Decimal(Math.max(1, district.rent - 2.1)),
        p75: new Prisma.Decimal(district.rent + 2.4),
        sampleSize: 120,
        sourceKey: "wohncheck-mvp-baseline",
        sourceUrl: "https://www.govdata.de/",
        periodLabel: "MVP-Baseline 2026",
        quality: "derived",
      },
    });
  }

  const sourceProviders = [
    {
      id: "sp-admin-csv",
      key: "admin-csv-import",
      name: "WohnCheck Admin CSV-Import",
      providerKind: ProviderKind.MANUAL,
      method: ListingSourceMethod.CSV_IMPORT,
      legalUseStatus: LegalUseStatus.MANUAL,
      quality: { freshness: 80, completeness: 75, legal: 95, structure: 85, reliability: 80, overall: 83 },
    },
    {
      id: "sp-demo-partner-feed",
      key: "demo-partner-feed",
      name: "Demo Partner-Feed",
      providerKind: ProviderKind.PARTNER_FEED,
      method: ListingSourceMethod.PARTNER_FEED,
      legalUseStatus: LegalUseStatus.PARTNER,
      quality: { freshness: 85, completeness: 80, legal: 95, structure: 90, reliability: 82, overall: 86 },
    },
    {
      id: "sp-public-structured",
      key: "public-structured-provider",
      name: "Öffentliche strukturierte Anbieterquelle",
      providerKind: ProviderKind.PRIVATE_COMPANY,
      method: ListingSourceMethod.PUBLIC_STRUCTURED_DATA,
      legalUseStatus: LegalUseStatus.ALLOWED,
      quality: { freshness: 70, completeness: 65, legal: 80, structure: 75, reliability: 68, overall: 72 },
    },
  ];

  for (const provider of sourceProviders) {
    await prisma.sourceProvider.upsert({
      where: { key: provider.key },
      update: {
        name: provider.name,
        providerKind: provider.providerKind,
        method: provider.method,
        legalUseStatus: provider.legalUseStatus,
        robotsStatus: provider.legalUseStatus === LegalUseStatus.ALLOWED ? "allowed" : "not_required",
        termsStatus: provider.legalUseStatus === LegalUseStatus.PARTNER ? "partner_contract" : "reviewed",
        isActive: true,
      },
      create: {
        id: provider.id,
        key: provider.key,
        name: provider.name,
        providerKind: provider.providerKind,
        method: provider.method,
        legalUseStatus: provider.legalUseStatus,
        robotsStatus: provider.legalUseStatus === LegalUseStatus.ALLOWED ? "allowed" : "not_required",
        termsStatus: provider.legalUseStatus === LegalUseStatus.PARTNER ? "partner_contract" : "reviewed",
      },
    });

    const sourceProvider = await prisma.sourceProvider.findUniqueOrThrow({ where: { key: provider.key } });
    await prisma.sourceQualityScore.upsert({
      where: { sourceProviderId: sourceProvider.id },
      update: {
        freshnessScore: provider.quality.freshness,
        completenessScore: provider.quality.completeness,
        legalScore: provider.quality.legal,
        structureScore: provider.quality.structure,
        reliabilityScore: provider.quality.reliability,
        overallScore: provider.quality.overall,
        explanation: "MVP-Quellenbewertung: Aktualität, Vollständigkeit, Recht, Struktur und Zuverlässigkeit.",
      },
      create: {
        sourceProviderId: sourceProvider.id,
        freshnessScore: provider.quality.freshness,
        completenessScore: provider.quality.completeness,
        legalScore: provider.quality.legal,
        structureScore: provider.quality.structure,
        reliabilityScore: provider.quality.reliability,
        overallScore: provider.quality.overall,
        explanation: "MVP-Quellenbewertung: Aktualität, Vollständigkeit, Recht, Struktur und Zuverlässigkeit.",
      },
    });
  }

  const listingSeeds = [
    {
      id: "listing-berlin-kastanienallee-available",
      canonicalKey: "demo-partner-feed:berlin:kastanienallee-12:2og",
      title: "2-Zimmer-Wohnung nahe Kastanienallee",
      street: "Kastanienallee",
      houseNumber: "12",
      postalCode: "10435",
      city: "Berlin",
      districtName: "Prenzlauer Berg",
      latitude: 52.5407,
      longitude: 13.4126,
      livingAreaSqm: 64,
      rooms: 2,
      coldRent: 1040,
      warmRent: 1240,
      landlordId: "l1",
      districtId: "d-berlin-prenzlauer-berg",
      sourceKey: "demo-partner-feed",
      sourceUrl: "https://vonovia.de",
      externalId: "demo-vonovia-berlin-001",
      status: ListingStatus.AVAILABLE,
      legalUseStatus: LegalUseStatus.PARTNER,
      geoAccuracy: GeoAccuracy.EXACT,
    },
    {
      id: "listing-dortmund-hoerde-available",
      canonicalKey: "admin-csv-import:dortmund:hoerder-semerteichstrasse:3og",
      title: "Familienwohnung in Dortmund-Hörde",
      street: "Hörder Semerteichstraße",
      houseNumber: "41",
      postalCode: "44263",
      city: "Dortmund",
      districtName: "Hörde",
      latitude: 51.4904,
      longitude: 7.5014,
      livingAreaSqm: 82,
      rooms: 3,
      coldRent: 910,
      warmRent: 1130,
      landlordId: "l5",
      districtId: "d-dortmund-hoerde",
      sourceKey: "admin-csv-import",
      sourceUrl: "https://www.dogewo21.de",
      externalId: "demo-dogewo-hoerde-001",
      status: ListingStatus.AVAILABLE,
      legalUseStatus: LegalUseStatus.MANUAL,
      geoAccuracy: GeoAccuracy.STREET,
    },
    {
      id: "listing-stuttgart-west-public",
      canonicalKey: "public-structured-provider:stuttgart-west:2zi",
      title: "Kompakte Wohnung in Stuttgart-West",
      street: null,
      houseNumber: null,
      postalCode: "70197",
      city: "Stuttgart",
      districtName: "Stuttgart-West",
      latitude: 48.7758,
      longitude: 9.1566,
      livingAreaSqm: 48,
      rooms: 2,
      coldRent: 875,
      warmRent: 1030,
      landlordId: null,
      districtId: "d-stuttgart-west",
      sourceKey: "public-structured-provider",
      sourceUrl: "https://www.swsg.de/",
      externalId: "demo-swsg-west-001",
      status: ListingStatus.AVAILABLE,
      legalUseStatus: LegalUseStatus.ALLOWED,
      geoAccuracy: GeoAccuracy.DISTRICT,
    },
  ];

  for (const seed of listingSeeds) {
    const sourceProvider = await prisma.sourceProvider.findUniqueOrThrow({ where: { key: seed.sourceKey } });
    const pricePerSqm = seed.coldRent && seed.livingAreaSqm ? seed.coldRent / seed.livingAreaSqm : null;
    const districtRent = districts.find((district) => district.id === seed.districtId)?.rent;
    const priceDeviation = pricePerSqm && districtRent ? ((pricePerSqm - districtRent) / districtRent) * 100 : null;
    const dataQualityScore = Math.round(
      (seed.legalUseStatus === LegalUseStatus.ALLOWED || seed.legalUseStatus === LegalUseStatus.PARTNER || seed.legalUseStatus === LegalUseStatus.MANUAL ? 25 : 10) +
        (seed.latitude && seed.longitude ? 20 : 8) +
        (seed.coldRent && seed.livingAreaSqm && seed.rooms ? 25 : 12) +
        (sourceProvider.legalUseStatus === LegalUseStatus.BLOCKED ? 0 : 20) +
        (seed.sourceUrl ? 10 : 0),
    );

    await prisma.listing.upsert({
      where: { id: seed.id },
      update: {
        canonicalKey: seed.canonicalKey,
        title: seed.title,
        street: seed.street,
        houseNumber: seed.houseNumber,
        postalCode: seed.postalCode,
        city: seed.city,
        districtName: seed.districtName,
        latitude: new Prisma.Decimal(seed.latitude),
        longitude: new Prisma.Decimal(seed.longitude),
        geoAccuracy: seed.geoAccuracy,
        livingAreaSqm: new Prisma.Decimal(seed.livingAreaSqm),
        rooms: new Prisma.Decimal(seed.rooms),
        coldRent: new Prisma.Decimal(seed.coldRent),
        warmRent: new Prisma.Decimal(seed.warmRent),
        pricePerSqm: pricePerSqm ? new Prisma.Decimal(pricePerSqm.toFixed(2)) : null,
        status: seed.status,
        landlordId: seed.landlordId,
        districtId: seed.districtId,
        sourceProviderId: sourceProvider.id,
        sourceUrl: seed.sourceUrl,
        externalId: seed.externalId,
        legalUseStatus: seed.legalUseStatus,
        dataQualityScore,
        priceDeviationPercent: priceDeviation !== null ? new Prisma.Decimal(priceDeviation.toFixed(2)) : null,
        scorePreview: Math.max(35, Math.min(95, Math.round(dataQualityScore - Math.max(0, priceDeviation ?? 0) * 0.3))),
        approvedAt: new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        id: seed.id,
        canonicalKey: seed.canonicalKey,
        title: seed.title,
        street: seed.street,
        houseNumber: seed.houseNumber,
        postalCode: seed.postalCode,
        city: seed.city,
        districtName: seed.districtName,
        latitude: new Prisma.Decimal(seed.latitude),
        longitude: new Prisma.Decimal(seed.longitude),
        geoAccuracy: seed.geoAccuracy,
        livingAreaSqm: new Prisma.Decimal(seed.livingAreaSqm),
        rooms: new Prisma.Decimal(seed.rooms),
        coldRent: new Prisma.Decimal(seed.coldRent),
        warmRent: new Prisma.Decimal(seed.warmRent),
        pricePerSqm: pricePerSqm ? new Prisma.Decimal(pricePerSqm.toFixed(2)) : null,
        status: seed.status,
        landlordId: seed.landlordId,
        districtId: seed.districtId,
        sourceProviderId: sourceProvider.id,
        sourceUrl: seed.sourceUrl,
        externalId: seed.externalId,
        legalUseStatus: seed.legalUseStatus,
        dataQualityScore,
        priceDeviationPercent: priceDeviation !== null ? new Prisma.Decimal(priceDeviation.toFixed(2)) : null,
        scorePreview: Math.max(35, Math.min(95, Math.round(dataQualityScore - Math.max(0, priceDeviation ?? 0) * 0.3))),
        approvedAt: new Date(),
      },
    });

    await prisma.listingSource.deleteMany({ where: { listingId: seed.id } });
    await prisma.listingSource.create({
      data: {
        listingId: seed.id,
        sourceProviderId: sourceProvider.id,
        method: sourceProvider.method,
        sourceUrl: seed.sourceUrl,
        externalId: seed.externalId,
        legalUseStatus: seed.legalUseStatus,
        payload: {
          importedBy: "seed",
          legalBasis: seed.legalUseStatus,
          note: "MVP-Demodaten aus rechtlich sauberer Import-/Partner-/öffentlicher Strukturquelle.",
        },
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@wohncheck.local" },
    update: { displayName: "Admin", passwordHash: adminPasswordHash, role: UserRole.ADMIN, isVerified: true },
    create: { email: "admin@wohncheck.local", displayName: "Admin", passwordHash: adminPasswordHash, role: UserRole.ADMIN, isVerified: true },
  });

  await prisma.user.upsert({
    where: { email: "nutzer@wohncheck.local" },
    update: { displayName: "Demo Nutzer", passwordHash: userPasswordHash, role: UserRole.USER, isVerified: true },
    create: { email: "nutzer@wohncheck.local", displayName: "Demo Nutzer", passwordHash: userPasswordHash, role: UserRole.USER, isVerified: true },
  });

  await prisma.user.upsert({
    where: { email: "vermieter@wohncheck.local" },
    update: { displayName: "Demo Vermieter", passwordHash: landlordPasswordHash, role: UserRole.LANDLORD, landlordId: "l1", isVerified: true },
    create: { email: "vermieter@wohncheck.local", displayName: "Demo Vermieter", passwordHash: landlordPasswordHash, role: UserRole.LANDLORD, landlordId: "l1", isVerified: true },
  });

  await prisma.user.upsert({
    where: { email: "recherche@wohncheck.local" },
    update: { displayName: "WohnCheck Recherche", passwordHash: null, role: UserRole.ADMIN, isVerified: true },
    create: { email: "recherche@wohncheck.local", displayName: "WohnCheck Recherche", passwordHash: null, role: UserRole.ADMIN, isVerified: true },
  });

  const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: "nutzer@wohncheck.local" } });
  const landlordUser = await prisma.user.findUniqueOrThrow({ where: { email: "vermieter@wohncheck.local" } });
  const researchUser = await prisma.user.findUniqueOrThrow({ where: { email: "recherche@wohncheck.local" } });

  const reviews = [
    {
      id: "r1",
      userId: demoUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l1",
      title: "Kommunikation schwierig, aber erledigt",
      text: "Die Verwaltung reagiert langsam, kümmert sich am Ende aber doch um die Anliegen.",
      overallRating: new Prisma.Decimal(2.8),
      categoryRatings: { Kommunikation: 2.0, Fairness: 3.0, Reaktionszeit: 2.0, "Nebenkosten-Transparenz": 3.5, "Kautionsrückgabe": 3.0, Instandhaltung: 3.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 4,
    },
    {
      id: "r2",
      userId: demoUser.id,
      targetType: TargetType.PROPERTY,
      targetId: "p2",
      title: "Sehr gepflegtes Haus",
      text: "Gute Nachbarschaft, sauber und insgesamt ruhig. Würde ich weiterempfehlen.",
      overallRating: new Prisma.Decimal(4.5),
      categoryRatings: { Sauberkeit: 5.0, Lärm: 4.0, Zustand: 4.5, Sicherheit: 4.5, Gemeinschaft: 4.0, Müllsituation: 4.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 7,
    },
    {
      id: "r3",
      userId: landlordUser.id,
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n1",
      title: "Lebendig und gut angebunden",
      text: "Viele Cafés, gute ÖPNV-Anbindung und insgesamt ein sehr angenehmes Wohnumfeld.",
      overallRating: new Prisma.Decimal(4.2),
      categoryRatings: { Sicherheit: 4.0, Ruhe: 3.5, Einkaufsmöglichkeiten: 4.5, ÖPNV: 5.0, Familienfreundlichkeit: 4.0, Grünflächen: 4.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 5,
    },
    {
      id: "r4",
      userId: demoUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l4",
      title: "Etwas zu positiv formuliert",
      text: "Alles ist perfekt, beste Verwaltung überhaupt, keinerlei Probleme jemals.",
      overallRating: new Prisma.Decimal(5.0),
      categoryRatings: { Kommunikation: 5.0, Fairness: 5.0, Reaktionszeit: 5.0, "Nebenkosten-Transparenz": 5.0, "Kautionsrückgabe": 5.0, Instandhaltung: 5.0 },
      status: ReviewStatus.REPORTED,
      helpfulCount: 0,
    },
    {
      id: "rs-vonovia-nebenkosten-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l1",
      title: "Quellenlage: Nebenkosten oft Streitpunkt",
      text: "Aus öffentlichen Mietervereins- und Erfahrungsberichten zusammengefasst: Besonders häufig tauchen Beschwerden über schwer nachvollziehbare Betriebs- und Heizkosten, umfangreiche Belegpakete und lange Klärungswege auf. Gleichzeitig zeigen Bewertungsplattformen auch positive Stimmen zu freundlichem Kontakt und unkomplizierten Anmietungen. Diese Rezension ist ein redaktioneller Quellen-Digest, keine einzelne Nutzererfahrung.",
      overallRating: new Prisma.Decimal(2.4),
      categoryRatings: { Kommunikation: 2.5, Fairness: 2.2, Reaktionszeit: 2.3, "Nebenkosten-Transparenz": 1.8, "Kautionsrückgabe": 2.5, Instandhaltung: 2.7 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 18,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:00:00.000Z"),
    },
    {
      id: "rs-vonovia-service-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l1",
      title: "Gemischtes Bild beim Service",
      text: "Öffentliche Bewertungen zeichnen ein geteiltes Bild: Einige Mieter berichten von hilfreichen Mitarbeitenden, digitalen Prozessen und schnellen Rückmeldungen; andere nennen Notfälle, Reparaturen und Absprachen als Schwachstellen. Für WohnCheck als vorsichtige Zusammenfassung bewertet.",
      overallRating: new Prisma.Decimal(3.0),
      categoryRatings: { Kommunikation: 3.2, Fairness: 3.0, Reaktionszeit: 2.8, "Nebenkosten-Transparenz": 2.6, "Kautionsrückgabe": 3.0, Instandhaltung: 3.1 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 11,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:05:00.000Z"),
    },
    {
      id: "rs-dogewo-service-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l5",
      title: "Lokaler Anbieter mit sichtbarem Serviceangebot",
      text: "DOGEWO21 stellt Serviceteams, Reparaturservice und ein Mieterportal prominent heraus. In lokalen Diskussionen wird DOGEWO21 teils als solide Alternative genannt. Die öffentliche Quellenlage enthält aber auch Einzelfälle zu kalten Wohnungen, Heizkosten und Sanierungsbedarf. Zusammenfassung auf Basis öffentlicher Quellen, keine Einzelbewertung.",
      overallRating: new Prisma.Decimal(3.4),
      categoryRatings: { Kommunikation: 3.6, Fairness: 3.5, Reaktionszeit: 3.2, "Nebenkosten-Transparenz": 3.1, "Kautionsrückgabe": 3.5, Instandhaltung: 3.2 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 9,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:10:00.000Z"),
    },
    {
      id: "rs-dogewo-modernisierung-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l5",
      title: "Sanierung und Altbestand als Reibungspunkt",
      text: "Ein öffentlicher Lokalbericht beschreibt Beschwerden zu niedriger Raumtemperatur, hohen Heizkosten und Feuchtigkeit im Keller; DOGEWO21 verweist dort auf Begutachtung durch Bauleitung und Fachbetriebe sowie langfristige energetische Planung. Daraus entsteht ein mittleres Bild: gute Struktur, aber spürbarer Druck im Bestand.",
      overallRating: new Prisma.Decimal(3.0),
      categoryRatings: { Kommunikation: 3.2, Fairness: 3.1, Reaktionszeit: 3.0, "Nebenkosten-Transparenz": 2.9, "Kautionsrückgabe": 3.4, Instandhaltung: 2.7 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 7,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:15:00.000Z"),
    },
    {
      id: "rs-hagewe-rating-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l6",
      title: "Schwache externe Bewertungsnoten",
      text: "Aggregierte Bewertungsprofile weisen für ha.ge.we eine eher schwache Gesamtnote aus, während die Gesellschaft selbst bezahlbaren Wohnraum, Modernisierung und Mieterunterstützung betont. Mangels vieler direkt auswertbarer Erfahrungsberichte ist diese WohnCheck-Einschätzung bewusst vorsichtig und als Quellen-Digest gekennzeichnet.",
      overallRating: new Prisma.Decimal(2.5),
      categoryRatings: { Kommunikation: 2.6, Fairness: 2.7, Reaktionszeit: 2.4, "Nebenkosten-Transparenz": 2.6, "Kautionsrückgabe": 2.8, Instandhaltung: 2.5 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 8,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:20:00.000Z"),
    },
    {
      id: "rs-leg-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l7",
      title: "Viele kritische Rückmeldungen online",
      text: "Öffentliche Bewertungsplattformen zeigen bei LEG Wohnen NRW viele kritische Rückmeldungen, besonders zu Erreichbarkeit, digitalen Kontaktwegen, Reparaturen und eingehaltenen Zusagen. Unternehmensprofile betonen gleichzeitig Größe, regionale Ansprechpartner und breiten Bestand. WohnCheck fasst dies als aktuell kritisches Servicebild zusammen.",
      overallRating: new Prisma.Decimal(2.0),
      categoryRatings: { Kommunikation: 2.0, Fairness: 2.1, Reaktionszeit: 1.9, "Nebenkosten-Transparenz": 2.2, "Kautionsrückgabe": 2.4, Instandhaltung: 2.1 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 10,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:25:00.000Z"),
    },
    {
      id: "rs-vivawest-2026",
      userId: researchUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l8",
      title: "Stark gemischte Erfahrungen",
      text: "Bei VIVAWEST finden sich öffentlich sowohl sehr positive Stimmen zu Beratung und Begleitung als auch deutliche Kritik zur Wohnungsvergabe und Kommunikation. Als vorsichtiger WohnCheck-Digest ergibt sich ein gemischtes Bild mit etwas besserem Service-Eindruck als bei stark kritisierten Konzernen.",
      overallRating: new Prisma.Decimal(3.1),
      categoryRatings: { Kommunikation: 3.1, Fairness: 3.0, Reaktionszeit: 3.0, "Nebenkosten-Transparenz": 3.0, "Kautionsrückgabe": 3.1, Instandhaltung: 3.2 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 6,
      verificationLevel: "public-source-summary",
      createdAt: new Date("2026-05-09T08:30:00.000Z"),
    },
  ];

  for (const review of reviews) {
    await prisma.review.upsert({
      where: { id: review.id },
      update: review,
      create: review,
    });
  }

  await prisma.reviewReport.upsert({
    where: { id: "rep1" },
    update: {
      reviewId: "r4",
      userId: landlordUser.id,
      reason: "Verdacht auf Fake-Bewertung",
      status: "PENDING",
    },
    create: {
      id: "rep1",
      reviewId: "r4",
      userId: landlordUser.id,
      reason: "Verdacht auf Fake-Bewertung",
      status: "PENDING",
    },
  });

  const reviewSourceDigests = [
    {
      targetId: "l1",
      summary: "Geteiltes Bild: sehr viele positive Trustpilot-Bewertungen zu Kontakt/Anmietung, zugleich deutliche Kritik von Mietervereinen und Initiativen zu Nebenkosten, Belegeinsicht und Reparaturservice.",
      sources: [
        "https://de.trustpilot.com/review/www.vonovia.de",
        "https://www.berliner-mieterverein.de/magazin/online/mm0123/vonovia-macht-rendite-mit-den-nebenkosten-012309a.htm",
        "https://novonovia.mieterinnenrat.de/wir-kaempfen-mieterinnen-berichten-von-ihren-erfahrungen-mit-vonovia/",
      ],
      themes: ["Nebenkosten", "Belegeinsicht", "Kommunikation", "Reparaturen", "digitale Prozesse"],
    },
    {
      targetId: "l5",
      summary: "DOGEWO21 bietet Serviceteams, Reparaturservice und ein Mieterportal; lokale Erfahrungsquellen nennen sowohl solide Erfahrungen als auch Einzelfälle mit Heizkosten, kalten Räumen und Sanierungsbedarf.",
      sources: [
        "https://www.dogewo21.de/",
        "https://www.ruhr24.de/dortmund/dortmund-streit-mieter-vermieter-sanierung-heizkosten-erfahrung-dogewo21-zur-sonnenseite-eving-siedlung-93901587.html",
      ],
      themes: ["Serviceteams", "Mieterportal", "Reparaturservice", "Heizkosten", "Sanierungsbedarf"],
    },
    {
      targetId: "l6",
      summary: "ha.ge.we wird auf aggregierten Bewertungsprofilen eher schwach bewertet; der Geschäftsbericht betont Modernisierung, Digitalisierung, Mieterunterstützung und bezahlbaren Wohnraum.",
      sources: [
        "https://www.provenexpert.com/de-de/ha-ge-we-hagener-gemeinnuetzige-wohnungs-gmbh/",
        "https://hagewe.com/media/geschaeftsberichte/hagewe-geschaeftsbericht-2023.pdf",
      ],
      themes: ["Bewertungsnote", "Modernisierung", "Mieterunterstützung", "bezahlbarer Wohnraum"],
    },
    {
      targetId: "l7",
      summary: "LEG Wohnen NRW zeigt auf öffentlichen Bewertungsplattformen viele kritische Rückmeldungen zu Kommunikation, Reparaturen und Zusagen; Unternehmensangaben betonen großen Bestand und regionale Ansprechpartner.",
      sources: ["https://de.trustpilot.com/review/www.leg-wohnen.de"],
      themes: ["Kommunikation", "Reparaturen", "digitale Kontaktwege", "Zusagen"],
    },
    {
      targetId: "l8",
      summary: "VIVAWEST wirkt in öffentlichen Bewertungen gemischt: positive Beratungserfahrungen stehen Kritik an Vergabeprozessen und Kommunikation gegenüber.",
      sources: ["https://de.trustpilot.com/review/vivawest.de"],
      themes: ["Beratung", "Wohnungsvergabe", "Kommunikation", "Service"],
    },
  ];

  for (const digest of reviewSourceDigests) {
    await prisma.publicSourceSnapshot.deleteMany({
      where: {
        targetType: TargetType.LANDLORD,
        targetId: digest.targetId,
        sourceKey: "public_review_digest_2026_05",
      },
    });

    await prisma.publicSourceSnapshot.create({
      data: {
        targetType: TargetType.LANDLORD,
        targetId: digest.targetId,
        sourceKey: "public_review_digest_2026_05",
        payload: {
          sourceName: "WohnCheck Quellen-Digest",
          capturedLabel: "Öffentliche Erfahrungsberichte und Bewertungsprofile, recherchiert am 2026-05-09",
          summary: digest.summary,
          sources: digest.sources,
          themes: digest.themes,
          caveat: "Redaktionelle Zusammenfassung; keine übernommenen Originalbewertungen und keine Verifikation einzelner Tatsachenbehauptungen.",
        },
      },
    });
  }

  const publicProfiles = [
    {
      targetType: TargetType.PROPERTY,
      targetId: "p1",
      totalScore: 83,
      confidenceScore: 74,
      signals: {
        transit: { label: "ÖPNV", score: 94, weight: 0.22, details: "Dichte Tram-/U-Bahn-/Bushaltestellen im Umfeld" },
        safety: { label: "Kriminalitätsrate", score: 68, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Kriminalitätsdaten" },
        infrastructure: { label: "Infrastruktur", score: 88, weight: 0.22, details: "Lebensmittel, Ärzte, Schulen, Kitas und Nahversorgung" },
        internet: { label: "Internetverbindung", score: 78, weight: 0.16, details: "Breitband-/Gigabit-Verfügbarkeit auf Gebietsebene" },
        leisure: { label: "Freizeitaktivitäten", score: 86, weight: 0.22, details: "Parks, Gastronomie, Kultur und Sportangebote im Umfeld" },
      },
    },
    {
      targetType: TargetType.PROPERTY,
      targetId: "p2",
      totalScore: 88,
      confidenceScore: 74,
      signals: {
        transit: { label: "ÖPNV", score: 91, weight: 0.22, details: "Sehr gute U-Bahn-/Busnähe" },
        safety: { label: "Kriminalitätsrate", score: 82, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Sicherheitsdaten" },
        infrastructure: { label: "Infrastruktur", score: 92, weight: 0.22, details: "Sehr hohe Nahversorgungsdichte" },
        internet: { label: "Internetverbindung", score: 85, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 88, weight: 0.22, details: "Parks, Gastronomie und Kultur in Laufnähe" },
      },
    },
    {
      targetType: TargetType.PROPERTY,
      targetId: "p3",
      totalScore: 79,
      confidenceScore: 74,
      signals: {
        transit: { label: "ÖPNV", score: 88, weight: 0.22, details: "Viele Schnellbahn-/Busoptionen im Viertel" },
        safety: { label: "Kriminalitätsrate", score: 58, weight: 0.18, details: "Gebietsindikator mit erhöhtem urbanem Nachtleben-Risiko" },
        infrastructure: { label: "Infrastruktur", score: 84, weight: 0.22, details: "Gute Nahversorgung und medizinische Angebote" },
        internet: { label: "Internetverbindung", score: 82, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 90, weight: 0.22, details: "Sehr hohe Dichte an Kultur, Gastronomie und Ausgehen" },
      },
    },
    {
      targetType: TargetType.PROPERTY,
      targetId: "p4",
      totalScore: 84,
      confidenceScore: 74,
      signals: {
        transit: { label: "ÖPNV", score: 93, weight: 0.22, details: "Sehr gute U-/S-Bahn- und Tram-Anbindung" },
        safety: { label: "Kriminalitätsrate", score: 63, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Kriminalitätsdaten" },
        infrastructure: { label: "Infrastruktur", score: 89, weight: 0.22, details: "Hohe Dichte an Versorgung und Dienstleistungen" },
        internet: { label: "Internetverbindung", score: 84, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 92, weight: 0.22, details: "Sehr gute Freizeit-, Gastro- und Kulturangebote" },
      },
    },
    {
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n1",
      totalScore: 84,
      confidenceScore: 76,
      signals: {
        transit: { label: "ÖPNV", score: 93, weight: 0.22, details: "Sehr gute Tram-/U-Bahn- und Busabdeckung" },
        safety: { label: "Kriminalitätsrate", score: 70, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Kriminalitätsdaten" },
        infrastructure: { label: "Infrastruktur", score: 90, weight: 0.22, details: "Hohe Dichte an Schulen, Kitas, Ärzten und Einkauf" },
        internet: { label: "Internetverbindung", score: 78, weight: 0.16, details: "Breitband-/Gigabit-Verfügbarkeit auf Gebietsebene" },
        leisure: { label: "Freizeitaktivitäten", score: 88, weight: 0.22, details: "Parks, Cafés, Kultur und Sportangebote" },
      },
    },
    {
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n2",
      totalScore: 88,
      confidenceScore: 76,
      signals: {
        transit: { label: "ÖPNV", score: 90, weight: 0.22, details: "Sehr gute U-Bahn- und Busabdeckung" },
        safety: { label: "Kriminalitätsrate", score: 84, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Sicherheitsdaten" },
        infrastructure: { label: "Infrastruktur", score: 92, weight: 0.22, details: "Sehr gute Nahversorgung, Schulen und medizinische Angebote" },
        internet: { label: "Internetverbindung", score: 86, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 88, weight: 0.22, details: "Gute Park-, Kultur- und Gastroabdeckung" },
      },
    },
    {
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n3",
      totalScore: 79,
      confidenceScore: 76,
      signals: {
        transit: { label: "ÖPNV", score: 88, weight: 0.22, details: "Sehr gute Schnellbahn-/Busnähe" },
        safety: { label: "Kriminalitätsrate", score: 58, weight: 0.18, details: "Gebietsindikator mit erhöhtem Ausgehviertel-Risiko" },
        infrastructure: { label: "Infrastruktur", score: 83, weight: 0.22, details: "Gute Nahversorgung und medizinische Angebote" },
        internet: { label: "Internetverbindung", score: 82, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 91, weight: 0.22, details: "Sehr hohe Freizeit- und Kulturdichte" },
      },
    },
    {
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n4",
      totalScore: 84,
      confidenceScore: 76,
      signals: {
        transit: { label: "ÖPNV", score: 94, weight: 0.22, details: "Sehr gute U-/S-Bahn-, Tram- und Busabdeckung" },
        safety: { label: "Kriminalitätsrate", score: 63, weight: 0.18, details: "Gebietsindikator aus veröffentlichten Kriminalitätsdaten" },
        infrastructure: { label: "Infrastruktur", score: 89, weight: 0.22, details: "Hohe Dichte an Versorgung, Schulen und Jobs" },
        internet: { label: "Internetverbindung", score: 84, weight: 0.16, details: "Gute Breitband-/Gigabit-Verfügbarkeit" },
        leisure: { label: "Freizeitaktivitäten", score: 92, weight: 0.22, details: "Sehr hohe Gastro-, Kultur- und Freizeitdichte" },
      },
    },
  ];

  for (const profile of publicProfiles) {
    await prisma.publicSourceSnapshot.deleteMany({
      where: {
        targetType: profile.targetType,
        targetId: profile.targetId,
        sourceKey: "public_baseline_2026",
      },
    });

    await prisma.publicSourceSnapshot.create({
      data: {
        targetType: profile.targetType,
        targetId: profile.targetId,
        sourceKey: "public_baseline_2026",
        payload: {
          sourceName: "WohnCheck Public Baseline",
          sourceUrl: "https://daten.berlin.de/",
          capturedLabel: "Demo-Snapshot aus öffentlichen Quellentypen",
          signals: profile.signals,
          sourceNotes: [
            "ÖPNV: GTFS/Haltestellen, z.B. VBB und weitere Verkehrsverbünde",
            "POI-Infrastruktur/Freizeit: OpenStreetMap/Overpass",
            "Sicherheit: veröffentlichte Kriminalitätsatlanten oder PKS auf Gebietsebene",
            "Internet: Breitbandatlas/Gigabit-Grundbuch auf Gebietsebene",
          ],
        },
      },
    });

    await prisma.scoreResult.upsert({
      where: {
        targetType_targetId_calculationVersion: {
          targetType: profile.targetType,
          targetId: profile.targetId,
          calculationVersion: "public-baseline-v1",
        },
      },
      update: {
        totalScore: new Prisma.Decimal(profile.totalScore),
        confidenceScore: new Prisma.Decimal(profile.confidenceScore),
        components: {
          deleteMany: {},
          create: Object.entries(profile.signals).map(([key, signal]) => ({
            key,
            label: signal.label,
            value: new Prisma.Decimal(signal.score),
            weight: new Prisma.Decimal(signal.weight),
            source: "public_baseline_2026",
            metadata: {
              details: signal.details,
              sourceName: "WohnCheck Public Baseline",
            },
          })),
        },
      },
      create: {
        targetType: profile.targetType,
        targetId: profile.targetId,
        totalScore: new Prisma.Decimal(profile.totalScore),
        confidenceScore: new Prisma.Decimal(profile.confidenceScore),
        calculationVersion: "public-baseline-v1",
        components: {
          create: Object.entries(profile.signals).map(([key, signal]) => ({
            key,
            label: signal.label,
            value: new Prisma.Decimal(signal.score),
            weight: new Prisma.Decimal(signal.weight),
            source: "public_baseline_2026",
            metadata: {
              details: signal.details,
              sourceName: "WohnCheck Public Baseline",
            },
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
