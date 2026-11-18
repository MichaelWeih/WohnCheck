/**
 * Integration tests of the landlord directory against the dedicated test database (never the dev database).
 * External sources are replaced by deterministic fixtures through the OUTBOUND_FETCH seam: nothing here
 * touches Wikidata or GLEIF. The live import is verified separately (see docs/vermieter-audit.md).
 */
process.env.OUTBOUND_CONTACT = "integration-tests@wohncheck.invalid";
process.env.DISCOVERY_SOURCES = "wikidata,gleif";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { JobStatus, PartyVerificationStatus, PropertyRole, RecordStatus, UserRole } from "@prisma/client";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { OUTBOUND_FETCH, OutboundFetch } from "../src/common/http/outbound-http.types";
import { CompanyMergeServiceImpl } from "../src/modules/companies/company-merge.service";
import { addressKey } from "../src/modules/companies/normalization";
import { PropertyReportsService } from "../src/modules/directory/property-reports.service";
import { DiscoveryService } from "../src/modules/discovery/discovery.service";
import { JobQueueService } from "../src/modules/jobs/job.types";
import { PrismaService } from "../src/modules/prisma/prisma.service";

// ---------------------------------------------------------------------------------------------
// Fixtures in the documented response formats (docs/quellenrecherche-2026-11-15.json)
// ---------------------------------------------------------------------------------------------
const v = (value: string) => ({ value });
const wikidataRows = [
  {
    item: v("http://www.wikidata.org/entity/Q1202053"),
    labelDe: v("Vonovia"),
    aliases: v("Vonovia SE|Deutsche Annington"),
    websites: v("https://www.vonovia.de"),
    hqCities: v("Bochum"),
    parentIds: v(""),
    strongClasses: v("Q1534992"),
    lei: v("5299005A2ZEP6AP7KM81"),
    openCorporates: v("de/R2201_HRB16879"),
  },
  {
    item: v("http://www.wikidata.org/entity/Q1182872"),
    labelDe: v("Degewo"),
    aliases: v("degewo AG|Deutsche Gesellschaft zur Förderung des Wohnungsbaus"),
    websites: v("https://www.degewo.de/"),
    hqCities: v("Berlin"),
    parentIds: v(""),
    strongClasses: v("Q1534992"),
  },
  {
    // A real-estate company without a housing class: stays a CANDIDATE (not public) until reviewed.
    item: v("http://www.wikidata.org/entity/Q1589627"),
    labelDe: v("SAGA Unternehmensgruppe"),
    aliases: v(""),
    websites: v("https://www.saga.hamburg"),
    hqCities: v("Hamburg"),
    parentIds: v(""),
    strongClasses: v(""),
  },
];
const gleif = (lei: string, name: string, city: string, postalCode: string, street: string, ocid?: string) => ({
  type: "lei-records",
  id: lei,
  attributes: {
    lei,
    ocid: ocid ?? null,
    entity: {
      legalName: { name },
      otherNames: [],
      category: "GENERAL",
      status: "ACTIVE",
      legalAddress: { addressLines: [street], city, postalCode, country: "DE" },
      headquartersAddress: { addressLines: [street], city, postalCode, country: "DE" },
    },
    registration: { lastUpdateDate: "2026-10-01T00:00:00Z" },
  },
});
const gleifByScope: Record<string, unknown[]> = {
  Hausverwaltung: [
    gleif("39120037JXN0FO1OKQ94", "Privata Hausverwaltung GmbH", "Berlin", "12055", "Hertzbergstr. 30"),
    // A sole proprietorship-like name without legal form must never be collected.
    { ...gleif("39120000000000000099", "Hausverwaltung Erika Mustermann", "Berlin", "10115", "Musterweg 1"), attributes: { lei: "39120000000000000099", entity: { legalName: { name: "Hausverwaltung Erika Mustermann" }, category: "SOLE_PROPRIETOR", status: "ACTIVE" } } },
  ],
  Wohnungsbaugesellschaft: [
    // Similar to Vonovia, but a different legal entity (own LEI, own legal form): must stay separate.
    gleif("5299004TEUQ0A89NYW31", "Vonovia Immobilien Treuhand GmbH", "Bochum", "44803", "Universitätsstraße 133"),
  ],
};
let failGleifWith: number | null = null;

