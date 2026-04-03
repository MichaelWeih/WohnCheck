import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DirectoryModule } from "./modules/directory/directory.module";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ScoresModule } from "./modules/scores/scores.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DirectoryModule,
    ReviewsModule,
    ScoresModule,
    AdminModule,
  ],
})
export class AppModule {}
