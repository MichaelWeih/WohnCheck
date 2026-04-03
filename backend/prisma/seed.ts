import { PrismaClient, Prisma, ReviewStatus, TargetType, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const landlordPasswordHash = await bcrypt.hash("Landlord123!", 12);
  const adminPasswordHash = await bcrypt.hash("Admin123!", 12);
  const userPasswordHash = await bcrypt.hash("User12345!", 12);

  const landlords = [
    { id: "l1", name: "Vonovia SE", companyType: "Wohnungsgesellschaft", city: "Berlin", website: "https://vonovia.de", slug: "vonovia-se-berlin" },
    { id: "l2", name: "Mueller Hausverwaltung", companyType: "Hausverwaltung", city: "Muenchen", website: null, slug: "mueller-hausverwaltung-muenchen" },
    { id: "l3", name: "Schmidt und Partner Immobilien", companyType: "Privatvermieter", city: "Hamburg", website: null, slug: "schmidt-und-partner-immobilien-hamburg" },
    { id: "l4", name: "Berliner Wohnungsbau GmbH", companyType: "Wohnungsgesellschaft", city: "Berlin", website: null, slug: "berliner-wohnungsbau-gmbh-berlin" },
  ];

  const neighborhoods = [
    { id: "n1", districtName: "Prenzlauer Berg", city: "Berlin", postalCode: "10435", slug: "prenzlauer-berg-berlin-10435" },
    { id: "n2", districtName: "Schwabing", city: "Muenchen", postalCode: "80802", slug: "schwabing-muenchen-80802" },
    { id: "n3", districtName: "Sternschanze", city: "Hamburg", postalCode: "20357", slug: "sternschanze-hamburg-20357" },
    { id: "n4", districtName: "Friedrichshain", city: "Berlin", postalCode: "10243", slug: "friedrichshain-berlin-10243" },
  ];

  const properties = [
    { id: "p1", street: "Kastanienallee", houseNumber: "12", postalCode: "10435", city: "Berlin", slug: "kastanienallee-12-10435-berlin", landlordId: "l1", neighborhoodId: "n1" },
    { id: "p2", street: "Leopoldstrasse", houseNumber: "45", postalCode: "80802", city: "Muenchen", slug: "leopoldstrasse-45-80802-muenchen", landlordId: "l2", neighborhoodId: "n2" },
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

  const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: "nutzer@wohncheck.local" } });
  const landlordUser = await prisma.user.findUniqueOrThrow({ where: { email: "vermieter@wohncheck.local" } });

  const reviews = [
    {
      id: "r1",
      userId: demoUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l1",
      title: "Kommunikation schwierig, aber erledigt",
      text: "Die Verwaltung reagiert langsam, kuemmert sich am Ende aber doch um die Anliegen.",
      overallRating: new Prisma.Decimal(2.8),
      categoryRatings: { Kommunikation: 2.0, Fairness: 3.0, Reaktionszeit: 2.0, "Nebenkosten-Transparenz": 3.5, Kautionsrueckgabe: 3.0, Instandhaltung: 3.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 4,
    },
    {
      id: "r2",
      userId: demoUser.id,
      targetType: TargetType.PROPERTY,
      targetId: "p2",
      title: "Sehr gepflegtes Haus",
      text: "Gute Nachbarschaft, sauber und insgesamt ruhig. Wuerde ich weiterempfehlen.",
      overallRating: new Prisma.Decimal(4.5),
      categoryRatings: { Sauberkeit: 5.0, Laerm: 4.0, Zustand: 4.5, Sicherheit: 4.5, Gemeinschaft: 4.0, Muellsituation: 4.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 7,
    },
    {
      id: "r3",
      userId: landlordUser.id,
      targetType: TargetType.NEIGHBORHOOD,
      targetId: "n1",
      title: "Lebendig und gut angebunden",
      text: "Viele Cafes, gute OePNV-Anbindung und insgesamt ein sehr angenehmes Wohnumfeld.",
      overallRating: new Prisma.Decimal(4.2),
      categoryRatings: { Sicherheit: 4.0, Ruhe: 3.5, Einkaufsmoeglichkeiten: 4.5, OePNV: 5.0, Familienfreundlichkeit: 4.0, Gruenflaechen: 4.0 },
      status: ReviewStatus.PUBLISHED,
      helpfulCount: 5,
    },
    {
      id: "r4",
      userId: demoUser.id,
      targetType: TargetType.LANDLORD,
      targetId: "l4",
      title: "Etwas zu positiv formuliert",
      text: "Alles ist perfekt, beste Verwaltung ueberhaupt, keinerlei Probleme jemals.",
      overallRating: new Prisma.Decimal(5.0),
      categoryRatings: { Kommunikation: 5.0, Fairness: 5.0, Reaktionszeit: 5.0, "Nebenkosten-Transparenz": 5.0, Kautionsrueckgabe: 5.0, Instandhaltung: 5.0 },
      status: ReviewStatus.REPORTED,
      helpfulCount: 0,
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
