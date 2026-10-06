import { RateLimitModule } from '../../libs/rate-limit';
import { TravelAiRateLimitGuard } from './travel-ai-rate-limit.guard';
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { TravelAiResolver } from './travel-ai.resolver';
import { TravelAiService } from './travel-ai.service';

@Module({
	imports: [RateLimitModule, AuthModule, HttpModule],
	providers: [TravelAiResolver, TravelAiService, TravelAiRateLimitGuard],
})
export class TravelAiModule {}
