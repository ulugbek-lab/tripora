import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { WithoutGuard } from './without.guard';

describe('Guard context handling', () => {
	const authService = { verifyToken: jest.fn() } as unknown as AuthService;
	const context = { contextType: 'http' } as unknown as ExecutionContext;
	it('denies unsupported contexts for required authentication', async () => {
		await expect(new AuthGuard(authService).canActivate(context)).resolves.toBe(false);
	});
	it('denies unsupported contexts when a role is required', async () => {
		const reflector = new Reflector();
		jest.spyOn(reflector, 'get').mockReturnValue(['AGENT']);
		const roleContext = { contextType: 'http', getHandler: () => () => {} } as unknown as ExecutionContext;
		await expect(new RolesGuard(reflector, authService).canActivate(roleContext)).resolves.toBe(false);
	});
	it('allows unsupported contexts for optional authentication', async () => {
		await expect(new WithoutGuard(authService).canActivate(context)).resolves.toBe(true);
	});
	it('rejects an unresolved member without dereferencing it', async () => {
		const reflector = new Reflector();
		jest.spyOn(reflector, 'get').mockReturnValue(['AGENT']);
		authService.verifyToken = jest.fn().mockResolvedValue(null);
		const roleContext = {
			contextType: 'graphql',
			getHandler: () => () => {},
			getArgByIndex: () => ({ req: { headers: { authorization: 'Bearer test' } } }),
		} as unknown as ExecutionContext;
		await expect(new RolesGuard(reflector, authService).canActivate(roleContext)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
	});
});
