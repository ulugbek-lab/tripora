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
		const search: T = { memberId: input.memberId, likeRefId: input.likeRefId };
		const exist = await this.likeModel.findOne(search).exec();
		let modifier = 1;

		if (exist) {
			await this.likeModel.findOneAndDelete(search).exec();
			modifier = -1;
		} else {
			try {
				await this.likeModel.create(input);
			} catch (err) {
				console.log('Error, Service.model:', err);
				throw new BadRequestException(Message.CREATE_FAILED);
			}
		}
		console.log(`-- LIKE modifier ${modifier} --`);
		return modifier;
	}

	public async checkLikeExistance(input: LikeInput): Promise<MeLiked[]> {
		const { memberId, likeRefId } = input;
		const result = await this.likeModel.findOne({ memberId: memberId, likeRefId: likeRefId }).exec();
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
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupFavoriteTravelPackage,
							{ $unwind: '$favoriteTravelPackage.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		console.log('data', data);
		const result: TravelPackages = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.favoriteTravelPackage);

		return result;
	}
}
