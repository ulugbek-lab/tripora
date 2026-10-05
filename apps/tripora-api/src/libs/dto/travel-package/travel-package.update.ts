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
} from 'class-validator';
import { Type } from 'class-transformer';
import { TravelPackageStatus, TravelPackageType, packageCurrencies } from '../../enums/travel-package.enum';
import { Types } from 'mongoose';
@InputType()
export class TravelPackageUpdate {
	@IsMongoId() @Field(() => String) _id: Types.ObjectId;
	@IsOptional()
	@IsEnum(TravelPackageStatus)
	@Field(() => TravelPackageStatus, { nullable: true })
	packageStatus?: TravelPackageStatus;
	@IsOptional()
	@IsEnum(TravelPackageType)
	@Field(() => TravelPackageType, { nullable: true })
	packageType?: TravelPackageType;
	@IsOptional() @IsString() @IsNotEmpty() @Field(() => String, { nullable: true }) packageCountry?: string;
	@IsOptional() @IsString() @IsNotEmpty() @Field(() => String, { nullable: true }) packageCity?: string;
	@IsOptional() @IsString() @Length(5, 120) @Field(() => String, { nullable: true }) packageTitle?: string;
	@IsOptional() @IsNumber() @Min(0) @Field(() => Number, { nullable: true }) packagePrice?: number;
	@IsOptional() @IsIn(packageCurrencies) @Field(() => String, { nullable: true }) packageCurrency?: string;
	@IsOptional() @IsInt() @Min(1) @Field(() => Int, { nullable: true }) packageDurationDays?: number;
	@IsOptional() @IsInt() @Min(1) @Field(() => Int, { nullable: true }) packageMaxTravellers?: number;
	@IsOptional() @IsInt() @Min(0) @Field(() => Int, { nullable: true }) packageAvailableSlots?: number;
	@IsOptional()
	@IsArray()z
	@ArrayMinSize(1)
	@IsString({ each: true })
	@IsNotEmpty({ each: true })
	@Field(() => [String], { nullable: true })
	packageImages?: string[];
	@IsOptional() @IsString() @Field(() => String, { nullable: true }) packageDesc?: string;
	@IsOptional() @IsDate() @Type(() => Date) @Field(() => Date, { nullable: true }) packageStartDate?: Date;
}
