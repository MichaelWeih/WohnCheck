import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { OutboundHttpModule } from "./common/http/outbound-http.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DirectoryModule } from "./modules/directory/directory.module";
import { DiscoveryModule } from "./modules/discovery/discovery.module";
import { ExternalModule } from "./modules/external/external.module";
import { HealthModule } from "./modules/health/health.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ScoresModule } from "./modules/scores/scores.module";
import { TopicsModule } from "./modules/topics/topics.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting is opt-in per controller (@UseGuards(ThrottlerGuard) + @Throttle); there is no global guard.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    // Global infrastructure used by the feature modules below.
    OutboundHttpModule,
    JobsModule,
    CompaniesModule,
    DirectoryModule,
    ReviewsModule,
    ScoresModule,
    AdminModule,
    DiscoveryModule,
    ExternalModule,
    TopicsModule,
  ],
})
export class AppModule {}
