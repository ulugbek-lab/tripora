import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsString, Length, Matches, Max, Min } from 'class-validator';
import { packageCurrencies } from '../../enums/travel-package.enum';

@InputType()
export class TravelAiInput {
	@IsString() @Length(2, 120) @Matches(/\S/) @Field(() => String) destination: string;
	@IsInt() @Min(1) @Max(30) @Field(() => Int) durationDays: number;
	@IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1000000000) @Field(() => Float) budget: number;
	@IsIn(packageCurrencies) @Field(() => String) currency: string;
	@IsInt() @Min(1) @Max(100) @Field(() => Int) travellerCount: number;
	@IsArray()
	@ArrayMaxSize(20)
	@IsString({ each: true })
	@Length(1, 80, { each: true })
	@Matches(/\S/, { each: true })
	@Field(() => [String])
	interests: string[];
}
