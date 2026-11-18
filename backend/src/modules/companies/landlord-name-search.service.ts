import { Injectable } from "@nestjs/common";
import { CompanyKind, Prisma, RecordStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LandlordNameMatch, LandlordNameSearchService } from "./company.types";
import { splitNameTokens } from "./name-tokens";
import { normalizeCompanyName, normalizeSearchText } from "./normalization";

type Row = { landlordId: string; score: number; matchedAlias: string | null };

/** Default threshold of `<%` (word similarity) for public search; the resolver passes its own minScore. */
const DEFAULT_MIN_SCORE = 0.45;
/** Queries of industry words only ("Deutsche Wohnen", "Hausverwaltung") need a much closer match. */
const GENERIC_MIN_SCORE = 0.75;

/**
 * Fuzzy name search over Landlord.normalizedName and LandlordAlias.normalizedName with pg_trgm
 * (docs/vermieter-verzeichnis.md section 3.5). Uses the GIN trigram indexes through the `<%` operator;
 * the threshold is set with SET LOCAL inside the same transaction. Prefix matches cover short inputs.
 *
 * Ranking: exact core name 1.2, exact alias 1.1, prefix 1.0, otherwise the trigram word similarity (0..1).
 */
@Injectable()
export class LandlordNameSearchServiceImpl implements LandlordNameSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    options: { statuses: RecordStatus[]; limit: number; kind?: CompanyKind; state?: string; minScore?: number },
    tx?: Prisma.TransactionClient,
  ): Promise<LandlordNameMatch[]> {
    // Legal forms are removed like on the stored side ("Vonovia SE" -> "vonovia"); a query consisting only of
    // a legal form falls back to the plain folded text.
    const core = normalizeCompanyName(query).normalized || normalizeSearchText(query);
    if (core.length < 2 || options.statuses.length === 0) return [];

    const limit = Math.min(Math.max(options.limit, 1), 100);
    // Similarity is measured on the words that identify a company: "Zzyzx Wohnbau" must not match every
    // "... Wohnbau GmbH" through the industry word. Exact and prefix matches still use the whole core name.
    const distinguishing = splitNameTokens(core.split(" ")).distinguishing;
    const term = distinguishing.length ? distinguishing.join(" ") : core;
    const threshold = Math.min(
      Math.max(options.minScore ?? (distinguishing.length ? DEFAULT_MIN_SCORE : GENERIC_MIN_SCORE), 0.1),
      1,
    );
    const prefix = `${core.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const kindFilter = options.kind ? Prisma.sql`AND l."kind" = ${options.kind}::"CompanyKind"` : Prisma.empty;
    const stateFilter = options.state
      ? Prisma.sql`AND (l."state" = ${options.state} OR ${options.state} = ANY(l."operatingStates"))`
      : Prisma.empty;
    const statuses = Prisma.sql`${options.statuses}::"RecordStatus"[]`;

    const run = async (client: Prisma.TransactionClient) => {
      // SET LOCAL does not accept bind parameters; the value is a clamped number, not user input.
      await client.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${threshold.toFixed(2)}`);
      return client.$queryRaw<Row[]>`
        WITH hits AS (
          SELECT l."id" AS "landlordId",
                 CASE WHEN l."normalizedName" = ${core} THEN 1.2
                      WHEN l."normalizedName" LIKE ${prefix} THEN 1.0
                      ELSE word_similarity(${term}, l."normalizedName") END AS score,
                 NULL::text AS "matchedAlias"
          FROM "Landlord" l
          WHERE l."status" = ANY(${statuses}) ${kindFilter} ${stateFilter}
            AND (${term} <% l."normalizedName" OR l."normalizedName" LIKE ${prefix})
          UNION ALL
          SELECT l."id",
                 CASE WHEN a."normalizedName" = ${core} THEN 1.1
                      WHEN a."normalizedName" LIKE ${prefix} THEN 0.95
                      ELSE word_similarity(${term}, a."normalizedName") * 0.98 END,
                 a."name"
          FROM "LandlordAlias" a
          JOIN "Landlord" l ON l."id" = a."landlordId"
          WHERE l."status" = ANY(${statuses}) ${kindFilter} ${stateFilter}
            AND (${term} <% a."normalizedName" OR a."normalizedName" LIKE ${prefix})
        ),
        best AS (
          SELECT DISTINCT ON ("landlordId") "landlordId", score, "matchedAlias"
          FROM hits
          ORDER BY "landlordId", score DESC, "matchedAlias" NULLS FIRST
        )
        SELECT b."landlordId", b.score::float8 AS score, b."matchedAlias"
        FROM best b JOIN "Landlord" l ON l."id" = b."landlordId"
        ORDER BY b.score DESC, l."relevance" ASC, l."name" ASC
        LIMIT ${limit}`;
    };

    const rows = tx ? await run(tx) : await this.prisma.$transaction((client) => run(client));
    return rows.map((row) => ({
      landlordId: row.landlordId,
      score: Math.min(1, Number(row.score)),
      matchedAlias: row.matchedAlias,
    }));
  }
}