const fixtureFetch: OutboundFetch = async (url) => {
  const u = new URL(url);
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    status,
    headers: { forEach: (cb: (value: string, key: string) => void) => Object.entries({ "content-type": "application/json", ...headers }).forEach(([k, val]) => cb(val, k)) },
    text: async () => JSON.stringify(body),
  });
  if (u.hostname === "query.wikidata.org") {
    const query = u.searchParams.get("query") ?? "";
    const offset = Number(/OFFSET (\d+)/.exec(query)?.[1] ?? 0);
    return json(200, { results: { bindings: offset === 0 ? wikidataRows : [] } });
  }
  if (u.hostname === "www.wikidata.org") return json(200, { query: { search: [] } });
  if (u.hostname === "api.gleif.org") {
    if (failGleifWith) return json(failGleifWith, { errors: [{ title: "fixture" }] }, failGleifWith === 429 ? { "retry-after": "120" } : {});
    const scope = u.searchParams.get("filter[entity.legalName]") ?? "";
    const data = gleifByScope[scope] ?? [];
    return json(200, { data, meta: { pagination: { currentPage: 1, lastPage: 1, total: data.length } } });
  }
  return json(404, {});
};

// ---------------------------------------------------------------------------------------------

describe("landlord directory (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let discovery: DiscoveryService;
  let queue: JobQueueService;
  let userToken: string;
  let adminId: string;
  const http = () => request(app.getHttpServer());

  async function importAll(scopes: Array<[string, string?]> = [["wikidata"], ["gleif", "Hausverwaltung"], ["gleif", "Wohnungsbaugesellschaft"]]) {
    for (const [source, scope] of scopes) await discovery.requestSync(source, scope);
    // Bypass host spacing persisted from earlier runs: the fixtures answer instantly.
    await prisma.outboundHostState.deleteMany();
    return queue.drain();
  }

  async function landlordByName(name: string) {
    return prisma.landlord.findFirstOrThrow({ where: { name } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OUTBOUND_FETCH)
      .useValue(fixtureFetch)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    discovery = app.get(DiscoveryService);
    queue = app.get(JobQueueService);

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

    const jwt = app.get(JwtService);
    const user = await prisma.user.create({ data: { email: "mieter@test.invalid", displayName: "Mieter", role: UserRole.USER } });
    const admin = await prisma.user.create({ data: { email: "admin@test.invalid", displayName: "Admin", role: UserRole.ADMIN } });
    adminId = admin.id;
    userToken = await jwt.signAsync({ sub: user.id, email: user.email, role: user.role });

    await importAll();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe("import", () => {
    it("creates public landlords from the sources and keeps uncertain ones as candidates", async () => {
      expect(await landlordByName("Vonovia")).toMatchObject({ status: RecordStatus.ACTIVE, city: "Bochum", kind: "HOUSING_COMPANY" });
      expect(await landlordByName("Degewo")).toMatchObject({ status: RecordStatus.ACTIVE, city: "Berlin" });
      expect(await landlordByName("SAGA Unternehmensgruppe")).toMatchObject({ status: RecordStatus.CANDIDATE });
      expect(await landlordByName("Privata Hausverwaltung GmbH")).toMatchObject({
        status: RecordStatus.ACTIVE,
        kind: "PROPERTY_MANAGER",
        verificationStatus: "AUTO_VERIFIED",
        postalCode: "12055",
      });
      const vonovia = await landlordByName("Vonovia");
      const ids = await prisma.landlordIdentifier.findMany({ where: { landlordId: vonovia.id } });
      expect(ids.map((i) => `${i.scheme}:${i.value}`).sort()).toEqual([
        "GERMAN_REGISTER:R2201_HRB16879",
        "LEI:5299005A2ZEP6AP7KM81",
        "WIKIDATA:Q1202053",
      ]);
    });

    it("never collects sole proprietors (natural persons)", async () => {
      expect(await prisma.landlord.count({ where: { name: { contains: "Mustermann" } } })).toBe(0);
    });

    it("Fall 7: keeps a similarly named but different legal entity separate", async () => {
      const vonovia = await landlordByName("Vonovia");
      const treuhand = await landlordByName("Vonovia Immobilien Treuhand GmbH");
      expect(treuhand.id).not.toBe(vonovia.id);
      // "Immobilien" is only weak housing evidence: the separate entity is kept, but as a candidate.
      expect(treuhand.status).toBe(RecordStatus.CANDIDATE);
      expect(await prisma.mergeCandidate.count({ where: { OR: [{ landlordAId: treuhand.id }, { landlordBId: treuhand.id }] } })).toBe(0);
    });

    it("Fall 8: a second import creates no duplicates and changes nothing", async () => {
      const count = async () => ({
        landlords: await prisma.landlord.count(),
        aliases: await prisma.landlordAlias.count(),
        identifiers: await prisma.landlordIdentifier.count(),
        sources: await prisma.sourceRecord.count(),
        locations: await prisma.landlordLocation.count(),
      });
      const before = await count();
      await importAll();
      expect(await count()).toEqual(before);
      expect(await prisma.changeLog.count({ where: { action: "CREATED" } })).toBe(before.landlords);
    });

    it("does not overwrite reviews when a landlord is updated by a later import", async () => {
      const vonovia = await landlordByName("Vonovia");
      const user = await prisma.user.findFirstOrThrow({ where: { email: "mieter@test.invalid" } });
      await prisma.review.create({
        data: { userId: user.id, targetType: "LANDLORD", targetId: vonovia.id, title: "Test", text: "Eine Bewertung aus dem Test.", overallRating: 3, categoryRatings: {}, status: "PUBLISHED" },
      });
      await importAll([["wikidata"]]);
      expect(await prisma.review.count({ where: { targetId: vonovia.id } })).toBe(1);
      await prisma.review.deleteMany({ where: { targetId: vonovia.id } });
    });

    it("reschedules a rate-limited source instead of failing, and records failures", async () => {
      failGleifWith = 429;
      try {
        await discovery.requestSync("gleif", "Hausverwaltung", "FULL");
        await prisma.outboundHostState.deleteMany();
        await queue.drain();
        const job = await prisma.backgroundJob.findFirstOrThrow({ where: { dedupeKey: "discovery.sync:gleif:Hausverwaltung" }, orderBy: { createdAt: "desc" } });
        expect(job.status).toBe(JobStatus.QUEUED);
        expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
        const state = await prisma.sourceSyncState.findFirstOrThrow({ where: { sourceKey: "gleif", scope: "Hausverwaltung" } });
        expect(state.lastError).toContain("rate limited");
        // The search keeps working on the stored data while a source is limited.
        const search = await http().get("/api/search").query({ q: "Privata" }).expect(200);
        expect(search.body.landlords[0].name).toBe("Privata Hausverwaltung GmbH");
      } finally {
        failGleifWith = null;
        await prisma.backgroundJob.deleteMany({ where: { dedupeKey: "discovery.sync:gleif:Hausverwaltung" } });
        await prisma.outboundHostState.deleteMany();
      }
    });
  });

  describe("search", () => {
    const names = async (q: string) => (await http().get("/api/search").query({ q }).expect(200)).body.landlords.map((l: { name: string }) => l.name);

    it("Fall 1: finds Vonovia under every spelling, also with a city", async () => {
      for (const q of ["Vonovia", "VONOVIA", "Vonovia SE", "vonovia berlin", "Vonovia Bochum", "Vonvia", "Deutsche Annington"])
        expect((await names(q))[0]).toBe("Vonovia");
    });

    it("Fall 2: finds the municipal company degewo", async () => {
      expect((await names("degewo"))[0]).toBe("Degewo");
      expect(await names("Degewo Berlin")).toContain("Degewo");
    });

    it("Fall 3: finds a regional property manager from the sources", async () => {
      const body = (await http().get("/api/search").query({ q: "Privata Hausverwaltung" }).expect(200)).body;
      expect(body.landlords[0]).toMatchObject({ name: "Privata Hausverwaltung GmbH", kindLabel: "Hausverwaltung", city: "Berlin" });
    });

    it("lists each landlord once and never shows candidates", async () => {
      const list = await names("Vonovia");
      expect(new Set(list).size).toBe(list.length);
      expect(await names("SAGA")).toEqual([]);
      const saga = await landlordByName("SAGA Unternehmensgruppe");
      await http().get(`/api/landlords/${saga.id}`).expect(404);
    });

    it("returns empty results for unknown names and offers the open-source search", async () => {
      const body = (await http().get("/api/search").query({ q: "Zzyzx Wohnbau" }).expect(200)).body;
      expect(body.landlords).toEqual([]);
      expect(body.discoveryEligible).toBe(true);
      expect((await http().get("/api/search").query({ q: "a" }).expect(200)).body.landlords).toEqual([]);
    });

    it("suggests matches while typing and paginates the landlord list", async () => {
      const suggest = (await http().get("/api/search/suggest").query({ q: "vono" }).expect(200)).body;
      expect(suggest.suggestions[0]).toMatchObject({ type: "landlord", label: "Vonovia" });
      const page = (await http().get("/api/landlords").query({ limit: 2, offset: 0 }).expect(200)).body;
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(await prisma.landlord.count({ where: { status: RecordStatus.ACTIVE } }));
    });
  });

  describe("address mapping", () => {
    const street = "Kaiser-Wilhelm-Straße";
    const lookup = (houseNumber: string, postalCode = "12247") =>
      http().get("/api/properties/lookup").query({ street, houseNumber, postalCode, city: "Berlin" }).expect(200);

    it("Fall 5: an address without a known landlord says so instead of guessing", async () => {
      const body = (await lookup("103")).body;
      expect(body).toMatchObject({ status: "none", reason: "unknown_building", parties: [], property: null });
      expect(body.message).toBe("Für diese Immobilie ist aktuell noch kein Vermieter hinterlegt.");
      expect(body.checkedStages.find((s: { stage: number }) => s.stage === 2).result).toBe("not_available");
    });

    it("an address without house number is never mapped", async () => {
      const body = (await http().get("/api/properties/lookup").query({ street, postalCode: "12247" }).expect(200)).body;
      expect(body).toMatchObject({ status: "none", reason: "no_house_number" });
    });

    it("a user report stays unverified; only admin approval makes it a verified relation (Fall 4)", async () => {
      const vonovia = await landlordByName("Vonovia");
      await http()
        .post("/api/properties/reports")
        .send({ street, houseNumber: "103", postalCode: "12247", city: "Berlin", role: "LANDLORD", landlordId: vonovia.id })
        .expect(401);
      const created = await http()
        .post("/api/properties/reports")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ street, houseNumber: "103", postalCode: "12247", city: "Berlin", role: "LANDLORD", landlordId: vonovia.id, evidenceUrl: "https://example.org/beleg" })
        .expect(201);
      await http()
        .post("/api/properties/reports")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ street: "Kaiser-Wilhelm-Str.", houseNumber: "103", postalCode: "12247", city: "Berlin", role: "LANDLORD", landlordId: vonovia.id })
        .expect(409);

      const pending = (await lookup("103")).body;
      expect(pending).toMatchObject({ status: "none", openReports: 1, parties: [] });

      await app.get(PropertyReportsService).approve(created.body.id, adminId, { landlordId: vonovia.id, validFrom: "2020-01-01" });
      const verified = (await lookup("103")).body;
      expect(verified.status).toBe("verified");
      expect(verified.parties).toEqual([
        expect.objectContaining({ role: "LANDLORD", roleLabel: "Vermieter", status: "current", landlord: expect.objectContaining({ name: "Vonovia" }) }),
      ]);
      // Street spellings resolve to the same building.
      expect((await http().get("/api/properties/lookup").query({ street: "Kaiser-Wilhelm-Str.", houseNumber: "103", postalCode: "12247" }).expect(200)).body.status).toBe("verified");
      const report = await prisma.mappingReport.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(report).toMatchObject({ status: "RESOLVED", contactEmail: null });
    });

    it("Fall 6: a property manager is shown as manager, never as owner or landlord", async () => {
      const privata = await landlordByName("Privata Hausverwaltung GmbH");
      const property = await prisma.property.findFirstOrThrow({ where: { addressKey: addressKey({ postalCode: "12247", street, houseNumber: "103" }) } });
      await prisma.propertyParty.create({
        data: { propertyId: property.id, landlordId: privata.id, role: PropertyRole.MANAGER, source: "manual", verificationStatus: PartyVerificationStatus.VERIFIED },
      });
      const body = (await lookup("103")).body;
      const managerRows = body.parties.filter((p: { landlord: { name: string } }) => p.landlord.name === privata.name);
      expect(managerRows).toEqual([expect.objectContaining({ role: "MANAGER", roleLabel: "Hausverwaltung" })]);
      expect(body.parties.find((p: { role: string }) => p.role === "OWNER")).toBeUndefined();
      const detail = (await http().get(`/api/properties/${property.id}`).expect(200)).body;
      expect(detail.landlord.name).toBe("Vonovia");
    });

    it("unverified and unclear relations are never public", async () => {
      const degewo = await landlordByName("Degewo");
      const property = await prisma.property.findFirstOrThrow({ where: { street } });
      await prisma.propertyParty.create({
        data: { propertyId: property.id, landlordId: degewo.id, role: PropertyRole.OWNER, source: "legacy", verificationStatus: PartyVerificationStatus.UNCLEAR },
      });
      const body = (await lookup("103")).body;
      expect(JSON.stringify(body)).not.toContain("Degewo");
    });

    it("a change of landlord keeps the old one only as former", async () => {
      const property = await prisma.property.findFirstOrThrow({ where: { street } });
      const party = await prisma.propertyParty.findFirstOrThrow({ where: { propertyId: property.id, role: PropertyRole.LANDLORD } });
      await app.get(PropertyReportsService).endRelation(party.id, "2026-01-31T00:00:00Z");
      const body = (await lookup("103")).body;
      expect(body.parties.find((p: { role: string }) => p.role === "LANDLORD")).toBeUndefined();
      expect(body.formerParties).toEqual([
        expect.objectContaining({ role: "LANDLORD", status: "former", statusLabel: "Früher zuständig", validTo: "2026-01-31T00:00:00.000Z" }),
      ]);
      const detail = (await http().get(`/api/properties/${property.id}`).expect(200)).body;
      expect(detail.landlord).toBeNull();
    });
  });

  describe("reviews and identity", () => {
    it("allows one review per user and landlord and rejects unknown categories", async () => {
      const degewo = await landlordByName("Degewo");
      const body = { targetType: "LANDLORD", targetId: degewo.id, title: "Ordentlich", text: "Reparaturen dauern, aber die Kommunikation ist freundlich.", overallRating: 4 };
      await http().post("/api/reviews").set("Authorization", `Bearer ${userToken}`).send({ ...body, categoryRatings: { Lautstärke: 3 } }).expect(400);
      await http().post("/api/reviews").set("Authorization", `Bearer ${userToken}`).send({ ...body, categoryRatings: { Kommunikation: 4, Erreichbarkeit: 3 } }).expect(201);
      await http().post("/api/reviews").set("Authorization", `Bearer ${userToken}`).send({ ...body, categoryRatings: {} }).expect(409);
      const saga = await landlordByName("SAGA Unternehmensgruppe");
      await http().post("/api/reviews").set("Authorization", `Bearer ${userToken}`).send({ ...body, targetId: saga.id, categoryRatings: {} }).expect(400);
    });

    it("public review lists contain no unpublished reviews and no report data", async () => {
      const degewo = await landlordByName("Degewo");
      const list = (await http().get("/api/reviews").query({ targetType: "LANDLORD", targetId: degewo.id, status: "PENDING" }).expect(200)).body;
      expect(list).toEqual([]);
    });

    it("merging keeps old ids working and refuses different LEIs", async () => {
      const merges = app.get(CompanyMergeServiceImpl);
      const vonovia = await landlordByName("Vonovia");
      const treuhand = await landlordByName("Vonovia Immobilien Treuhand GmbH");
      await expect(merges.merge(vonovia.id, treuhand.id, { userId: adminId })).rejects.toThrow("LEI");

      const duplicate = await prisma.landlord.create({
        data: { name: "Degewo AG", slug: "degewo-ag-dup", companyType: "Wohnungsgesellschaft", normalizedName: "degewo", status: RecordStatus.ACTIVE },
      });
      const degewo = await landlordByName("Degewo");
      const { mergeId } = await merges.merge(degewo.id, duplicate.id, { userId: adminId });
      const resolved = (await http().get(`/api/landlords/${duplicate.id}`).expect(200)).body;
      expect(resolved).toMatchObject({ id: degewo.id, redirectedFromId: duplicate.id });
      expect((await http().get("/api/search").query({ q: "degewo" })).body.landlords.filter((l: { name: string }) => l.name.startsWith("Degewo"))).toHaveLength(1);
      await merges.unmerge(mergeId, { userId: adminId });
      expect((await prisma.landlord.findUniqueOrThrow({ where: { id: duplicate.id } })).status).toBe(RecordStatus.ACTIVE);
    });

    it("external experiences are links only, clearly separated from own ratings", async () => {
      const vonovia = await landlordByName("Vonovia");
      const body = (await http().get(`/api/landlords/${vonovia.id}/external`).expect(200)).body;
      expect(body.platforms.map((p: { platform: string }) => p.platform)).toEqual(["trustpilot", "google_maps", "reddit"]);
      expect(body.platforms.every((p: { mode: string }) => p.mode === "link_only")).toBe(true);
      expect(body.platforms[0].searchLinks[0].url).toContain("trustpilot.com/search?query=%22Vonovia%22");
      expect(JSON.stringify(body)).not.toMatch(/rating|stars|score/i);
    });
  });
});
