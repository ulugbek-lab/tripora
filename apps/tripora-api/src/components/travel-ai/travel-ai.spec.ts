import { Logger } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { TravelAiRateLimitGuard } from './travel-ai-rate-limit.guard';
import { AxiosError } from 'axios';
import { AuthGuard } from '../auth/guards/auth.guard';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { AppResolver } from '../../app.resolver';
import { AI_ESTIMATE_LABEL, AI_ITINERARY_WARNING } from '../../libs/dto/travel-ai/travel-ai';
import { TravelAiService } from './travel-ai.service';
import { TravelAiResolver } from './travel-ai.resolver';

const validInput = {
	destination: 'Seoul',
	durationDays: 2,
	budget: 500,
	currency: 'USD',
	travellerCount: 2,
	interests: ['culture'],
};
const validPlan = {
	title: 'Seoul discovery',
	days: [1, 2].map((day) => ({
		day,
		activities: [{ title: 'Museum visit', description: 'Explore local art collections.' }],
		mealSuggestions: ['Try a local cafe'],
		accommodationSuggestions: null,
		estimatedCost: 100,
	})),
};
function envelope(plan: unknown) {
	return { data: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] } };
}

describe('Travel AI first phase', () => {
	let post: jest.Mock;
	let service: TravelAiService;
	const oldKey = process.env.OPENAI_API_KEY;
	const oldModel = process.env.TRAVEL_AI_MODEL;
	beforeEach(() => {
		jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
		jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
		process.env.OPENAI_API_KEY = 'synthetic-test-key';
		process.env.TRAVEL_AI_MODEL = 'synthetic-test-model';
		post = jest.fn().mockResolvedValue(envelope(validPlan));
		service = new TravelAiService({ axiosRef: { post } } as unknown as HttpService);
	});
	afterEach(() => jest.restoreAllMocks());
	afterAll(() => {
		if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = oldKey;
		if (oldModel === undefined) delete process.env.TRAVEL_AI_MODEL;
		else process.env.TRAVEL_AI_MODEL = oldModel;
	});
	it('returns one validated day per request, estimated costs, optional suggestions and a fixed warning', async () => {
		const result = await service.generateTravelItinerary(validInput);
		expect(result.days.map((day) => day.day)).toEqual([1, 2]);
		expect(result.days[0].activities[0].description).toBe('Explore local art collections.');
		expect(result.days[0].accommodationSuggestions).toBeNull();
		expect(result.days[0].estimatedBudget).toEqual({ amount: 100, currency: 'USD', label: AI_ESTIMATE_LABEL });
		expect(result.estimatedTotalBudget.amount).toBe(200);
		expect(result.warning).toBe(AI_ITINERARY_WARNING);
		expect(post.mock.calls[0][1]).toMatchObject({
			store: false,
			model: 'synthetic-test-model',
			response_format: { type: 'json_schema', json_schema: { strict: true } },
		});
		expect(post.mock.calls[0][2]).toMatchObject({ timeout: 30000 });
	});
	it.each([
		{ destination: '' },
		{ destination: '   ' },
		{ durationDays: 0 },
		{ durationDays: 31 },
		{ durationDays: 1.5 },
		{ budget: -1 },
		{ budget: Infinity },
		{ currency: 'usd' },
		{ currency: 'XXX' },
		{ travellerCount: 0 },
		{ interests: [''] },
		{ interests: 'culture' },
		{ interests: Array(21).fill('culture') },
	])('rejects invalid input %j before contacting provider', async (change) => {
		await expect(service.generateTravelItinerary({ ...validInput, ...change } as never)).rejects.toMatchObject({
			status: 400,
		});
		expect(post).not.toHaveBeenCalled();
	});
	it('rejects null input without contacting provider', async () => {
		await expect(service.generateTravelItinerary(null as never)).rejects.toMatchObject({ status: 400 });
		expect(post).not.toHaveBeenCalled();
	});
	it('does not contact provider when configuration is missing', async () => {
		delete process.env.OPENAI_API_KEY;
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({ status: 503 });
		expect(post).not.toHaveBeenCalled();
	});
	it('handles invalid JSON without returning raw provider text', async () => {
		post.mockResolvedValue({
			data: { choices: [{ finish_reason: 'stop', message: { content: 'private provider text, not JSON' } }] },
		});
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({
			status: 502,
			message: 'Travel AI returned invalid itinerary data',
		});
	});
	it.each([
		{},
		null,
		{ title: 'Missing days' },
		{ ...validPlan, days: [] },
		{ ...validPlan, days: [validPlan.days[0]] },
		{ ...validPlan, days: [validPlan.days[0], validPlan.days[0]] },
		{ ...validPlan, days: validPlan.days.map((day) => ({ ...day, activities: [] })) },
		{ ...validPlan, days: validPlan.days.map((day) => ({ ...day, activities: [{ title: 'Missing description' }] })) },
		{ ...validPlan, days: validPlan.days.map((day) => ({ ...day, estimatedCost: -1 })) },
		{ ...validPlan, unexpected: 'untrusted field' },
	])('rejects malformed/incorrect-day provider plan %#', async (plan) => {
		post.mockResolvedValue(envelope(plan));
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({ status: 502 });
	});
	it.each([
		'Visa approval is assured',
		'Flight price is 100 USD',
		'Hotel rooms are available now',
		'Reservation confirmed',
		'Guaranteed safety',
		'Current prices are accurate',
	])('rejects unsupported travel assertion: %s', async (description) => {
		post.mockResolvedValue(
			envelope({
				...validPlan,
				days: validPlan.days.map((day) => ({ ...day, activities: [{ title: 'Activity', description }] })),
			}),
		);
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({
			status: 502,
			message: 'Travel AI returned unsupported travel claims',
		});
	});
	it.each(['ECONNABORTED', 'ETIMEDOUT'])('maps provider timeout %s to a sanitized timeout error', async (code) => {
		post.mockRejectedValue(new AxiosError('sensitive upstream details', code));
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({
			status: 504,
			message: 'Travel AI request timed out',
		});
	});
	it('maps unexpected request failures to a sanitized error', async () => {
		post.mockRejectedValue(new Error('sensitive upstream details'));
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({
			status: 502,
			message: 'Travel AI provider request failed',
		});
	});
	it.each([
		{ data: {} },
		{ data: { choices: [{ finish_reason: 'length', message: { content: '{}' } }] } },
		{ data: { choices: [{ finish_reason: 'stop', message: { refusal: 'provider refusal' } }] } },
	])('rejects incomplete/refused provider envelopes %#', async (response) => {
		post.mockResolvedValue(response);
		await expect(service.generateTravelItinerary(validInput)).rejects.toMatchObject({ status: 502 });
	});
	it('requires authentication on the GraphQL mutation', () => {
		expect(Reflect.getMetadata('__guards__', TravelAiResolver.prototype.generateTravelItinerary)).toContain(AuthGuard);
	});
	it('generates the GraphQL input and nested output contract', async () => {
		const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
		try {
			const schema = await module.get(GraphQLSchemaFactory).create([AppResolver, TravelAiResolver]);
			expect(schema.getMutationType()?.getFields().generateTravelItinerary.type.toString()).toBe('TravelAiItinerary!');
			expect(schema.getType('TravelAiInput')).toBeDefined();
			expect(schema.getType('TravelAiDay')).toBeDefined();
			expect(schema.getType('TravelAiBudgetEstimate')).toBeDefined();
		} finally {
			await module.close();
		}
	});
});

