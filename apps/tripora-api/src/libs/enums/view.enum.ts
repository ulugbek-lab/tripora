import { registerEnumType } from '@nestjs/graphql';

export enum ViewGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	TRAVEL_PACKAGE = 'TRAVEL_PACKAGE',
}
registerEnumType(ViewGroup, {
	name: 'ViewGroup',
});
