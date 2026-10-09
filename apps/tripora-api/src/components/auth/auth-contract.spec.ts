import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import { MemberResolver } from '../member/member.resolver';
import { JwtService } from '@nestjs/jwt';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

describe('Current member authorization', () => {
	it('uses the current stored role instead of stale JWT permissions', async () => {
		const id = new Types.ObjectId();
		const current = { _id: id, memberType: MemberType.USER, memberStatus: MemberStatus.ACTIVE };
		const jwt = { verifyAsync: jest.fn(async () => ({ _id: id.toString(), memberType: MemberType.ADMIN })) };
		const model = { findOne: jest.fn(() => ({ lean: () => ({ exec: async () => current }) })) };
		const service = new AuthService(jwt as unknown as JwtService, model as never);
		await expect(service.verifyToken('token')).resolves.toEqual(current);
		expect(model.findOne).toHaveBeenCalledWith({ _id: id, memberStatus: MemberStatus.ACTIVE });
	});
	it('rejects sessions for blocked, deleted or missing members', async () => {
		const jwt = { verifyAsync: jest.fn(async () => ({ _id: new Types.ObjectId().toString() })) };
		const model = { findOne: jest.fn(() => ({ lean: () => ({ exec: async () => null }) })) };
		await expect(new AuthService(jwt as unknown as JwtService, model as never).verifyToken('token')).rejects.toThrow(
			'no longer active',
		);
	});
	it.each(['../outside', 'property', '/tmp', 'member/../article'])(
		'rejects generic upload target %s before reading files',
		async (target) => {
			const resolver = new MemberResolver({} as never);
			const createReadStream = jest.fn();
			await expect(
				resolver.imageUploader({ filename: 'test.png', mimetype: 'image/png', createReadStream } as never, target),
			).rejects.toThrow('Invalid image target');
			await expect(resolver.imagesUploader([], target)).rejects.toThrow('Invalid image target');
			expect(createReadStream).not.toHaveBeenCalled();
		},
	);
});
