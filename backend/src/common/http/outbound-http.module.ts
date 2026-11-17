import { Global, Module } from "@nestjs/common";
import { OutboundHttpServiceImpl } from "./outbound-http.service";
import { OUTBOUND_FETCH, OutboundFetch, OutboundHttpService } from "./outbound-http.types";

/**
 * Default transport: the global fetch, looked up per call so the module can be loaded on any runtime
 * and tests that replace `globalThis.fetch` are honoured.
 */
const defaultOutboundFetch: OutboundFetch = (url, init) => fetch(url, init);

/**
 * Shared outbound HTTP client (contract: outbound-http.types.ts). Global: every module can inject OutboundHttpService.
 * Needs the global PrismaModule (politeness state is persisted in table OutboundHostState).
 * Tests replace the network with `.overrideProvider(OUTBOUND_FETCH).useValue(fakeFetch)`.
 */
@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    { provide: OUTBOUND_FETCH, useValue: defaultOutboundFetch },
    { provide: OutboundHttpService, useClass: OutboundHttpServiceImpl },
  ],
  exports: [OutboundHttpService, OUTBOUND_FETCH],
})
export class OutboundHttpModule {}
