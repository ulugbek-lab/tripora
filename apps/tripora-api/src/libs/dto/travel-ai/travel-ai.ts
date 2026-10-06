import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsDefined,
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	Min,
	ValidateNested,
} from 'class-validator';
import { packageCurrencies } from '../../enums/travel-package.enum';

export const AI_ESTIMATE_LABEL = 'Estimated cost for all travellers; not a live quote';
export const AI_ITINERARY_WARNING =
	'AI-generated suggestions only. Prices and availability must be independently verified. No live flight prices, live hotel availability, authoritative visa information, confirmed reservations, or safety guarantees are provided.';
@ObjectType()
export class TravelAiActivity {
	@IsString() @Length(1, 120) @Field(() => String) title: string;
	@IsString() @Length(1, 500) @Field(() => String) description: string;
}
@ObjectType()
export class TravelAiBudgetEstimate {
	@IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Field(() => Float) amount: number;
	@IsIn(packageCurrencies) @Field(() => String) currency: string;
	@IsIn([AI_ESTIMATE_LABEL]) @Field(() => String) label: string;
}
@ObjectType()
export class TravelAiDay {
	@IsInt() @Min(1) @Field(() => Int) day: number;
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => TravelAiActivity)
	@Field(() => [TravelAiActivity])
	activities: TravelAiActivity[];
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(5)
	@IsString({ each: true })
	@Length(1, 200, { each: true })
	@Field(() => [String], { nullable: true })
	mealSuggestions?: string[] | null;
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(5)
	@IsString({ each: true })
	@Length(1, 200, { each: true })
	@Field(() => [String], { nullable: true })
	accommodationSuggestions?: string[] | null;
	@IsDefined()
	@ValidateNested()
	@Type(() => TravelAiBudgetEstimate)
	@Field(() => TravelAiBudgetEstimate)
	estimatedBudget: TravelAiBudgetEstimate;
}
@ObjectType()
export class TravelAiItinerary {
	@IsString() @Length(1, 160) @Field(() => String) title: string;
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(30)
	@ValidateNested({ each: true })
	@Type(() => TravelAiDay)
	@Field(() => [TravelAiDay])
	days: TravelAiDay[];
	@IsDefined()
	@ValidateNested()
	@Type(() => TravelAiBudgetEstimate)
	@Field(() => TravelAiBudgetEstimate)
	estimatedTotalBudget: TravelAiBudgetEstimate;
	@IsIn([AI_ITINERARY_WARNING]) @Field(() => String) warning: string;
}
