import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { View } from '../../libs/dto/view/views';
import { ViewInput } from '../../libs/dto/view/view.input';
import { T } from '../../libs/types/common';
import { ViewGroup } from '../../libs/enums/view.enum';
import { OrdinaryInquiry } from '../../libs/dto/travel-package/travel-package.input';
import { lookupVisitedTravelPackage } from '../../libs/config';
import { TravelPackages } from '../../libs/dto/travel-package/travel-package';

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<View>) {}

	public async recordView(input: ViewInput): Promise<View | null> {
		const viewExist = await this.checkViewExistance(input);
		if (!viewExist) {
			console.log('New View insertedddd');
			return await this.viewModel.create(input);
		} else return null;
	}

	private async checkViewExistance(input: ViewInput): Promise<View | null> {
		const { memberId, viewRefId } = input;
		const search: T = { memberId: memberId, viewRefId: viewRefId };
		return await this.viewModel.findOne(search).exec();
	}

	public async getVisitedTravelPackages(memberId: Types.ObjectId, input: OrdinaryInquiry): Promise<TravelPackages> {
		const { page, limit } = input;
		const match: T = { viewGroup: ViewGroup.TRAVEL_PACKAGE, memberId: memberId };

		const data: T = await this.viewModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'travelPackages',
						localField: 'viewRefId',
						foreignField: '_id',
						as: 'visitedTravelPackage',
					},
				},
				{ $unwind: '$visitedTravelPackage' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupVisitedTravelPackage,
							{ $unwind: '$visitedTravelPackage.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		console.log('data without map', data);
		const result: TravelPackages = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.visitedTravelPackage);
		console.log('result.list', result);
		return result;
	}
}
