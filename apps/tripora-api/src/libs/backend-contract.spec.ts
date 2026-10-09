import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { isEnumType, isInputObjectType, parse, validate as validateGraphQL } from 'graphql';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { model, Types } from 'mongoose';
import BoardArticleSchema from '../schemas/BoardArticle.model';
import { BoardArticleCategory, BoardArticleStatus } from './enums/board-article.enum';
import {
	BoardArticleInput,
	BoardArticlesInquiry,
	AllBoardArticlesInquiry,
} from './dto/board-article/board-article.input';
import { TravelPackagesInquiry } from './dto/travel-package/travel-package.input';
import { TravelPackageResolver } from '../components/travel-package/travel-package.resolver';
import { TravelPackageService } from '../components/travel-package/travel-package.service';
import { BoardArticleResolver } from '../components/board-article/board-article.resolver';
import { BoardArticleService } from '../components/board-article/board-article.service';
import { TravelPackageStatus } from './enums/travel-package.enum';

const categories = ['TRAVEL_STORY', 'DESTINATION', 'TRAVEL_TIPS', 'QUESTION'];
describe('Frontend migration backend contracts', () => {
	const ArticleModel = model('ContractArticleTest', BoardArticleSchema);
	it.each(categories)('accepts %s consistently in input, schema, and inquiries', async (articleCategory) => {
		const fields = {
			articleCategory,
			articleTitle: 'Travel experience',
			articleContent: 'An account of a local journey.',
		};
		expect(await validate(plainToInstance(BoardArticleInput, fields))).toHaveLength(0);
		await expect(new ArticleModel({ ...fields, memberId: new Types.ObjectId() }).validate()).resolves.toBeUndefined();
		expect(
			await validate(plainToInstance(BoardArticlesInquiry, { page: 1, limit: 10, search: { articleCategory } })),
		).toHaveLength(0);
		expect(
			await validate(plainToInstance(AllBoardArticlesInquiry, { page: 1, limit: 10, search: { articleCategory } })),
		).toHaveLength(0);
	});
	it.each(['FREE', 'RECOMMEND', 'NEWS', 'HUMOR'])(
		'rejects obsolete %s in DTOs and Mongoose',
		async (articleCategory) => {
			const fields = {
				articleCategory,
				articleTitle: 'Travel experience',
				articleContent: 'Travel experience content',
			};
			expect(await validate(plainToInstance(BoardArticleInput, fields))).not.toHaveLength(0);
			expect(
				await validate(plainToInstance(BoardArticlesInquiry, { page: 1, limit: 10, search: { articleCategory } })),
			).not.toHaveLength(0);
			expect(
				await validate(plainToInstance(AllBoardArticlesInquiry, { page: 1, limit: 10, search: { articleCategory } })),
			).not.toHaveLength(0);
			await expect(new ArticleModel({ ...fields, memberId: new Types.ObjectId() }).validate()).rejects.toThrow();
		},
	);
	it.each([
		[{ packageCurrency: 'USD' }, { packageCurrency: 'USD' }],
		[{ priceRange: { start: 500, end: 2000 } }, { packagePrice: { $gte: 500, $lte: 2000 } }],
		[
			{ packageCurrency: 'USD', priceRange: { start: 500, end: 2000 } },
			{ packageCurrency: 'USD', packagePrice: { $gte: 500, $lte: 2000 } },
		],
	] as const)('adds the expected MongoDB currency/price match %#', async (search, expected) => {
		const aggregate = jest.fn((_pipeline: Record<string, unknown>[]) => ({
			exec: async () => [{ list: [], metaCounter: [] }],
		}));
		const service = new TravelPackageService({ aggregate } as never, {} as never, {} as never, {} as never);
		const input = plainToInstance(TravelPackagesInquiry, { page: 1, limit: 10, search });
		expect(await validate(input)).toHaveLength(0);
		await service.getTravelPackages(null, input);
		expect(aggregate.mock.calls[0][0][0].$match).toEqual({ packageStatus: TravelPackageStatus.ACTIVE, ...expected });
	});
	it('rejects currency values outside the existing storage allowlist', async () => {
		for (const packageCurrency of ['usd', 'INVALID']) {
			expect(
				await validate(plainToInstance(TravelPackagesInquiry, { page: 1, limit: 10, search: { packageCurrency } })),
			).not.toHaveLength(0);
		}
	});
	it('public and admin article filters use the new enum without changing the pipelines', async () => {
		const aggregate = jest.fn((_pipeline: Record<string, unknown>[]) => ({
			exec: async () => [{ list: [], metaCounter: [] }],
		}));
		const service = new BoardArticleService({ aggregate } as never, {} as never, {} as never, {} as never);
		await service.getBoardArticles(new Types.ObjectId(), {
			page: 1,
			limit: 10,
			search: { articleCategory: BoardArticleCategory.TRAVEL_STORY },
		});
		expect(aggregate.mock.calls[0][0][0].$match).toEqual({
			articleStatus: BoardArticleStatus.ACTIVE,
			articleCategory: 'TRAVEL_STORY',
		});
		await service.getAllBoardArticlesByAdmin(new Types.ObjectId(), {
			page: 1,
			limit: 10,
			search: { articleCategory: BoardArticleCategory.QUESTION },
		});
		expect(aggregate.mock.calls[1][0][0].$match).toEqual({ articleCategory: 'QUESTION' });
	});
	it('generates exactly four categories and optional public currency search', async () => {
		const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
		try {
			const schema = await module.get(GraphQLSchemaFactory).create([TravelPackageResolver, BoardArticleResolver]);
			const category = schema.getType('BoardArticleCategory');
			expect(isEnumType(category)).toBe(true);
			if (!isEnumType(category)) throw new Error('Expected category enum');
			expect(category.getValues().map((value) => value.name)).toEqual(categories);
			const search = schema.getType('TravelPackageSearch');
			if (!isInputObjectType(search)) throw new Error('Expected public search input');
			expect(search.getFields().packageCurrency.type.toString()).toBe('String');
			for (const name of ['AgentTravelPackageSearch', 'AdminTravelPackageSearch']) {
				const input = schema.getType(name);
				if (!isInputObjectType(input)) throw new Error('Expected search input');
				expect(input.getFields().packageCurrency).toBeUndefined();
			}
			const query = parse(
				'{ getTravelPackages(input: {page:1,limit:10,search:{packageCurrency:"USD",priceRange:{start:500,end:2000}}}) {list {_id packageCurrency packagePrice} metaCounter {total}} getBoardArticles(input:{page:1,limit:10,search:{articleCategory:TRAVEL_STORY}}) {list {_id articleCategory} metaCounter {total}} }',
			);
			expect(validateGraphQL(schema, query)).toHaveLength(0);
		} finally {
			await module.close();
		}
	});
});
