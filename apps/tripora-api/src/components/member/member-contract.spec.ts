import { Types } from 'mongoose';
import { MemberService } from './member.service';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';

function fixture() {
	const id = new Types.ObjectId();
	const result = { _id: id, memberStatus: MemberStatus.ACTIVE, memberViews: 0 };
	const model = {
		create: jest.fn(async () => ({ ...result })),
		findOne: jest.fn(() => ({
			lean: () => ({ exec: async () => ({ ...result }) }),
		})),
		findOneAndUpdate: jest.fn(() => ({
			exec: async () => ({ ...result }),
			then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve({ ...result })),
		})),
	};
	const auth = {
		hashPassword: jest.fn(async () => 'hashed-password'),
		createToken: jest.fn(async () => 'token'),
	};
	const view = { recordView: jest.fn(async () => ({ _id: id })) };
	const like = { checkLikeExistance: jest.fn(async () => []) };
	const follow = { findOne: jest.fn(() => ({ exec: async () => null })) };
	return {
		id,
		model,
		auth,
		service: new MemberService(model as never, follow as never, auth as never, view as never, like as never),
	};
}
describe('Member frontend contract safety', () => {
	it('rejects public ADMIN signup before creating an account', async () => {
		const f = fixture();
		await expect(
			f.service.signup({
				memberNick: 'agent',
				memberPassword: 'password',
				memberPhone: '123',
				memberType: MemberType.ADMIN,
			}),
		).rejects.toThrow();
		expect(f.model.create).not.toHaveBeenCalled();
	});
	it.each([MemberType.USER, MemberType.AGENT])('preserves %s signup and hashed passwords', async (memberType) => {
		const f = fixture();
		await f.service.signup({
			memberNick: 'agent',
			memberPassword: 'password',
			memberPhone: '123',
			memberType,
		});
		expect(f.model.create).toHaveBeenCalledWith(
			expect.objectContaining({
				memberType,
				memberPassword: 'hashed-password',
			}),
		);
	});
	it.each([{ memberType: MemberType.ADMIN }, { memberStatus: MemberStatus.ACTIVE }])(
		'rejects self-service permission changes %#',
		async (changes) => {
			const f = fixture();
			await expect(f.service.updateMember(f.id, { _id: f.id, ...changes } as never)).rejects.toThrow();
			expect(f.model.findOneAndUpdate).not.toHaveBeenCalled();
		},
	);
	it('uses authenticated identity, excludes system fields, and hashes profile passwords', async () => {
		const f = fixture();
		await f.service.updateMember(f.id, {
			_id: new Types.ObjectId(),
			memberPassword: 'password',
			memberFullName: 'Traveller',
			deletedAt: new Date(),
		} as never);
		expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: f.id, memberStatus: MemberStatus.ACTIVE },
			{
				$set: {
					memberPassword: 'hashed-password',
					memberFullName: 'Traveller',
				},
			},
			{ new: true, runValidators: true },
		);
	});
	it('hashes passwords on admin updates', async () => {
		const f = fixture();
		await f.service.updateMemberByAdmin({
			_id: f.id,
			memberPassword: 'password',
			memberType: MemberType.AGENT,
		} as never);
		expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: f.id },
			{
				$set: {
					memberPassword: 'hashed-password',
					memberType: MemberType.AGENT,
				},
			},
			{ new: true, runValidators: true },
		);
	});
	it('records authenticated member views with a filter rather than treating the filter as an ID', async () => {
		const f = fixture();
		await f.service.getMember(f.id, f.id);
		expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
			{
				_id: f.id,
				memberStatus: { $in: [MemberStatus.ACTIVE, MemberStatus.BLOCK] },
			},
			{ $inc: { memberViews: 1 } },
			{ new: true },
		);
	});
});
