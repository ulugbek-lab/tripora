import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Injectable()
export class TravelAiRateLimitGuard implements CanActivate {
	// Small per-process limit; no Redis or distributed infrastructure in this phase.
	private readonly limit = 5;
	private readonly windowMs = 60_000;
	private readonly requests = new Map<string, { count: number; resetAt: number }>();

	canActivate(context: ExecutionContext): boolean {
		const request = GqlExecutionContext.create(context).getContext<{
			req: { body?: { authMember?: { _id?: { toString(): string } } } };
		}>().req;
		const memberId = request.body?.authMember?._id?.toString();
		if (!memberId) throw new UnauthorizedException('Authentication required');
		const now = Date.now();
		for (const [key, entry] of this.requests) {
			if (entry.resetAt <= now) this.requests.delete(key);
		}
		const entry = this.requests.get(memberId) ?? { count: 0, resetAt: now + this.windowMs };
		if (entry.count >= this.limit) {
			throw new GraphQLError('Too many AI itinerary requests. Try again shortly.', {
				extensions: { code: 'RATE_LIMITED', retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) },
			});
		}
		entry.count++;
		this.requests.set(memberId, entry);
		return true;
	}
}
