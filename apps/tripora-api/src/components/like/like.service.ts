import { TravelPackageStatus } from '../../libs/enums/travel-package.enum';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Like, MeLiked } from '../../libs/dto/like/like';
import { Model, Types } from 'mongoose';
import { LikeInput } from '../../libs/dto/like/like.input';
import { T } from '../../libs/types/common';
import { Message } from '../../libs/enums/common.enum';
import { OrdinaryInquiry } from '../../libs/dto/travel-package/travel-package.input';
import { TravelPackages } from '../../libs/dto/travel-package/travel-package';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupFavoriteTravelPackage } from '../../libs/config';

@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}

	public async toggleLike(input: LikeInput): Promise<number> {
		const search: T = { memberId: input.memberId, likeRefId: input.likeRefId, likeGroup: input.likeGroup };
		const exist = await this.likeModel.findOne(search).exec();
		let modifier = 1;

		if (exist) {
			const removed = await this.likeModel.findOneAndDelete(search).exec();
			modifier = removed ? -1 : 0;
		} else {
			try {
				await this.likeModel.create(input);
			} catch (err) {
				if (err instanceof Error && 'code' in err && err.code === 11000) return 0;
				console.log('Error, Service.model:', err);
				throw new BadRequestException(Message.CREATE_FAILED);
			}
		}
		console.log(`-- LIKE modifier ${modifier} --`);
		return modifier;
	}

	public async checkLikeExistance(input: LikeInput): Promise<MeLiked[]> {
		const { memberId, likeRefId, likeGroup } = input;
		const result = await this.likeModel.findOne({ memberId, likeRefId, likeGroup }).exec();
		return result ? [{ memberId: memberId, likeRefId: likeRefId, myFavorite: true }] : [];
	}

	public async getFavoriteTravelPackages(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<TravelPackages> {
		const { page, limit } = input;
		const match: T = { likeGroup: LikeGroup.TRAVEL_PACKAGE, memberId: memberId };

		const data: T = await this.likeModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'travelPackages',
						localField: 'likeRefId',
						foreignField: '_id',
						as: 'favoriteTravelPackage',
					},
				},
				{ $unwind: '$favoriteTravelPackage' },
				{ $match: { 'favoriteTravelPackage.packageStatus': TravelPackageStatus.ACTIVE } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupFavoriteTravelPackage,
							{ $unwind: { path: '$favoriteTravelPackage.memberData', preserveNullAndEmptyArrays: true } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		console.log('data', data);
		const pageData = data[0] ?? { list: [], metaCounter: [] };
		const result: TravelPackages = { list: [], metaCounter: pageData.metaCounter };
		result.list = pageData.list.map((ele) => ele.favoriteTravelPackage);

		return result;
	}
}
