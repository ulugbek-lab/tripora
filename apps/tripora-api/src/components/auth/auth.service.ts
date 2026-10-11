import type { Request, Response, CookieOptions } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MemberStatus } from '../../libs/enums/member.enum';
import * as bcrypt from 'bcryptjs';
import { Member } from '../../libs/dto/member/member';
import { T } from '../../libs/types/common';
import { JwtService } from '@nestjs/jwt';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class AuthService {
	constructor(
		private jwtService: JwtService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {
		if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === process.env.SECRET_TOKEN)
			throw new Error('A separate JWT_REFRESH_SECRET is required');
	}
	public async hashPassword(memberPassword: string): Promise<string> {
		const salt = await bcrypt.genSalt();
		return await bcrypt.hash(memberPassword, salt);
	}
	public async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
		return await bcrypt.compare(password, hashedPassword);
	}

	public async createToken(member: Member): Promise<string> {
		const payload: T = {};
		Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
			payload[`${ele}`] = member[`${ele}`];
		});
		delete payload.memberPassword;
		delete payload.accessToken;
		return await this.jwtService.signAsync(payload);
	}

	private readonly cookieOptions: CookieOptions = {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/graphql',
	};

	public async createRefreshToken(member: Member, response: Response): Promise<void> {
		const token = await this.jwtService.signAsync(
			{ _id: String(member._id) },
			{
				secret: process.env.JWT_REFRESH_SECRET,
				expiresIn: '15d',
			},
		);
		response.cookie('triporaRefreshToken', token, { ...this.cookieOptions, maxAge: 15 * 24 * 60 * 60 * 1000 });
	}

	public clearRefreshCookie(response: Response): void {
		response.clearCookie('triporaRefreshToken', this.cookieOptions);
	}

	public async refreshToken(request: Request, response: Response): Promise<string> {
		try {
			const cookie = request.headers.cookie?.split(';').find((part) => part.trim().startsWith('triporaRefreshToken='));
			if (!cookie) throw new UnauthorizedException();
			const token = decodeURIComponent(cookie.trim().slice('triporaRefreshToken='.length));
			const member = await this.verifyToken(token, true);
			return await this.createToken(member);
		} catch {
			this.clearRefreshCookie(response);
			throw new UnauthorizedException('Invalid or expired refresh token');
		}
	}

	public async verifyToken(token: string, refresh = false): Promise<Member> {
		const claims = await this.jwtService.verifyAsync(token, refresh ? { secret: process.env.JWT_REFRESH_SECRET } : {});
		const member = await this.memberModel
			.findOne({ _id: shapeIntoMongoObjectId(claims._id), memberStatus: MemberStatus.ACTIVE })
			.lean<Member>()
			.exec();
		if (!member) throw new UnauthorizedException('Member session is no longer active');
		return member;
	}
}
