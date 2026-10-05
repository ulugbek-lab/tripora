import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member } from 'apps/tripora-api/src/libs/dto/member/member';
import { TravelPackage } from 'apps/tripora-api/src/libs/dto/travel-package/travel-package';
import { MemberStatus, MemberType } from 'apps/tripora-api/src/libs/enums/member.enum';
import { TravelPackageStatus } from 'apps/tripora-api/src/libs/enums/travel-package.enum';
import { Model } from 'mongoose';

@Injectable()
export class BatchService {
	constructor(
		@InjectModel('TravelPackage') private readonly travelPackageModel: Model<TravelPackage>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}
	public async batchRollback(): Promise<void> {
		await this.travelPackageModel
			.updateMany(
				{
					packageStatus: TravelPackageStatus.ACTIVE,
				},
				{
					packageRank: 0,
				},
			)
			.exec();

		await this.memberModel
			.updateMany(
				{
					memberStatus: MemberStatus.ACTIVE,
					memberType: MemberType.AGENT,
				},
				{
					memberRank: 0,
				},
			)
			.exec();
	}

	public async batchTopTravelPackages(): Promise<void> {
		const travelPackages: TravelPackage[] = await this.travelPackageModel
			.find({
				packageStatus: TravelPackageStatus.ACTIVE,
				packageRank: 0,
			})
			.exec();

		const promisedList = travelPackages.map(async (ele: TravelPackage) => {
			const { _id, packageLikes, packageViews } = ele;
			const rank = packageLikes * 2 + packageViews * 1;
			return await this.travelPackageModel.findByIdAndUpdate(_id, { packageRank: rank });
		});
		await Promise.all(promisedList);
	}

	public async batchTopAgents(): Promise<void> {
		const agents: Member[] = await this.memberModel
			.find({
				memberType: MemberType.AGENT,
				memberStatus: MemberStatus.ACTIVE,
				memberRank: 0,
			})
			.exec();

		const promisedList = agents.map(async (ele: Member) => {
			const { _id, memberPackages, memberLikes, memberArticles, memberViews } = ele;
			const rank = (memberPackages ?? 0) * 5 + memberArticles * 3 + memberLikes * 2 + memberViews * 1;
			return await this.memberModel.findByIdAndUpdate(_id, { memberRank: rank });
		});
		await Promise.all(promisedList);
	}
	public getHello(): string {
		return 'Welcome to TRIPORA BATCH server!';
	}
}
