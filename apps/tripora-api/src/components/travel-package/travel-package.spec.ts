import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { model, Types } from 'mongoose';
import TravelPackageSchema from '../../schemas/TravelPackage.model';
import { TravelPackageInput } from '../../libs/dto/travel-package/travel-package.input';
import { TravelPackageStatus, TravelPackageType } from '../../libs/enums/travel-package.enum';
import { TravelPackageResolver } from './travel-package.resolver';
import { TravelPackageService } from './travel-package.service';
import { Direction } from '../../libs/enums/common.enum';

const valid = {
	packageType: TravelPackageType.GROUP,
	packageCountry: 'Korea',
	packageCity: 'Seoul',
	packageTitle: 'Seoul discovery',
	packagePrice: 100,
	packageCurrency: 'USD',
	packageDurationDays: 3,
	packageMaxTravellers: 10,
	packageAvailableSlots: 5,
	packageImages: ['https://example.com/image.jpg'],
	packageStartDate: new Date('2027-01-01'),
};

describe('TravelPackage contract', () => {
	const PackageModel = model('TravelPackagePhase1Test', TravelPackageSchema);
	it('accepts approved fields and provides counter defaults', async () => {
		expect(await validate(plainToInstance(TravelPackageInput, valid))).toHaveLength(0);
		const doc = new PackageModel({ ...valid, memberId: new Types.ObjectId() });
		await expect(doc.validate()).resolves.toBeUndefined();
		expect(doc.packageViews).toBe(0);
		expect(PackageModel.collection.name).toBe('travelPackages');
		expect(TravelPackageSchema.indexes()).toHaveLength(4);
	});
	it.each([
		{ packageCurrency: 'usd' },
		{ packagePrice: -1 },
		{ packageDurationDays: 0 },
		{ packageMaxTravellers: 0 },
		{ packageAvailableSlots: -1 },
		{ packageTitle: 'bad' },
		{ packageImages: [] },
		{ packageType: 'HOUSE' },
		{ packageStartDate: 'invalid' },
	])('rejects invalid input %j', async (changes) => {
		expect((await validate(plainToInstance(TravelPackageInput, { ...valid, ...changes }))).length).toBeGreaterThan(0);
	});
	it('rejects slots exceeding capacity in the schema', async () => {
		const doc = new PackageModel({ ...valid, packageAvailableSlots: 11, memberId: new Types.ObjectId() });
		await expect(doc.validate()).rejects.toThrow('Available slots exceed maximum travellers');
	});
	it('generates consistent GraphQL types and renamed CRUD operations', async () => {
		const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
		try {
			const schema = await module.get(GraphQLSchemaFactory).create([TravelPackageResolver]);
			expect(schema.getType('TravelPackage')).toBeDefined();
			expect(schema.getType('Property')).toBeUndefined();
			expect(schema.getMutationType()?.getFields().createTravelPackage).toBeDefined();
			expect(schema.getQueryType()?.getFields().getTravelPackages).toBeDefined();
			expect(schema.getQueryType()?.getFields().getFavoriteTravelPackages).toBeDefined();
			expect(schema.getQueryType()?.getFields().getVisitedTravelPackages).toBeDefined();
		} finally {
			await module.close();
		}
	});
});

