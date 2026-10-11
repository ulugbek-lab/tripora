import { Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Resolver()
export class AuthResolver {
	constructor(private readonly authService: AuthService) {}

	@Mutation(() => String)
	public refreshToken(@Context() context: { req: Request; res: Response }): Promise<string> {
		return this.authService.refreshToken(context.req, context.res);
	}

	@Mutation(() => Boolean)
	public logout(@Context() context: { res: Response }): boolean {
		this.authService.clearRefreshCookie(context.res);
		return true;
	}
}
