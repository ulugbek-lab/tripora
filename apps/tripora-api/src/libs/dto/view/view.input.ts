import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty } from 'class-validator';

import { ViewGroup } from '../../enums/view.enum';
import { Types } from 'mongoose';

@InputType()
export class ViewInput {
	@IsNotEmpty()
	@Field(() => ViewGroup)
	memberId: Types.ObjectId;

	@IsNotEmpty()
	@Field(() => String)
	viewRefId: Types.ObjectId;

	@IsNotEmpty()
	@Field(() => ViewGroup)
	viewGroup: ViewGroup;
}
