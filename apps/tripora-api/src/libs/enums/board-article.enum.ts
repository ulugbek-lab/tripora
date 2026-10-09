import { registerEnumType } from '@nestjs/graphql';

export enum BoardArticleCategory {
	TRAVEL_STORY = 'TRAVEL_STORY',
	DESTINATION = 'DESTINATION',
	TRAVEL_TIPS = 'TRAVEL_TIPS',
	QUESTION = 'QUESTION',
}
registerEnumType(BoardArticleCategory, {
	name: 'BoardArticleCategory',
});

export enum BoardArticleStatus {
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(BoardArticleStatus, {
	name: 'BoardArticleStatus',
});
