import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { InMemoryRateLimiter, RATE_LIMITS } from '../../libs/rate-limit';

@Injectable()
export class TravelAiRateLimitGuard implements CanActivate {
	constructor(private readonly limiter: InMemoryRateLimiter = new InMemoryRateLimiter()) {}

	canActivate(context: ExecutionContext): boolean {
		const request = GqlExecutionContext.create(context).getContext<{
			req: { body?: { authMember?: { _id?: { toString(): string } } } };
		}>().req;
		const memberId = request.body?.authMember?._id?.toString();
		if (!memberId) throw new UnauthorizedException('Authentication required');
		this.limiter.check(
			'AI_LIMIT',
			memberId,
			RATE_LIMITS.AI_LIMIT,
			'Too many AI itinerary requests. Try again shortly.',
		);
		return true;
	}
}
