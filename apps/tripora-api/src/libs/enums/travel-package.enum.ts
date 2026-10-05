import { registerEnumType } from '@nestjs/graphql';
export const packageCurrencies = [
	'USD',
	'EUR',
	'GBP',
	'KRW',
	'JPY',
	'CNY',
	'AUD',
	'CAD',
	'CHF',
	'SGD',
	'THB',
	'AED',
] as const;
export const availableTravelPackageSorts = [
	'createdAt',
	'updatedAt',
	'packageLikes',
	'packageViews',
	'packageRank',
	'packagePrice',
	'packageStartDate',
];
export enum TravelPackageType {
	GROUP = 'GROUP',
	PRIVATE = 'PRIVATE',
	ADVENTURE = 'ADVENTURE',
	CULTURAL = 'CULTURAL',
	BEACH = 'BEACH',
	HONEYMOON = 'HONEYMOON',
}
export enum TravelPackageStatus {
	ACTIVE = 'ACTIVE',
	SOLD_OUT = 'SOLD_OUT',
	DELETE = 'DELETE',
}
registerEnumType(TravelPackageType, { name: 'TravelPackageType' });
registerEnumType(TravelPackageStatus, { name: 'TravelPackageStatus' });
