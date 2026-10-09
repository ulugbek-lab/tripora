import { Type } from 'class-transformer';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, Length, Min, ValidateNested } from 'class-validator';
import { Types } from 'mongoose';
import { BoardArticleCategory, BoardArticleStatus } from '../../enums/board-article.enum';
import { Direction } from '../../enums/common.enum';

@InputType()
export class BoardArticleInput {
	@IsNotEmpty()
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory)
	articleCategory: BoardArticleCategory;

	@IsNotEmpty()
	@Length(3, 50)
	@Field(() => String)
	articleTitle: string;

	@IsNotEmpty()
	@Length(3, 250)
	@Field(() => String)
	articleContent: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	articleImage?: string;

	memberId?: Types.ObjectId;
}

@InputType()
class BAISearch {
	@IsOptional()
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: Types.ObjectId;
}

@InputType()
export class BoardArticlesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(['createdAt', 'updatedAt', 'articleLikes', 'articleViews'])
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => BAISearch)
	@Field(() => BAISearch)
	search: BAISearch;
}

@InputType()
class ABAISearch {
	@IsOptional()
	@Field(() => BoardArticleStatus, { nullable: true })
	articleStatus?: BoardArticleStatus;

	@IsOptional()
	@IsEnum(BoardArticleCategory)
	@Field(() => BoardArticleCategory, { nullable: true })
	articleCategory?: BoardArticleCategory;
}

@InputType()
export class AllBoardArticlesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(['createdAt', 'updatedAt', 'articleLikes', 'articleViews'])
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => ABAISearch)
	@Field(() => ABAISearch)
	search: ABAISearch;
}
