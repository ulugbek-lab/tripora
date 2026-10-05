import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { TravelPackageService } from './travel-package.service';
import { TravelPackageResolver } from './travel-package.resolver';
import { TravelPackageInput, TravelPackagesInquiry } from '../../libs/dto/travel-package/travel-package.input';
import { TravelPackageStatus, TravelPackageType } from '../../libs/enums/travel-package.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { CommentGroup, CommentStatus } from '../../libs/enums/comment.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { Direction } from '../../libs/enums/common.enum';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { MemberService } from '../member/member.service';
import { MemberResolver } from '../member/member.resolver';
import { CommentService } from '../comment/comment.service';
import { CommentResolver } from '../comment/comment.resolver';
import { FollowResolver } from '../follow/follow.resolver';
import { BoardArticleResolver } from '../board-article/board-article.resolver';
import { BatchService } from 'apps/tripora-batch/src/batch.service';

const owner = new Types.ObjectId();
const viewer = new Types.ObjectId();
const id = new Types.ObjectId();
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
	packageImages: ['image.jpg'],
	packageStartDate: new Date('2027-01-01'),
};
const duplicate = Object.assign(new Error('duplicate key'), { code: 11000 });
function fixture(status = TravelPackageStatus.ACTIVE) {
	const current = { ...valid, _id: id, memberId: owner, packageStatus: status, packageViews: 0, updatedAt: new Date() };
	const model = {
		create: jest.fn(async (data) => ({ ...current, ...data })),
		findOne: jest.fn(() => ({ exec: async () => current, lean: () => ({ exec: async () => ({ ...current }) }) })),
		findOneAndUpdate: jest.fn(() => ({ exec: async () => current })),
		findOneAndDelete: jest.fn(() => ({ exec: async () => current })),
		aggregate: jest.fn((_pipeline: Record<string, unknown>[]) => ({ exec: async () => [] })),
	};
	const member = {
		memberStatsEditor: jest.fn(),
		getMember: jest.fn(async () => ({ _id: owner })),
		checkSubscription: jest.fn(async () => [{ myFollowing: true }]),
	};
	const view = { recordView: jest.fn(async () => ({ _id: new Types.ObjectId() })) };
	const like = { toggleLike: jest.fn(async () => 1), checkLikeExistance: jest.fn(async () => [{ myFavorite: true }]) };
	return {
		current,
		model,
		member,
		view,
		like,
		service: new TravelPackageService(model as never, member as never, view as never, like as never),
	};
}