describe('TravelPackage service boundaries', () => {
	const owner = new Types.ObjectId();
	const id = new Types.ObjectId();
	let current: Record<string, unknown>;
	let query: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; aggregate: jest.Mock; create: jest.Mock };
	let stats: jest.Mock;
	let service: TravelPackageService;
	beforeEach(() => {
		current = {
			...valid,
			_id: id,
			memberId: owner,
			packageStatus: TravelPackageStatus.ACTIVE,
			updatedAt: new Date(),
			packageViews: 0,
		};
		query = {
			findOne: jest.fn(() => ({ lean: () => ({ exec: async () => current }) })),
			findOneAndUpdate: jest.fn(() => ({ exec: async () => current })),
			aggregate: jest.fn(() => ({ exec: async () => [] })),
			create: jest.fn(async (input) => ({ ...current, ...input })),
		};
		stats = jest.fn();
		service = new TravelPackageService(query as never, { memberStatsEditor: stats } as never, {} as never, {} as never);
	});
	it('filters updates by authenticated owner and rejects capacity violations', async () => {
		await expect(service.updateTravelPackage(owner, { _id: id, packageAvailableSlots: 11 })).rejects.toThrow(
			'Available slots',
		);
		expect(query.findOne.mock.calls[0][0].memberId).toEqual(owner);
		expect(query.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('sets sold-out timestamps and clears them when reactivated', async () => {
		await service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.SOLD_OUT });
		expect(query.findOneAndUpdate.mock.calls[0][1].$set.soldOutAt).toBeInstanceOf(Date);
		current.packageStatus = TravelPackageStatus.SOLD_OUT;
		await service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.ACTIVE });
		expect(query.findOneAndUpdate.mock.calls[1][1].$unset).toEqual({ soldOutAt: 1 });
	});
	it('sets soft-delete timestamps and limits hard deletion to deleted records', async () => {
		await service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.DELETE });
		expect(query.findOneAndUpdate.mock.calls[0][1].$set.deletedAt).toBeInstanceOf(Date);
		const findOneAndDelete = jest.fn(() => ({ exec: async () => current }));
		const admin = new TravelPackageService({ findOneAndDelete } as never, {} as never, {} as never, {} as never);
		await admin.removeTravelPackageByAdmin(id);
		expect(findOneAndDelete).toHaveBeenCalledWith({ _id: id, packageStatus: TravelPackageStatus.DELETE });
	});
	it('ignores client counters and timestamps on creation', async () => {
		await service.createTravelPackage(
			owner,
			Object.assign(plainToInstance(TravelPackageInput, valid), {
				memberId: new Types.ObjectId(),
				packageViews: 99,
				soldOutAt: new Date(),
			}),
		);
		expect(query.create.mock.calls[0][0].memberId).toEqual(owner);
		expect(query.create.mock.calls[0][0].packageViews).toBeUndefined();
		expect(query.create.mock.calls[0][0].soldOutAt).toBeUndefined();
	});
	it('rejects creation without an authenticated owner', async () => {
		await expect(
			service.createTravelPackage(null as never, plainToInstance(TravelPackageInput, valid)),
		).rejects.toThrow();
		expect(query.create).not.toHaveBeenCalled();
	});
	it('rejects an update when the owner lookup finds no package', async () => {
		query.findOne.mockReturnValue({ lean: () => ({ exec: async () => null }) });
		await expect(service.updateTravelPackage(owner, { _id: id, packageTitle: 'Changed title' })).rejects.toThrow();
		expect(query.findOne.mock.calls[0][0].memberId).toEqual(owner);
		expect(query.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('rejects a stale update without changing member counters', async () => {
		query.findOneAndUpdate.mockReturnValue({ exec: async () => null });
		await expect(
			service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.DELETE }),
		).rejects.toThrow();
		expect(query.findOneAndUpdate.mock.calls[0][0].updatedAt).toEqual(current.updatedAt);
		expect(stats).not.toHaveBeenCalled();
	});
	it('returns an empty public page safely for anonymous callers', async () => {
		await expect(service.getTravelPackages(null, { page: 1, limit: 10, search: {} as never })).resolves.toEqual({
			list: [],
			metaCounter: [],
		});
		const pipeline = query.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.packageStatus).toBe(TravelPackageStatus.ACTIVE);
	});
	it('escapes text and refuses unknown or mixed-currency price sorts', async () => {
		await service.getTravelPackages(null, { page: 1, limit: 10, search: { text: 'a.b' } as never });
		expect(query.aggregate.mock.calls[0][0][0].$match.$or[0].packageTitle.$regex.source).toBe('a\\.b');
		await expect(
			service.getTravelPackages(null, {
				page: 1,
				limit: 10,
				sort: 'unknown',
				direction: Direction.DESC,
				search: {} as never,
			}),
		).rejects.toThrow('Invalid package sort');
		await expect(
			service.getTravelPackages(null, { page: 1, limit: 10, sort: 'packagePrice', search: {} as never }),
		).rejects.toThrow('currency');
	});
});

describe('TravelPackage history direct references', () => {
	it.each(['favorite', 'visited'] as const)('uses consistent %s collection and aliases', async (kind) => {
		const memberId = new Types.ObjectId();
		const alias = kind === 'favorite' ? 'favoriteTravelPackage' : 'visitedTravelPackage';
		const travelPackage = { _id: new Types.ObjectId(), packageTitle: 'Travel history' };
		const aggregate = jest.fn((_pipeline: Record<string, unknown>[]) => ({
			exec: async () => [{ list: [{ [alias]: travelPackage }], metaCounter: [{ total: 1 }] }],
		}));
		const result =
			kind === 'favorite'
				? await new LikeService({ aggregate } as never).getFavoriteTravelPackages(memberId, { page: 1, limit: 10 })
				: await new ViewService({ aggregate } as never).getVisitedTravelPackages(memberId, { page: 1, limit: 10 });
		const pipeline = aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toEqual(
			kind === 'favorite'
				? { memberId, likeGroup: LikeGroup.TRAVEL_PACKAGE }
				: { memberId, viewGroup: ViewGroup.TRAVEL_PACKAGE },
		);
		expect(pipeline[2].$lookup).toMatchObject({ from: 'travelPackages', as: alias });
		expect(pipeline[4].$match).toEqual({ [`${alias}.packageStatus`]: TravelPackageStatus.ACTIVE });
		const facet = pipeline[5].$facet as { list: { $lookup?: Record<string, unknown> }[] };
		const list = facet.list;
		expect(list[2].$lookup).toMatchObject({ localField: `${alias}.memberId`, as: `${alias}.memberData` });
		expect(result).toEqual({ list: [travelPackage], metaCounter: [{ total: 1 }] });
	});
});

describe('TravelPackage history empty results', () => {
	it.each(['favorite', 'visited'] as const)('returns an empty %s page', async (kind) => {
		const aggregate = jest.fn(() => ({ exec: async () => [] }));
		const memberId = new Types.ObjectId();
		const result =
			kind === 'favorite'
				? await new LikeService({ aggregate } as never).getFavoriteTravelPackages(memberId, { page: 1, limit: 10 })
				: await new ViewService({ aggregate } as never).getVisitedTravelPackages(memberId, { page: 1, limit: 10 });
		expect(result).toEqual({ list: [], metaCounter: [] });
	});
});
