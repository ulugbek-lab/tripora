import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { Types } from 'mongoose';
import { TravelPackageStatus, TravelPackageType } from '../../enums/travel-package.enum';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../like/like';

@ObjectType()
export class TravelPackage {
	@Field(() => String)
	_id: Types.ObjectId;

	@Field(() => TravelPackageType)
	packageType: TravelPackageType;

	@Field(() => TravelPackageStatus)
	packageStatus: TravelPackageStatus;

	@Field(() => String)
	packageCountry: string;

	@Field(() => String)
	packageCity: string;

	@Field(() => String)
	packageTitle: string;

	@Field(() => String)
	packageCurrency: string;

	@Field(() => Number)
	packagePrice: number;

	@Field(() => Int)
	packageDurationDays: number;

	@Field(() => Int)
	packageMaxTravellers: number;

	@Field(() => Int)
	packageAvailableSlots: number;

	@Field(() => Int)
	packageViews: number;

	@Field(() => Int)
	packageLikes: number;

	@Field(() => Int)
	packageComments: number;

	@Field(() => Int)
	packageRank: number;

	@Field(() => [String])
	packageImages: string[];

	@Field(() => String, { nullable: true })
	packageDesc?: string;

	@Field(() => String)
	memberId: Types.ObjectId;

	@Field(() => Date, { nullable: true })
	soldOutAt?: Date;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	packageStartDate: Date;

	@Field(() => Date)
	createdAt?: Date;

	@Field(() => Date)
	updatedAt?: Date;

	/** from aggregation */
	@Field(() => [MeLiked], { nullable: true })
	meLiked: MeLiked[];

	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class TravelPackages {
	@Field(() => [TravelPackage])
	list: TravelPackage[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter: TotalCounter[];
}