describe('Phase 3 package behavior', () => {
	it('restores the active package count when reactivating sold-out packages', async () => {
		const f = fixture(TravelPackageStatus.SOLD_OUT);
		await f.service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.ACTIVE });
		expect(f.member.memberStatsEditor).toHaveBeenCalledWith({ _id: owner, targetKey: 'memberPackages', modifier: 1 });
		expect(f.model.findOneAndUpdate.mock.calls[0]).toEqual(
			expect.arrayContaining([expect.objectContaining({ $unset: { soldOutAt: 1 } })]),
		);
	});
	it('does not alter member counts on sold-out to deleted transitions', async () => {
		const f = fixture(TravelPackageStatus.SOLD_OUT);
		await f.service.updateTravelPackage(owner, { _id: id, packageStatus: TravelPackageStatus.DELETE });
		expect(f.member.memberStatsEditor).not.toHaveBeenCalled();
	});
	it('rejects null capacity fields without writing', async () => {
		const f = fixture();
		await expect(
			f.service.updateTravelPackage(owner, { _id: id, packageMaxTravellers: null as never }),
		).rejects.toThrow();
		expect(f.model.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it.each([TravelPackageStatus.SOLD_OUT, TravelPackageStatus.DELETE])('public detail excludes %s', async (status) => {
		const f = fixture(status);
		f.model.findOne.mockReturnValue({
			exec: async () => null as never,
			lean: () => ({ exec: async () => null as never }),
		});
		await expect(f.service.getTravelPackage(null, id)).rejects.toThrow();
		expect(f.model.findOne).toHaveBeenCalledWith({ _id: id, packageStatus: TravelPackageStatus.ACTIVE });
		expect(f.view.recordView).not.toHaveBeenCalled();
	});
	it('anonymous detail attaches owner without personal engagement', async () => {
		const f = fixture();
		const result = await f.service.getTravelPackage(null, id);
		expect(result.memberData?._id).toEqual(owner);
		expect(f.view.recordView).not.toHaveBeenCalled();
		expect(f.like.checkLikeExistance).not.toHaveBeenCalled();
		expect(f.member.checkSubscription).not.toHaveBeenCalled();
	});
	it('authenticated detail records package engagement and agent-follow state', async () => {
		const f = fixture();
		const result = await f.service.getTravelPackage(viewer, id);
		expect(f.view.recordView).toHaveBeenCalledWith({
			memberId: viewer,
			viewRefId: id,
			viewGroup: ViewGroup.TRAVEL_PACKAGE,
		});
		expect(f.like.checkLikeExistance).toHaveBeenCalledWith({
			memberId: viewer,
			likeRefId: id,
			likeGroup: LikeGroup.TRAVEL_PACKAGE,
		});
		expect(result.packageViews).toBe(1);
		expect(result.meLiked).toEqual([{ myFavorite: true }]);
		expect(result.memberData?.meFollowed).toEqual([{ myFollowing: true }]);
	});
	it('repeat detail visits do not increment views', async () => {
		const f = fixture();
		f.view.recordView.mockResolvedValue(null as never);
		const result = await f.service.getTravelPackage(viewer, id);
		expect(result.packageViews).toBe(0);
		expect(f.model.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('like toggles use package group and packageLikes', async () => {
		const f = fixture();
		await f.service.likeTargetTravelPackage(viewer, id);
		expect(f.like.toggleLike).toHaveBeenCalledWith({
			memberId: viewer,
			likeRefId: id,
			likeGroup: LikeGroup.TRAVEL_PACKAGE,
		});
		expect(f.model.findOneAndUpdate.mock.calls[0]).toEqual(
			expect.arrayContaining([expect.objectContaining({ $inc: { packageLikes: 1 } })]),
		);
	});
	it.each(['packageLikes', 'packageViews', 'packageComments', 'packageRank'])(
		'guards negative %s',
		async (targetKey) => {
			const f = fixture();
			await f.service.travelPackageStatsEditor({ _id: id, targetKey, modifier: -1 });
			expect(f.model.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id, [targetKey]: { $gte: 1 } });
		},
	);
	it('rejects non-statistic updates', async () => {
		const f = fixture();
		await expect(
			f.service.travelPackageStatsEditor({ _id: id, targetKey: 'packagePrice', modifier: 1 }),
		).rejects.toThrow();
	});
	it('agent pagination stays scoped to owner and excludes deleted packages', async () => {
		const f = fixture();
		await f.service.getAgentTravelPackages(owner, { page: 2, limit: 5, search: {} });
		expect(f.model.aggregate.mock.calls[0][0][0].$match).toEqual({
			memberId: owner,
			packageStatus: { $ne: TravelPackageStatus.DELETE },
		});
		await expect(
			f.service.getAgentTravelPackages(owner, {
				page: 1,
				limit: 5,
				search: { packageStatus: TravelPackageStatus.DELETE },
			}),
		).rejects.toThrow();
	});
	it('public pipeline shares filters with totals and personalizes only authenticated lists', async () => {
		const f = fixture();
		const input = {
			page: 2,
			limit: 5,
			sort: 'packageRank',
			direction: Direction.DESC,
			search: { countryList: [], cityList: ['Seoul'], typeList: [], durationRange: { start: 1, end: 5 } },
		};
		await f.service.getTravelPackages(viewer, input as never);
		const pipeline = f.model.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toEqual({
			packageStatus: TravelPackageStatus.ACTIVE,
			packageCity: { $in: ['Seoul'] },
			packageDurationDays: { $gte: 1, $lte: 5 },
		});
		const facet = pipeline[2].$facet as { list: Record<string, unknown>[]; metaCounter: Record<string, unknown>[] };
		expect(facet.list.slice(0, 2)).toEqual([{ $skip: 5 }, { $limit: 5 }]);
		expect(facet.metaCounter).toEqual([{ $count: 'total' }]);
		expect(facet.list[2]).toHaveProperty('$lookup');
		await f.service.getTravelPackages(null, input as never);
		const anonymous = f.model.aggregate.mock.calls[1][0][2].$facet as typeof facet;
		expect(anonymous.list).toHaveLength(facet.list.length - 1);
	});
	it('rejects inverted ranges and invalid sort directions', async () => {
		const f = fixture();
		await expect(
			f.service.getTravelPackages(null, {
				page: 1,
				limit: 5,
				search: { durationRange: { start: 5, end: 1 } },
			} as never),
		).rejects.toThrow('range');
		await expect(
			f.service.getTravelPackages(null, { page: 1, limit: 5, direction: 7, search: {} } as never),
		).rejects.toThrow('direction');
	});
	it('validates pagination before GraphQL service calls', async () => {
		expect(await validate(plainToInstance(TravelPackagesInquiry, { page: 0, limit: 0, search: {} }))).not.toHaveLength(
			0,
		);
	});
	it('admin list allows status selection and hard deletion stays restricted', async () => {
		const f = fixture();
		await f.service.getAllTravelPackagesByAdmin({
			page: 1,
			limit: 5,
			search: { packageStatus: TravelPackageStatus.DELETE },
		});
		expect(f.model.aggregate.mock.calls[0][0][0].$match).toEqual({ packageStatus: TravelPackageStatus.DELETE });
		await f.service.removeTravelPackageByAdmin(id);
		expect(f.model.findOneAndDelete).toHaveBeenCalledWith({ _id: id, packageStatus: TravelPackageStatus.DELETE });
	});
	it('resolver agent and admin operations retain role metadata', () => {
		expect(Reflect.getMetadata('roles', TravelPackageResolver.prototype.createTravelPackage)).toEqual([
			MemberType.AGENT,
		]);
		expect(Reflect.getMetadata('roles', TravelPackageResolver.prototype.updateTravelPackage)).toEqual([
			MemberType.AGENT,
		]);
		expect(Reflect.getMetadata('roles', TravelPackageResolver.prototype.removeTravelPackageByAdmin)).toEqual([
			MemberType.ADMIN,
		]);
	});
});

describe('Phase 3 engagement failures', () => {
	it('treats duplicate view races as existing visits', async () => {
		const model = {
			findOne: jest.fn(() => ({ exec: async () => null })),
			create: jest.fn(async () => {
				throw duplicate;
			}),
		};
		await expect(
			new ViewService(model as never).recordView({
				memberId: viewer,
				viewRefId: id,
				viewGroup: ViewGroup.TRAVEL_PACKAGE,
			}),
		).resolves.toBeNull();
	});
	it('propagates unexpected view failures', async () => {
		const model = {
			findOne: jest.fn(() => ({ exec: async () => null })),
			create: jest.fn(async () => {
				throw new Error('offline');
			}),
		};
		await expect(
			new ViewService(model as never).recordView({
				memberId: viewer,
				viewRefId: id,
				viewGroup: ViewGroup.TRAVEL_PACKAGE,
			}),
		).rejects.toThrow('offline');
	});
	it('does not increment likes on duplicate-key races', async () => {
		const model = {
			findOne: jest.fn(() => ({ exec: async () => null })),
			create: jest.fn(async () => {
				throw duplicate;
			}),
		};
		await expect(
			new LikeService(model as never).toggleLike({
				memberId: viewer,
				likeRefId: id,
				likeGroup: LikeGroup.TRAVEL_PACKAGE,
			}),
		).resolves.toBe(0);
	});
	it('does not decrement twice when a like was already removed', async () => {
		const model = {
			findOne: jest.fn(() => ({ exec: async () => ({ _id: id }) })),
			findOneAndDelete: jest.fn(() => ({ exec: async () => null })),
		};
		await expect(
			new LikeService(model as never).toggleLike({
				memberId: viewer,
				likeRefId: id,
				likeGroup: LikeGroup.TRAVEL_PACKAGE,
			}),
		).resolves.toBe(0);
	});
	it('meLiked checks the engagement group', async () => {
		const model = { findOne: jest.fn(() => ({ exec: async () => null })) };
		await new LikeService(model as never).checkLikeExistance({
			memberId: viewer,
			likeRefId: id,
			likeGroup: LikeGroup.TRAVEL_PACKAGE,
		});
		expect(model.findOne).toHaveBeenCalledWith({
			memberId: viewer,
			likeRefId: id,
			likeGroup: LikeGroup.TRAVEL_PACKAGE,
		});
	});
	it('member counts use atomic nonnegative filters', async () => {
		const model = { findOneAndUpdate: jest.fn(() => ({ exec: async () => null })) };
		await new MemberService(model as never, {} as never, {} as never, {} as never, {} as never).memberStatsEditor({
			_id: owner,
			targetKey: 'memberPackages',
			modifier: -1,
		});
		expect(model.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: owner, memberPackages: { $gte: 1 } },
			{ $inc: { memberPackages: -1 } },
			{ new: true },
		);
	});
	it('rejects comments on inaccessible packages before creation', async () => {
		const model = { create: jest.fn() };
		const packages = {
			assertAccessibleTravelPackage: jest.fn(async () => {
				throw new Error('inaccessible');
			}),
		};
		const service = new CommentService(model as never, {} as never, packages as never, {} as never);
		await expect(
			service.createComment(viewer, {
				commentGroup: CommentGroup.TRAVEL_PACKAGE,
				commentRefId: id,
				commentContent: 'Hello',
			}),
		).rejects.toThrow('inaccessible');
		expect(model.create).not.toHaveBeenCalled();
	});
	it('comment deletion uses ownership filter and decrements package comments', async () => {
		const model = {
			findOneAndUpdate: jest.fn(() => ({
				exec: async () => ({ commentGroup: CommentGroup.TRAVEL_PACKAGE, commentRefId: id }),
			})),
		};
		const packages = { travelPackageStatsEditor: jest.fn() };
		await new CommentService(model as never, {} as never, packages as never, {} as never).updateComment(viewer, {
			_id: id,
			commentStatus: CommentStatus.DELETE,
		});
		expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({
			_id: id,
			memberId: viewer,
			commentStatus: CommentStatus.ACTIVE,
		});
		expect(packages.travelPackageStatsEditor).toHaveBeenCalledWith({
			_id: id,
			targetKey: 'packageComments',
			modifier: -1,
		});
	});
	it('empty comments return a valid page', async () => {
		const model = { aggregate: jest.fn(() => ({ exec: async () => [] })) };
		await expect(
			new CommentService(model as never, {} as never, {} as never, {} as never).getComments(viewer, {
				page: 1,
				limit: 5,
				search: { commentRefId: id },
			}),
		).resolves.toEqual({ list: [], metaCounter: [] });
	});
});

describe('Phase 3 batch and GraphQL', () => {
	it('package ranking preserves the formula on repeated execution', async () => {
		const model = {
			find: jest.fn(() => ({ exec: async () => [{ _id: id, packageLikes: 3, packageViews: 4 }] })),
			findByIdAndUpdate: jest.fn(),
		};
		const service = new BatchService(model as never, {} as never);
		await service.batchTopTravelPackages();
		await service.batchTopTravelPackages();
		expect(model.find).toHaveBeenCalledWith({ packageStatus: TravelPackageStatus.ACTIVE, packageRank: 0 });
		expect(model.findByIdAndUpdate).toHaveBeenNthCalledWith(1, id, { packageRank: 10 });
		expect(model.findByIdAndUpdate).toHaveBeenNthCalledWith(2, id, { packageRank: 10 });
	});
	it('agent ranking handles absent package counts without NaN', async () => {
		const model = {
			find: jest.fn(() => ({ exec: async () => [{ _id: owner, memberArticles: 1, memberLikes: 2, memberViews: 3 }] })),
			findByIdAndUpdate: jest.fn(),
		};
		await new BatchService({} as never, model as never).batchTopAgents();
		expect(model.findByIdAndUpdate).toHaveBeenCalledWith(owner, { memberRank: 10 });
	});
	it('all existing domain resolvers generate a consistent schema with hidden passwords', async () => {
		const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
		try {
			const schema = await module
				.get(GraphQLSchemaFactory)
				.create([TravelPackageResolver, MemberResolver, CommentResolver, FollowResolver, BoardArticleResolver]);
			const member = schema.getType('Member') as { getFields(): Record<string, unknown> } | undefined;
			expect(member?.getFields().memberPassword).toBeUndefined();
			expect(schema.getQueryType()?.getFields().getFavoriteTravelPackages).toBeDefined();
		} finally {
			await module.close();
		}
	});
});

describe('Phase 3 GraphQL guards and comment lifecycle', () => {
	function context(request: { headers: { authorization?: string }; body: Record<string, unknown> }) {
		return {
			contextType: 'graphql',
			getHandler: () => TravelPackageResolver.prototype.createTravelPackage,
			getArgByIndex: () => ({ req: request }),
		} as unknown as ExecutionContext;
	}
	it.each([MemberType.USER, MemberType.ADMIN])('denies %s at AGENT operations', async (memberType) => {
		const auth = { verifyToken: jest.fn(async () => ({ _id: viewer, memberType })) } as unknown as AuthService;
		await expect(
			new RolesGuard(new Reflector(), auth).canActivate(
				context({ headers: { authorization: 'Bearer test' }, body: {} }),
			),
		).rejects.toThrow();
	});
	it('accepts an authenticated agent', async () => {
		const auth = {
			verifyToken: jest.fn(async () => ({ _id: owner, memberType: MemberType.AGENT })),
		} as unknown as AuthService;
		const request = { headers: { authorization: 'Bearer test' }, body: {} };
		await expect(new RolesGuard(new Reflector(), auth).canActivate(context(request))).resolves.toBe(true);
		expect(request.body).toHaveProperty('authMember');
	});
	it('anonymous optional authentication resolves no member', async () => {
		const verifyToken = jest.fn();
		const request = { headers: {}, body: {} };
		await expect(
			new WithoutGuard({ verifyToken } as unknown as AuthService).canActivate(context(request)),
		).resolves.toBe(true);
		expect(verifyToken).not.toHaveBeenCalled();
		expect(request.body).toEqual({ authMember: null });
	});
	it('invalid optional tokens fall back to anonymous access', async () => {
		const verifyToken = jest.fn(async () => {
			throw new Error('invalid');
		});
		const request = { headers: { authorization: 'Bearer invalid' }, body: {} };
		await expect(
			new WithoutGuard({ verifyToken } as unknown as AuthService).canActivate(context(request)),
		).resolves.toBe(true);
		expect(request.body).toEqual({ authMember: null });
	});
	it('valid optional tokens attach authenticated identity', async () => {
		const member = { _id: viewer };
		const verifyToken = jest.fn(async () => member);
		const request = { headers: { authorization: 'Bearer valid' }, body: {} };
		await new WithoutGuard({ verifyToken } as unknown as AuthService).canActivate(context(request));
		expect(request.body).toEqual({ authMember: member });
	});
	it('comment creation increments packageComments after checking accessibility', async () => {
		const model = { create: jest.fn(async () => ({ _id: id })) };
		const packages = { assertAccessibleTravelPackage: jest.fn(), travelPackageStatsEditor: jest.fn() };
		await new CommentService(model as never, {} as never, packages as never, {} as never).createComment(viewer, {
			commentGroup: CommentGroup.TRAVEL_PACKAGE,
			commentRefId: id,
			commentContent: 'Great trip',
		});
		expect(packages.assertAccessibleTravelPackage).toHaveBeenCalledWith(id);
		expect(packages.travelPackageStatsEditor).toHaveBeenCalledWith({
			_id: id,
			targetKey: 'packageComments',
			modifier: 1,
		});
	});
	it('comment updates reject missing owner matches without adjusting counters', async () => {
		const model = { findOneAndUpdate: jest.fn(() => ({ exec: async () => null })) };
		const packages = { travelPackageStatsEditor: jest.fn() };
		await expect(
			new CommentService(model as never, {} as never, packages as never, {} as never).updateComment(viewer, {
				_id: id,
				commentStatus: CommentStatus.DELETE,
			}),
		).rejects.toThrow();
		expect(packages.travelPackageStatsEditor).not.toHaveBeenCalled();
	});
	it('admin comment hard deletion requires soft deletion', async () => {
		const model = { findOneAndDelete: jest.fn(async () => ({ _id: id })) };
		await new CommentService(model as never, {} as never, {} as never, {} as never).removeCommentByAdmin(id);
		expect(model.findOneAndDelete).toHaveBeenCalledWith({ _id: id, commentStatus: CommentStatus.DELETE });
	});
});
