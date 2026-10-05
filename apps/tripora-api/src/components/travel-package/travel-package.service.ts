import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TravelPackages, TravelPackage } from '../../libs/dto/travel-package/travel-package';
import {
	AgentTravelPackagesInquiry,
	AllTravelPackagesInquiry,
	OrdinaryInquiry,
	TravelPackagesInquiry,
	TravelPackageInput,
} from '../../libs/dto/travel-package/travel-package.input';
import { Direction, Message } from '../../libs/enums/common.enum';
import { StatisticModifier, T } from '../../libs/types/common';
import { MemberService } from '../member/member.service';
import { TravelPackageStatus } from '../../libs/enums/travel-package.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { TravelPackageUpdate } from '../../libs/dto/travel-package/travel-package.update';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { availableTravelPackageSorts } from '../../libs/enums/travel-package.enum';
import { lookupAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';

@Injectable()
export class TravelPackageService {
	constructor(
		@InjectModel('TravelPackage') private readonly travelPackageModel: Model<TravelPackage>,
		private memberService: MemberService,
		private viewService: ViewService,
		private likeService: LikeService,
	) {}

	/**=========================== (AGENT) createTravelPackage =============================== **/
	public async createTravelPackage(memberId: Types.ObjectId, input: TravelPackageInput): Promise<TravelPackage> {
		if (!memberId || !Types.ObjectId.isValid(String(memberId)))
			throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
		try {
			await this.validatePackage(input);
			const result = await this.travelPackageModel.create(this.packageFields(input, memberId));
			await this.memberService.memberStatsEditor({ _id: result.memberId, targetKey: 'memberPackages', modifier: 1 });
			return result;
		} catch (err) {
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	/**=========================== (AGENT) updateTravelPackage =============================== **/
	public async updateTravelPackage(memberId: Types.ObjectId, input: TravelPackageUpdate): Promise<TravelPackage> {
		if (!memberId) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
		return this.updatePackage(input, memberId);
	}

	/**=========================== (AGENT) getAgentTravelPackages =============================== **/
	public async getAgentTravelPackages(
		memberId: Types.ObjectId,
		input: AgentTravelPackagesInquiry,
	): Promise<TravelPackages> {
		const { packageStatus } = input.search;
		if (packageStatus === TravelPackageStatus.DELETE) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);
		const match: T = {
			memberId: memberId,
			packageStatus: packageStatus ?? { $ne: TravelPackageStatus.DELETE },
		};
		const sort = this.packageSort(input);

		const result = await this.travelPackageModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}

	/** ==============  LIKE  =============== */
	public async likeTargetTravelPackage(memberId: Types.ObjectId, likeRefId: Types.ObjectId): Promise<TravelPackage> {
		const target = await this.travelPackageModel
			.findOne({ _id: likeRefId, packageStatus: TravelPackageStatus.ACTIVE })
			.exec();
		if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const input: LikeInput = {
			memberId: memberId,
			likeRefId: likeRefId,
			likeGroup: LikeGroup.TRAVEL_PACKAGE,
		};

		const modifier: number = await this.likeService.toggleLike(input);
		const result = await this.travelPackageStatsEditor({
			_id: likeRefId,
			targetKey: 'packageLikes',
			modifier: modifier,
		});

		if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	/**=========================== (ALL) getTravelPackage =============================== **/
	public async getTravelPackage(memberId: Types.ObjectId | null, packageId: Types.ObjectId): Promise<TravelPackage> {
		const search: T = {
			_id: packageId,
			packageStatus: TravelPackageStatus.ACTIVE,
		};

		const targetTravelPackage = await this.travelPackageModel.findOne(search).lean<TravelPackage>().exec();
		if (!targetTravelPackage) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = { memberId: memberId, viewRefId: packageId, viewGroup: ViewGroup.TRAVEL_PACKAGE };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				await this.travelPackageStatsEditor({ _id: packageId, targetKey: 'packageViews', modifier: 1 });
				targetTravelPackage.packageViews++;
			}
			targetTravelPackage.meLiked = await this.likeService.checkLikeExistance({
				memberId,
				likeRefId: packageId,
				likeGroup: LikeGroup.TRAVEL_PACKAGE,
			});
		}

		targetTravelPackage.memberData = await this.memberService.getMember(null, targetTravelPackage.memberId);
		return targetTravelPackage;
	}

	/**=========================== (ALL) getTravelPackages =============================== **/
	public async getTravelPackages(
		memberId: Types.ObjectId | null,
		input: TravelPackagesInquiry,
	): Promise<TravelPackages> {
		const match: T = { packageStatus: TravelPackageStatus.ACTIVE };
		const sort = this.packageSort(input);

		this.shapeMatchQuery(match, input);

		const result = await this.travelPackageModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							...(memberId ? [lookupAuthMemberLiked(memberId)] : []),
							//meLiked
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}

	/**=========================== shapeMatchQuery =============================== **/
	private shapeMatchQuery(match: T, input: TravelPackagesInquiry): void {
		const {
			memberId,
			countryList,
			cityList,
			typeList,
			priceRange,
			durationRange,
			maxTravellersRange,
			startDateRange,
			text,
		} = input.search;
		if (memberId) {
			if (!Types.ObjectId.isValid(String(memberId))) throw new BadRequestException('Invalid member ID');
			match.memberId = shapeIntoMongoObjectId(memberId);
		}
		if (countryList?.length) match.packageCountry = { $in: countryList };
		if (cityList?.length) match.packageCity = { $in: cityList };
		if (typeList?.length) match.packageType = { $in: typeList };
		// Currency selection is not defined in the approved inquiry contract.
		if (priceRange || input.sort === 'packagePrice')
			throw new BadRequestException('Price filtering and sorting require a currency-specific contract');
		if (durationRange) match.packageDurationDays = { $gte: durationRange.start, $lte: durationRange.end };
		if (maxTravellersRange)
			match.packageMaxTravellers = { $gte: maxTravellersRange.start, $lte: maxTravellersRange.end };
		if (startDateRange) match.packageStartDate = { $gte: startDateRange.start, $lte: startDateRange.end };
		if (text) {
			const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			match.$or = ['packageTitle', 'packageCountry', 'packageCity'].map((key) => ({
				[key]: { $regex: new RegExp(escaped, 'i') },
			}));
		}
	}
	private packageSort(input: { sort?: string; direction?: Direction }): T {
		if (input.sort && !availableTravelPackageSorts.includes(input.sort))
			throw new BadRequestException('Invalid package sort');
		if (input.sort === 'packagePrice')
			throw new BadRequestException('Price sorting requires a currency-specific contract');
		return { [input.sort ?? 'createdAt']: input.direction ?? Direction.DESC };
	}

	public async getFavoriteTravelPackages(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<TravelPackages> {
		return await this.likeService.getFavoriteTravelPackages(memberId, input);
	}
	public async getVisitedTravelPackages(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<TravelPackages> {
		return await this.viewService.getVisitedTravelPackages(memberId, input);
	}

	/**=========================== (ADMIN) getAllTravelPackagesByAdmin =============================== **/
	public async getAllTravelPackagesByAdmin(input: AllTravelPackagesInquiry): Promise<TravelPackages> {
		const { packageStatus, countryList } = input.search;
		const match: T = {};
		const sort = this.packageSort(input);

		if (packageStatus) match.packageStatus = packageStatus;
		if (countryList?.length) match.packageCountry = { $in: countryList };

		const result = await this.travelPackageModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember, // memberData: [memberdataValue]
							{ $unwind: '$memberData' }, //memberData: memberdataValue
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}

	/**=========================== (ADMIN) updateTravelPackageByAdmin =============================== **/
	public async updateTravelPackageByAdmin(input: TravelPackageUpdate): Promise<TravelPackage> {
		return this.updatePackage(input);
	}
	private packageFields(input: Partial<TravelPackageInput>, memberId?: Types.ObjectId): T {
		const keys = [
			'packageType',
			'packageCountry',
			'packageCity',
			'packageTitle',
			'packagePrice',
			'packageCurrency',
			'packageDurationDays',
			'packageMaxTravellers',
			'packageAvailableSlots',
			'packageImages',
			'packageDesc',
			'packageStartDate',
		];
		const result: T = {};
		for (const key of keys) if (input[key] !== undefined) result[key] = input[key];
		if (memberId) result.memberId = memberId;
		return result;
	}
	private async validatePackage(input: Partial<TravelPackageInput>): Promise<void> {
		try {
			await validateOrReject(plainToInstance(TravelPackageInput, input));
		} catch {
			throw new BadRequestException('Invalid travel package fields');
		}
		if (input.packageAvailableSlots! > input.packageMaxTravellers!)
			throw new BadRequestException('Available slots cannot exceed maximum travellers');
	}
	private async updatePackage(input: TravelPackageUpdate, memberId?: Types.ObjectId): Promise<TravelPackage> {
		if (!Types.ObjectId.isValid(String(input._id))) throw new BadRequestException('Invalid package ID');
		const search: T = { _id: input._id, packageStatus: { $ne: TravelPackageStatus.DELETE } };
		if (memberId) search.memberId = memberId;
		const current = await this.travelPackageModel.findOne(search).lean<TravelPackage>().exec();
		if (!current) throw new BadRequestException(Message.UPDATE_FAILED);
		const changes = this.packageFields(input);
		await this.validatePackage({ ...current, ...changes });
		const status = input.packageStatus ?? current.packageStatus;
		if (!Object.values(TravelPackageStatus).includes(status)) throw new BadRequestException('Invalid package status');
		changes.packageStatus = status;
		const update: T = { $set: changes };
		if (status === TravelPackageStatus.SOLD_OUT && current.packageStatus !== status) changes.soldOutAt = new Date();
		if (status === TravelPackageStatus.ACTIVE) update.$unset = { soldOutAt: 1 };
		if (status === TravelPackageStatus.DELETE) changes.deletedAt = new Date();
		search.updatedAt = current.updatedAt;
		const result = await this.travelPackageModel
			.findOneAndUpdate(search, update, { new: true, runValidators: true })
			.exec();
		if (!result) throw new BadRequestException(Message.UPDATE_FAILED);
		// Preserve existing member counter semantics.
		if (current.packageStatus === TravelPackageStatus.ACTIVE && status !== current.packageStatus)
			await this.memberService.memberStatsEditor({
				_id: current.memberId,
				targetKey: 'memberPackages',
				modifier: -1,
			});
		return result;
	}

	/**=========================== (ADMIN) removeTravelPackageByAdmin  =============================== **/
	public async removeTravelPackageByAdmin(packageId: Types.ObjectId): Promise<TravelPackage> {
		const search: T = { _id: packageId, packageStatus: TravelPackageStatus.DELETE };
		const result = await this.travelPackageModel.findOneAndDelete(search).exec();
		if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);

		return result;
	}

	/**=========================== travelPackageStatsEditor =============================== **/
	public async travelPackageStatsEditor(input: StatisticModifier): Promise<TravelPackage | null> {
		const { _id, targetKey, modifier } = input;
		if (
			!['packageViews', 'packageLikes', 'packageComments', 'packageRank'].includes(targetKey) ||
			!Number.isFinite(modifier)
		)
			throw new BadRequestException('Invalid package statistic');
		const filter: T = { _id };
		if (modifier < 0) filter[targetKey] = { $gte: -modifier };
		return this.travelPackageModel.findOneAndUpdate(filter, { $inc: { [targetKey]: modifier } }, { new: true }).exec();
	}
}
