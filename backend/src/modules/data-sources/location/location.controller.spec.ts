import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { DataSourcesController } from "../data-sources.controller";
import { DataSourcesService } from "../data-sources.service";
import {
  ADDRESS_RATE_LIMIT,
  LocationController,
  NEARBY_RATE_LIMIT,
} from "./location.controller";
import { LocationProviderException } from "./location-errors";
import { LocationService } from "./location.service";

describe("location endpoints", () => {
  const service = { geocode: jest.fn(), nearby: jest.fn() };
  let app: INestApplication;

  // A fresh application per test: the rate limiter counts per application instance.
  beforeEach(async () => {
    service.geocode.mockResolvedValue({ query: "", suggestions: [] });
    service.nearby.mockResolvedValue({ places: [] });
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
      ],
      controllers: [LocationController, DataSourcesController],
      providers: [
        { provide: LocationService, useValue: service },
        { provide: DataSourcesService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    // Same pipe as in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  describe("GET /data-sources/nearby-places", () => {
    it("passes validated numbers to the service and defaults the radius to 1 km", async () => {
      await get("/data-sources/nearby-places?lat=52.4384&lon=13.3496&radius=2000").expect(200);
      expect(service.nearby).toHaveBeenLastCalledWith(52.4384, 13.3496, 2000);
      await get("/data-sources/nearby-places?lat=52.4384&lon=13.3496").expect(200);
      expect(service.nearby).toHaveBeenLastCalledWith(52.4384, 13.3496, 1000);
    });

    it.each([
      ["a missing latitude", "lon=13.3&radius=1000"],
      ["a missing longitude", "lat=52.4&radius=1000"],
      ["text instead of a number", "lat=abc&lon=13.3"],
      ["an empty coordinate", "lat=&lon=13.3"],
      ["a latitude beyond the pole", "lat=90.01&lon=13.3"],
      ["a longitude beyond the date line", "lat=52.4&lon=-180.5"],
      ["an infinite coordinate", "lat=Infinity&lon=13.3"],
      ["a radius that is not offered", "lat=52.4&lon=13.3&radius=750"],
      ["a radius above the maximum", "lat=52.4&lon=13.3&radius=50000"],
      ["an unknown parameter", "lat=52.4&lon=13.3&provider=demo"],
    ])("rejects %s with HTTP 400", async (_name, query) => {
      await get(`/data-sources/nearby-places?${query}`).expect(400);
      expect(service.nearby).not.toHaveBeenCalled();
    });

    it("accepts the boundary coordinates", async () => {
      await get("/data-sources/nearby-places?lat=-90&lon=180&radius=500").expect(200);
    });

    it(`allows ${NEARBY_RATE_LIMIT} requests per minute and client`, async () => {
      for (let i = 0; i < NEARBY_RATE_LIMIT; i++)
        await get("/data-sources/nearby-places?lat=52&lon=13").expect(200);
      await get("/data-sources/nearby-places?lat=52&lon=13").expect(429);
      expect(service.nearby).toHaveBeenCalledTimes(NEARBY_RATE_LIMIT);
    });

    it.each([
      ["TIMEOUT", 504],
      ["QUOTA", 503],
      ["NOT_CONFIGURED", 503],
      ["UNAVAILABLE", 503],
    ] as const)("returns the machine-readable code %s", async (code, status) => {
      service.nearby.mockRejectedValue(new LocationProviderException(code, 30));
      const response = await get("/data-sources/nearby-places?lat=52&lon=13").expect(status);
      expect(response.body).toMatchObject({
        statusCode: status,
        code,
        retryAfterSeconds: 30,
      });
      expect(typeof response.body.message).toBe("string");
    });
  });

  describe("GET /data-sources/geocode", () => {
    it("resolves a submitted address explicitly", async () => {
      await get(`/data-sources/geocode?q=${encodeURIComponent("Kaiser-Wilhelm-Straße 103")}`).expect(200);
      expect(service.geocode).toHaveBeenCalledWith("Kaiser-Wilhelm-Straße 103", false);
    });

    it.each([
      ["a missing query", ""],
      ["a query below three characters", "q=ab"],
      ["a query above 160 characters", `q=${"a".repeat(161)}`],
    ])("rejects %s with HTTP 400", async (_name, query) => {
      await get(`/data-sources/geocode?${query}`).expect(400);
      expect(service.geocode).not.toHaveBeenCalled();
    });

    it(`allows ${ADDRESS_RATE_LIMIT} requests per minute and client`, async () => {
      for (let i = 0; i < ADDRESS_RATE_LIMIT; i++)
        await get("/data-sources/geocode?q=Berlin").expect(200);
      await get("/data-sources/geocode?q=Berlin").expect(429);
    });
  });

  describe("GET /data-sources/address-suggestions", () => {
    it("stays available and now answers from the geocoding provider", async () => {
      await get("/data-sources/address-suggestions?q=Kastanienallee%2012%20Berlin").expect(200);
      expect(service.geocode).toHaveBeenCalledWith("Kastanienallee 12 Berlin", true);
    });

    it("still tolerates a missing query and the former refresh parameter", async () => {
      await get("/data-sources/address-suggestions").expect(200);
      expect(service.geocode).toHaveBeenLastCalledWith("", true);
      await get("/data-sources/address-suggestions?q=Berlin&refresh=true").expect(200);
    });

    it(`allows ${ADDRESS_RATE_LIMIT} requests per minute and client`, async () => {
      for (let i = 0; i < ADDRESS_RATE_LIMIT; i++)
        await get("/data-sources/address-suggestions?q=Berlin").expect(200);
      await get("/data-sources/address-suggestions?q=Berlin").expect(429);
    });
  });
});
