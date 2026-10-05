import { registerEnumType } from '@nestjs/graphql';

export enum CommentStatus {
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(CommentStatus, {
	name: 'CommentStatus',
});

export enum CommentGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	TRAVEL_PACKAGE = 'TRAVEL_PACKAGE',
}
registerEnumType(CommentGroup, {
	name: 'CommentGroup',
});
