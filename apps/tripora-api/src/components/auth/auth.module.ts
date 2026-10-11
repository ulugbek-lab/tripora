import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';

@Module({
	imports: [
		HttpModule,
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		JwtModule.register({
			secret: `${process.env.SECRET_TOKEN}`,
			signOptions: {
				expiresIn: '15m',
			},
		}),
	],
	providers: [AuthService, AuthResolver],
	exports: [AuthService],
})
export class AuthModule {}
