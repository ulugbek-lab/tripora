import { AuthService } from '../auth/auth.service';
import { RateLimitModule } from '../../libs/rate-limit';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { graphqlUploadExpress } from 'graphql-upload';
import request from 'supertest';
import { TravelPackageService } from './travel-package.service';
import { TravelPackageType } from '../../libs/enums/travel-package.enum';
import { Readable, Writable } from 'stream';
import { Types } from 'mongoose';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import type { FileUpload } from 'graphql-upload';
import { PackageImageService, PACKAGE_IMAGE_LIMITS } from './package-image.service';
import { TravelPackageResolver } from './travel-package.resolver';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberType } from '../../libs/enums/member.enum';

jest.mock('cloudinary', () => ({ v2: { config: jest.fn(), uploader: { upload_stream: jest.fn() } } }));
const owner = new Types.ObjectId();
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = (data = png, mimetype = 'image/png'): FileUpload =>
	({ filename: 'test.png', mimetype, encoding: '7bit', createReadStream: () => Readable.from(data) }) as FileUpload;

describe('TravelPackage Cloudinary uploads', () => {
	const old = {
		CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
		CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
		CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
	};
	let service: PackageImageService;
	beforeEach(() => {
		jest.clearAllMocks();
		process.env.CLOUDINARY_CLOUD_NAME = 'synthetic';
		process.env.CLOUDINARY_API_KEY = 'synthetic';
		process.env.CLOUDINARY_API_SECRET = 'synthetic';
		service = new PackageImageService();
		(cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
			(_options, callback) =>
				new Writable({
					write(_chunk, _encoding, done) {
						done();
					},
					final(done) {
						callback(undefined, {
							secure_url: 'https://example.invalid/package.png',
							public_id: 'provider-assigned',
							resource_type: 'image',
							width: 1,
							height: 1,
							format: 'png',
							bytes: 8,
						});
						done();
					},
				}),
		);
	});
	afterAll(() => {
		for (const [name, value] of Object.entries(old)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});
	it('uploads multiple images directly and returns secure URLs', async () => {
		expect(await service.upload([Promise.resolve(file()), Promise.resolve(file())])).toEqual([
			'https://example.invalid/package.png',
			'https://example.invalid/package.png',
		]);
		expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(2);
		expect((cloudinary.uploader.upload_stream as jest.Mock).mock.calls[0][0]).toMatchObject({
			folder: 'tripora/packages',
			resource_type: 'image',
			overwrite: false,
		});
	});
	it.each([file(png, 'text/plain'), file(Buffer.from('fake image'), 'image/png')])(
		'rejects invalid image type/content',
		async (image) => {
			await expect(service.upload([Promise.resolve(image)])).rejects.toThrow();
			expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
		},
	);
	it('rejects oversized uploads without calling Cloudinary', async () => {
		await expect(service.upload([Promise.resolve(file(Buffer.alloc(PACKAGE_IMAGE_LIMITS.bytes + 1)))])).rejects.toThrow(
			'5 MB',
		);
		expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
	});
	it('rejects invalid image counts', async () => {
		await expect(service.upload([])).rejects.toThrow('count');
		await expect(service.upload(Array.from({ length: 11 }, () => Promise.resolve(file())))).rejects.toThrow('count');
	});
	it('sanitizes Cloudinary provider failures', async () => {
		(cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
			(_options, callback) =>
				new Writable({
					write(_chunk, _encoding, done) {
						done();
					},
					final(done) {
						callback(new Error('private provider details'));
						done();
					},
				}),
		);
		await expect(service.upload([Promise.resolve(file())])).rejects.toMatchObject({
			status: 502,
			message: 'Package image upload failed',
		});
	});
	it('handles missing configuration without exposing credentials', async () => {
		delete process.env.CLOUDINARY_API_SECRET;
		await expect(service.upload([Promise.resolve(file())])).rejects.toMatchObject({ status: 503 });
		expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
	});
	it.each([MemberType.USER, MemberType.ADMIN])('blocks unauthorized %s uploads', async (memberType) => {
		const guard = new RolesGuard(new Reflector(), {
			verifyToken: jest.fn(async () => ({ _id: owner, memberType })),
		} as never);
		const context = {
			contextType: 'graphql',
			getHandler: () => TravelPackageResolver.prototype.uploadTravelPackageImages,
			getArgByIndex: () => ({ req: { headers: { authorization: 'Bearer synthetic' }, body: {} } }),
		} as unknown as ExecutionContext;
		await expect(guard.canActivate(context)).rejects.toThrow();
	});
	it('blocks unauthenticated uploads', async () => {
		const guard = new RolesGuard(new Reflector(), {} as never);
		const context = {
			contextType: 'graphql',
			getHandler: () => TravelPackageResolver.prototype.uploadTravelPackageImages,
			getArgByIndex: () => ({ req: { headers: {}, body: {} } }),
		} as unknown as ExecutionContext;
		await expect(guard.canActivate(context)).rejects.toThrow();
	});
	it('accepts an authenticated agent and forwards files without a client-controlled folder', async () => {
		const guard = new RolesGuard(new Reflector(), {
			verifyToken: jest.fn(async () => ({ _id: owner, memberType: MemberType.AGENT })),
		} as never);
		const context = {
			contextType: 'graphql',
			getHandler: () => TravelPackageResolver.prototype.uploadTravelPackageImages,
			getArgByIndex: () => ({ req: { headers: { authorization: 'Bearer synthetic' }, body: {} } }),
		} as unknown as ExecutionContext;
		expect(await guard.canActivate(context)).toBe(true);
		const uploads = [Promise.resolve(file())];
		expect(await new TravelPackageResolver({} as never, service).uploadTravelPackageImages(uploads)).toEqual([
			'https://example.invalid/package.png',
		]);
	});
	it('creates a package with uploaded files through an actual GraphQL multipart request', async () => {
		const createTravelPackage = jest.fn(async (_owner, input) => ({ _id: owner, ...input }));
		const module = await Test.createTestingModule({
			imports: [RateLimitModule, GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true, uploads: false })],
			providers: [
				{ provide: AuthService, useValue: {} },
				TravelPackageResolver,
				{ provide: TravelPackageService, useValue: { createTravelPackage } },
				{ provide: PackageImageService, useValue: service },
			],
		})
			.overrideGuard(RolesGuard)
			.useValue({
				canActivate: (context: ExecutionContext) => {
					context.getArgByIndex(2).req.body.authMember = { _id: owner, memberType: MemberType.AGENT };
					return true;
				},
			})
			.compile();
		const app = module.createNestApplication();
		app.use(graphqlUploadExpress({ maxFiles: 10 }));
		app.useGlobalPipes(new ValidationPipe());
		try {
			await app.init();
			const input = {
				packageType: TravelPackageType.GROUP,
				packageCountry: 'Korea',
				packageCity: 'Seoul',
				packageTitle: 'Seoul discovery',
				packagePrice: 100,
				packageCurrency: 'USD',
				packageDurationDays: 3,
				packageMaxTravellers: 10,
				packageAvailableSlots: 5,
				packageStartDate: '2027-01-01T00:00:00.000Z',
			};
			const operations = {
				query:
					'mutation Create($input: TravelPackageInput!, $files: [Upload!]) { createTravelPackage(input: $input, files: $files) { _id packageImages } }',
				variables: { input, files: [null] },
			};
			const response = await request(app.getHttpServer())
				.post('/graphql')
				.set('Apollo-Require-Preflight', 'true')
				.field('operations', JSON.stringify(operations))
				.field('map', JSON.stringify({ '0': ['variables.files.0'] }))
				.attach('0', png, { filename: 'package.png', contentType: 'image/png' });
			expect(response.body.errors).toBeUndefined();
			expect(response.body.data.createTravelPackage.packageImages).toEqual(['https://example.invalid/package.png']);
			expect(createTravelPackage).toHaveBeenCalledWith(
				owner,
				expect.objectContaining({ packageImages: ['https://example.invalid/package.png'] }),
			);
		} finally {
			await app.close();
		}
	});
	it('uploads update files only after checking ownership, then forwards their URLs', async () => {
		const packages = {
			assertOwnedTravelPackage: jest.fn(),
			updateTravelPackage: jest.fn(async (_owner, input) => input),
		};
		const resolver = new TravelPackageResolver(packages as never, service);
		const input = { _id: owner };
		const result = await resolver.updateTravelPackage(input, owner, [Promise.resolve(file())]);
		expect(packages.assertOwnedTravelPackage).toHaveBeenCalledWith(owner, owner);
		expect(result.packageImages).toEqual(['https://example.invalid/package.png']);
		expect(packages.updateTravelPackage).toHaveBeenCalledWith(
			owner,
			expect.objectContaining({ packageImages: result.packageImages }),
		);
	});
	it('does not upload images or update a package when ownership is denied', async () => {
		const packages = {
			assertOwnedTravelPackage: jest.fn(async () => {
				throw new Error('Not allowed');
			}),
			updateTravelPackage: jest.fn(),
		};
		await expect(
			new TravelPackageResolver(packages as never, service).updateTravelPackage({ _id: owner }, owner, [
				Promise.resolve(file()),
			]),
		).rejects.toThrow('Not allowed');
		expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
		expect(packages.updateTravelPackage).not.toHaveBeenCalled();
	});
	it('retains URL-only creation and requires images when no files are supplied', async () => {
		const packages = { createTravelPackage: jest.fn(async (_owner, input) => input) };
		const resolver = new TravelPackageResolver(packages as never, service);
		await resolver.createTravelPackage({ packageImages: ['https://example.invalid/existing.png'] } as never, owner);
		expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
		await expect(resolver.createTravelPackage({} as never, owner)).rejects.toThrow('At least one package image');
	});
});
