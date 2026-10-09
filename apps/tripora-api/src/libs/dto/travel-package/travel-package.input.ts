import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEnum,
	IsNumber,
	IsString,
	IsArray,
	ArrayMinSize,
	IsDate,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	Length,
	Min,
	IsMongoId,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
	TravelPackageStatus,
	TravelPackageType,
	packageCurrencies,
	availableTravelPackageSorts,
} from '../../enums/travel-package.enum';
import { Types } from 'mongoose';
import { Direction } from '../../enums/common.enum';
@InputType()
export class TravelPackageInput {
	@IsEnum(TravelPackageType) @Field(() => TravelPackageType) packageType: TravelPackageType;
	@IsString() @IsNotEmpty() @Field(() => String) packageCountry: string;
	@IsString() @IsNotEmpty() @Field(() => String) packageCity: string;
	@IsString() @Length(5, 120) @Field(() => String) packageTitle: string;
	@IsNumber() @Min(0) @Field(() => Number) packagePrice: number;
	@IsIn(packageCurrencies) @Field(() => String) packageCurrency: string;
	@IsInt() @Min(1) @Field(() => Int) packageDurationDays: number;
	@IsInt() @Min(1) @Field(() => Int) packageMaxTravellers: number;
	@IsInt() @Min(0) @Field(() => Int) packageAvailableSlots: number;
	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@IsString({ each: true })
	@IsNotEmpty({ each: true })
	@Field(() => [String], { nullable: true })
	packageImages?: string[];
	@IsOptional() @IsString() @Field(() => String, { nullable: true }) packageDesc?: string;
	@IsDate() @Type(() => Date) @Field(() => Date) packageStartDate: Date;
}
@InputType()
export class PriceRange {
	@IsNumber()
	@Min(0)
	@Field(() => Int)
	start: number;

	@IsNumber()
	@Min(0)
	@Field(() => Int)
	end: number;
}
@InputType()
export class DurationRange {
	@IsNumber()
	@Min(0)
	@Field(() => Int)
	start: number;

	@IsNumber()
	@Min(0)
	@Field(() => Int)
	end: number;
}
@InputType()
export class StartDateRange {
	@IsDate()
	@Type(() => Date)
	@Field(() => Date)
	start: Date;

	@IsDate()
	@Type(() => Date)
	@Field(() => Date)
	end: Date;
}

@InputType()
class TravelPackageSearch {
	@IsOptional()
	@IsMongoId()
	@Field(() => String, { nullable: true })
	memberId: Types.ObjectId;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Field(() => [String], { nullable: true })
	countryList?: string[];
	@IsOptional() @IsArray() @IsString({ each: true }) @Field(() => [String], { nullable: true }) cityList?: string[];

	@IsOptional()
	@IsArray()
	@IsEnum(TravelPackageType, { each: true })
	@Field(() => [TravelPackageType], { nullable: true })
	typeList?: TravelPackageType[];

	@IsOptional()
	@IsIn(packageCurrencies)
	@Field(() => String, { nullable: true })
	packageCurrency?: string;

	@IsOptional()
	@ValidateNested()
	@Type(() => PriceRange)
	@Field(() => PriceRange, { nullable: true })
	priceRange?: PriceRange;

	@IsOptional()
	@ValidateNested()
	@Type(() => StartDateRange)
	@Field(() => StartDateRange, { nullable: true })
	startDateRange?: StartDateRange;

	@IsOptional()
	@ValidateNested()
	@Type(() => DurationRange)
	@Field(() => DurationRange, { nullable: true })
	durationRange?: DurationRange;
	@IsOptional()
	@ValidateNested()
	@Type(() => DurationRange)
	@Field(() => DurationRange, { nullable: true })
	maxTravellersRange?: DurationRange;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class TravelPackagesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableTravelPackageSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => TravelPackageSearch)
	@Field(() => TravelPackageSearch)
	search: TravelPackageSearch;
}

@InputType()
class AgentTravelPackageSearch {
	@IsOptional()
	@IsEnum(TravelPackageStatus)
	@Field(() => TravelPackageStatus, { nullable: true })
	packageStatus?: TravelPackageStatus;
}

@InputType()
export class AgentTravelPackagesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableTravelPackageSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => AgentTravelPackageSearch)
	@Field(() => AgentTravelPackageSearch)
	search: AgentTravelPackageSearch;
}

/** =============== AllTravelPackagesInquiry (AGENT) =================== */

@InputType()
class AdminTravelPackageSearch {
	@IsOptional()
	@IsEnum(TravelPackageStatus)
	@Field(() => TravelPackageStatus, { nullable: true })
	packageStatus?: TravelPackageStatus;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Field(() => [String], { nullable: true })
	countryList?: string[];
}

@InputType()
export class AllTravelPackagesInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableTravelPackageSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => AdminTravelPackageSearch)
	@Field(() => AdminTravelPackageSearch)
	search: AdminTravelPackageSearch;
}

@InputType()
export class OrdinaryInquiry {
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit: number;
}
