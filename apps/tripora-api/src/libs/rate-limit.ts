import { CanActivate, ExecutionContext, Injectable, Module } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

// Requests per minute. Keep all categories here rather than in individual resolvers.
export const RATE_LIMITS = {
	AUTH_LIMIT: { login: 5, signup: 3 },
	AI_LIMIT: 5,
	PUBLIC_API_LIMIT: 120,
	WINDOW_MS: 60_000,
} as const;

@Injectable()
export class InMemoryRateLimiter {
	private readonly requests = new Map<string, { count: number; resetAt: number }>();

	check(bucket: string, identity: string, limit: number, message = 'Too many requests. Try again shortly.'): void {
		const now = Date.now();
		for (const [key, entry] of this.requests) {
			if (entry.resetAt <= now) this.requests.delete(key);
		}
		const key = `${bucket}:${identity}`;
		const entry = this.requests.get(key) ?? { count: 0, resetAt: now + RATE_LIMITS.WINDOW_MS };
		if (entry.count >= limit) {
			throw new GraphQLError(message, {
				extensions: { code: 'RATE_LIMITED', retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) },
			});
		}
		entry.count++;
		this.requests.set(key, entry);
	}
}

@Injectable()
export class OperationRateLimitGuard implements CanActivate {
	constructor(private readonly limiter: InMemoryRateLimiter) {}

	canActivate(context: ExecutionContext): boolean {
		const gql = GqlExecutionContext.create(context);
		const operation = gql.getInfo().fieldName;
		let limit: number;
		let category: string;
		if (operation === 'login' || operation === 'signup') {
			limit = RATE_LIMITS.AUTH_LIMIT[operation];
			category = 'AUTH_LIMIT';
		} else if (operation === 'getTravelPackages' || operation === 'getTravelPackage') {
			limit = RATE_LIMITS.PUBLIC_API_LIMIT;
			category = 'PUBLIC_API_LIMIT';
		} else return true;
		const request = gql.getContext<{
			req: { ip?: string; socket?: { remoteAddress?: string } };
		}>().req;
		// Express req.ip uses its configured proxy policy; never read arbitrary forwarded headers here.
		const identity = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
		this.limiter.check(`${category}:${operation}`, identity, limit);
		return true;
	}
}

@Module({
	providers: [InMemoryRateLimiter, OperationRateLimitGuard],
	exports: [InMemoryRateLimiter, OperationRateLimitGuard],
})
export class RateLimitModule {}
