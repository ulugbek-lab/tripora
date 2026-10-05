import { Module } from '@nestjs/common';
import { TravelPackageResolver } from './travel-package.resolver';
import { TravelPackageService } from './travel-package.service';
import { MongooseModule } from '@nestjs/mongoose';
import TravelPackageSchema from '../../schemas/TravelPackage.model';
import { AuthModule } from '../auth/auth.module';
import { ViewModule } from '../view/view.module';
import { MemberModule } from '../member/member.module';
import { LikeModule } from '../like/like.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'TravelPackage', schema: TravelPackageSchema }]),
		AuthModule,
		ViewModule,
		MemberModule,
		LikeModule,
	],
	providers: [TravelPackageResolver, TravelPackageService],
	exports: [TravelPackageService],
})
export class TravelPackageModule {}