describe('Simple AI request limit', () => {
	function context(memberId: string) {
		const context = new ExecutionContextHost(
			[null, {}, { req: { body: { authMember: { _id: memberId } } } }, {}],
			TravelAiResolver,
			TravelAiResolver.prototype.generateTravelItinerary,
		);
		context.setType('graphql');
		return context;
	}
	it('allows normal AI requests and blocks the sixth request in a minute', () => {
		const guard = new TravelAiRateLimitGuard();
		for (let count = 0; count < 5; count++) expect(guard.canActivate(context('member-one'))).toBe(true);
		expect(() => guard.canActivate(context('member-one'))).toThrow('Too many AI itinerary requests');
		expect(guard.canActivate(context('member-two'))).toBe(true);
		expect(Reflect.getMetadata('__guards__', TravelAiResolver.prototype.generateTravelItinerary)).toEqual([
			AuthGuard,
			TravelAiRateLimitGuard,
		]);
	});
	it('allows requests again when the minute has elapsed', () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
		try {
			const guard = new TravelAiRateLimitGuard();
			for (let count = 0; count < 5; count++) guard.canActivate(context('member-one'));
			clock.mockReturnValue(61000);
			expect(guard.canActivate(context('member-one'))).toBe(true);
		} finally {
			clock.mockRestore();
		}
	});
});
