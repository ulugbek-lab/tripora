import { TravelAiRateLimitGuard } from './travel-ai-rate-limit.guard';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TravelAiInput } from '../../libs/dto/travel-ai/travel-ai.input';
import { TravelAiItinerary } from '../../libs/dto/travel-ai/travel-ai';
import { TravelAiService } from './travel-ai.service';

@Resolver()
export class TravelAiResolver {
	constructor(private readonly travelAiService: TravelAiService) {}
	@UseGuards(AuthGuard, TravelAiRateLimitGuard)
	@Mutation(() => TravelAiItinerary)
	async generateTravelItinerary(@Args('input') input: TravelAiInput): Promise<TravelAiItinerary> {
		return this.travelAiService.generateTravelItinerary(input);
	}
}
