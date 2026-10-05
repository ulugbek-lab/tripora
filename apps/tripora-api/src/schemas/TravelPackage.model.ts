import { packageCurrencies } from '../libs/enums/travel-package.enum';
import { Schema, Document } from 'mongoose';
import { TravelPackageStatus, TravelPackageType } from '../libs/enums/travel-package.enum';

const TravelPackageSchema = new Schema(
	{
		packageType: {
			type: String,
			enum: TravelPackageType,
			required: true,
		},

		packageStatus: {
			type: String,
			enum: TravelPackageStatus,
			default: TravelPackageStatus.ACTIVE,
		},

		packageCountry: {
			type: String,
			required: true,
		},

		packageCity: {
			type: String,
			required: true,
		},

		packageTitle: {
			minlength: 5,
			maxlength: 120,
			type: String,
			required: true,
		},

		packageCurrency: { type: String, enum: packageCurrencies, required: true },
		packagePrice: {
			min: 0,
			type: Number,
			required: true,
		},

		packageDurationDays: {
			min: 1,
			type: Number,
			required: true,
		},

		packageMaxTravellers: {
			min: 1,
			type: Number,
			required: true,
		},

		packageAvailableSlots: {
			validate: {
				validator: function (value: number) {
					return this instanceof Document ? value <= this.get('packageMaxTravellers') : true;
				},
				message: 'Available slots exceed maximum travellers',
			},
			min: 0,
			type: Number,
			required: true,
		},

		packageViews: {
			type: Number,
			default: 0,
		},

		packageLikes: {
			type: Number,
			default: 0,
		},

		packageComments: {
			type: Number,
			default: 0,
		},

		packageRank: {
			type: Number,
			default: 0,
		},

		packageImages: {
			validate: {
				validator: (images: string[]) => images.length > 0,
				message: 'At least one package image is required',
			},
			type: [String],
			required: true,
		},

		packageDesc: {
			type: String,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		soldOutAt: {
			type: Date,
		},

		deletedAt: {
			type: Date,
		},

		packageStartDate: {
			required: true,
			type: Date,
		},
	},
	{ timestamps: true, collection: 'travelPackages' },
);

TravelPackageSchema.index({ packageType: 1, packageCountry: 1, packageCity: 1, packageTitle: 1, packagePrice: 1 });
TravelPackageSchema.index({ packageStatus: 1, packageStartDate: 1 });
TravelPackageSchema.index({ memberId: 1, packageStatus: 1 });
TravelPackageSchema.index({ packageRank: -1 });
export default TravelPackageSchema;
