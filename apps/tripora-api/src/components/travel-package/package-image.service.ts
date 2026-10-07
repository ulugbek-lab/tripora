import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import type { FileUpload } from 'graphql-upload';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export const PACKAGE_IMAGE_LIMITS = { count: 10, bytes: 5 * 1024 * 1024 } as const;
@Injectable()
export class PackageImageService {
	async upload(files: Promise<FileUpload>[]): Promise<string[]> {
		if (files.length < 1 || files.length > PACKAGE_IMAGE_LIMITS.count)
			throw new BadRequestException('Invalid package image count');
		const buffers = await Promise.all(files.map(async (file) => this.validateFile(await file)));
		const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
		if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
			throw new ServiceUnavailableException('Package image uploads are not configured');
		cloudinary.config({
			cloud_name: CLOUDINARY_CLOUD_NAME,
			api_key: CLOUDINARY_API_KEY,
			api_secret: CLOUDINARY_API_SECRET,
			secure: true,
		});
		const urls: string[] = [];
		try {
			for (const buffer of buffers) {
				const result = await this.uploadImage(buffer);

				urls.push(result.secure_url);
			}
		} catch {
			throw new BadGatewayException('Package image upload failed');
		}
		return urls;
	}

	private async validateFile(file: FileUpload): Promise<Buffer> {
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
			throw new BadRequestException('Unsupported package image type');
		const chunks: Buffer[] = [];
		let size = 0;
		try {
			for await (const chunk of file.createReadStream()) {
				const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += data.length;
				if (size > PACKAGE_IMAGE_LIMITS.bytes) throw new BadRequestException('Package image exceeds 5 MB');
				chunks.push(data);
			}
		} catch (error: unknown) {
			if (error instanceof BadRequestException) throw error;
			throw new BadRequestException('Package image could not be read');
		}
		const data = Buffer.concat(chunks);
		const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		const jpeg = data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
		const webp =
			data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
		const valid = file.mimetype === 'image/png' ? png : file.mimetype === 'image/jpeg' ? jpeg : webp;
		if (!valid) throw new BadRequestException('Package image content does not match its type');
		return data;
	}

	private uploadImage(data: Buffer): Promise<UploadApiResponse> {
		return new Promise((resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(
				{
					folder: 'tripora/packages',
					resource_type: 'image',
					allowed_formats: ['jpg', 'png', 'webp'],
					overwrite: false,
					timeout: 15000,
				},
				(error, result) => {
					if (error || !result?.secure_url?.startsWith('https://') || result.resource_type !== 'image')
						return reject(new Error('Package image upload failed'));
					resolve(result);
				},
			);
			pipeline(Readable.from(data), stream).catch(() => reject(new Error('Package image upload failed')));
		});
	}
}
