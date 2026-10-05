import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger: Logger = new Logger();
	public intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const requestTime = Date.now();
		const requestType = context.getType<GqlContextType>();

		if (requestType === 'http') {
			// Develop if needed!
		} else if (requestType === 'graphql') {
			// 1. Print request
			const gqlContext = GqlExecutionContext.create(context);
			this.logger.log(`${this.stringify(gqlContext.getContext().req.body)}`, 'REQUEST');

			// 2. Error handling via Graphql
			// 3. No errors, giving Response below
			return next.handle().pipe(
				tap(() => {
					const responseTime = Date.now() - requestTime;
					this.logger.log(`${responseTime}ms \n\n`, 'RESPONSE');
				}),
			);
		}
		return next.handle();
	}
	private stringify(context: ExecutionContext): string {
		return JSON.stringify(context).slice(0, 75);
	}
}
