import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { InMemoryRateLimiter, OperationRateLimitGuard, RATE_LIMITS } from './rate-limit';
import { MemberResolver } from '../components/member/member.resolver';
import { TravelPackageResolver } from '../components/travel-package/travel-package.resolver';
import { WithoutGuard } from '../components/auth/guards/without.guard';

function context(operation: string, ip = 'test-client') {
	const context = new ExecutionContextHost(
		[null, {}, { req: { ip, headers: { 'x-forwarded-for': 'untrusted-client' } } }, { fieldName: operation }],
		MemberResolver,
		MemberResolver.prototype.login,
	);
	context.setType('graphql');
	return context;
}

describe('Simple auth and public API limits', () => {
	it.each(['login', 'signup'] as const)(
		'blocks excessive %s requests with an account-independent error',
		(operation) => {
			const guard = new OperationRateLimitGuard(new InMemoryRateLimiter());
			for (let count = 0; count < RATE_LIMITS.AUTH_LIMIT[operation]; count++)
				expect(guard.canActivate(context(operation))).toBe(true);
			expect(() => guard.canActivate(context(operation))).toThrow('Too many requests. Try again shortly.');
			expect(guard.canActivate(context(operation, 'another-client'))).toBe(true);
			expect(Reflect.getMetadata('__guards__', MemberResolver.prototype[operation])).toContain(OperationRateLimitGuard);
		},
	);
	it('normal login/signup still forward to the existing services', async () => {
		const guard = new OperationRateLimitGuard(new InMemoryRateLimiter());
		const member = {
			login: jest.fn(async () => ({ memberNick: 'demo' })),
			signup: jest.fn(async () => ({ memberNick: 'demo' })),
		};
		const resolver = new MemberResolver(member as never);
		const login = { memberNick: 'demo', memberPassword: 'test-only' };
		const signup = { ...login, memberPhone: 'test-only' };
		expect(guard.canActivate(context('login'))).toBe(true);
		await resolver.login(login);
		expect(guard.canActivate(context('signup'))).toBe(true);
		await resolver.signup(signup);
		expect(member.login).toHaveBeenCalledWith(login);
		expect(member.signup).toHaveBeenCalledWith(signup);
	});
	it('allows normal package browsing and eventually blocks excessive list requests', () => {
		const guard = new OperationRateLimitGuard(new InMemoryRateLimiter());
		for (let count = 0; count < RATE_LIMITS.PUBLIC_API_LIMIT; count++)
			expect(guard.canActivate(context('getTravelPackages'))).toBe(true);
		expect(() => guard.canActivate(context('getTravelPackages'))).toThrow('Too many requests');
		expect(guard.canActivate(context('getTravelPackage'))).toBe(true);
		expect(guard.canActivate(context('login'))).toBe(true);
		expect(Reflect.getMetadata('__guards__', TravelPackageResolver.prototype.getTravelPackages)).toEqual([
			OperationRateLimitGuard,
			WithoutGuard,
		]);
	});
});
