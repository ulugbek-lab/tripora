import { GraphQLUpload, FileUpload } from 'graphql-upload';
import { PackageImageService } from './package-image.service';
import { OperationRateLimitGuard } from '../../libs/rate-limit';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { TravelPackageService } from './travel-package.service';
import { TravelPackages, TravelPackage } from '../../libs/dto/travel-package/travel-package';
import {
	AgentTravelPackagesInquiry,
	AllTravelPackagesInquiry,
	OrdinaryInquiry,
	TravelPackagesInquiry,
	TravelPackageInput,
} from '../../libs/dto/travel-package/travel-package.input';
import { BadRequestException, Optional, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';
import type { Types } from 'mongoose';
import mongoose from 'mongoose';
import { TravelPackageUpdate } from '../../libs/dto/travel-package/travel-package.update';
import { AuthGuard } from '../auth/guards/auth.guard';

@Resolver()
export class TravelPackageResolver {
	constructor(
		private readonly travelPackageService: TravelPackageService,
		@Optional() private readonly packageImageService?: PackageImageService,
	) {}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => [String])
	async uploadTravelPackageImages(
		@Args('files', { type: () => [GraphQLUpload] }) files: Promise<FileUpload>[],
	): Promise<string[]> {
		if (!this.packageImageService) throw new ServiceUnavailableException('Package image uploads are not configured');
		return this.packageImageService.upload(files);
	}

	//AGENT
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => TravelPackage)
	public async createTravelPackage(
		@Args('input') input: TravelPackageInput,
		@AuthMember('_id') memberId: mongoose.Types.ObjectId,
		@Args('files', { type: () => [GraphQLUpload], nullable: true }) files?: Promise<FileUpload>[],
	): Promise<TravelPackage> {
		if (files) {
			if (!this.packageImageService) throw new ServiceUnavailableException('Package image uploads are not configured');
			input.packageImages = await this.packageImageService.upload(files);
		}
		if (!input.packageImages?.length) throw new BadRequestException('At least one package image is required');
		return await this.travelPackageService.createTravelPackage(memberId, input);
	}

	//AGENT
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation((returns) => TravelPackage)
	public async updateTravelPackage(
		@Args('input') input: TravelPackageUpdate,
		@AuthMember('_id') memberId: Types.ObjectId,
		@Args('files', { type: () => [GraphQLUpload], nullable: true }) files?: Promise<FileUpload>[],
	): Promise<TravelPackage> {
		input._id = shapeIntoMongoObjectId(input._id);
		if (files) {
			await this.travelPackageService.assertOwnedTravelPackage(memberId, input._id);
			if (!this.packageImageService) throw new ServiceUnavailableException('Package image uploads are not configured');
			input.packageImages = await this.packageImageService.upload(files);
		}
		return await this.travelPackageService.updateTravelPackage(memberId, input);
	}

	//AGENT
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query((returns) => TravelPackages)
	public async getAgentTravelPackages(
		@Args('input') input: AgentTravelPackagesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackages> {
		return await this.travelPackageService.getAgentTravelPackages(memberId, input);
	}

	//Like
	@UseGuards(AuthGuard)
	@Mutation(() => TravelPackage)
	public async likeTargetTravelPackage(
		@Args('packageId') input: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackage> {
		const likeRefId = shapeIntoMongoObjectId(input);
		return await this.travelPackageService.likeTargetTravelPackage(memberId, likeRefId);
	}

	//ALL
	@UseGuards(OperationRateLimitGuard, WithoutGuard)
	@Query((returns) => TravelPackage)
	public async getTravelPackage(
		@Args('packageId') input: string,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackage> {
		const packageId = shapeIntoMongoObjectId(input);
		return await this.travelPackageService.getTravelPackage(memberId, packageId);
	}

	@UseGuards(OperationRateLimitGuard, WithoutGuard)
	@Query((returns) => TravelPackages)
	public async getTravelPackages(
		@Args('input') input: TravelPackagesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackages> {
		return await this.travelPackageService.getTravelPackages(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query((returns) => TravelPackages)
	public async getFavoriteTravelPackages(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackages> {
		return await this.travelPackageService.getFavoriteTravelPackages(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query((returns) => TravelPackages)
	public async getVisitedTravelPackages(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackages> {
		return await this.travelPackageService.getVisitedTravelPackages(memberId, input);
	}

	/** ADMIN  */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query((returns) => TravelPackages)
	public async getAllTravelPackagesByAdmin(
		@Args('input') input: AllTravelPackagesInquiry,
		@AuthMember('_id') memberId: Types.ObjectId,
	): Promise<TravelPackages> {
		return await this.travelPackageService.getAllTravelPackagesByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation((returns) => TravelPackage)
	public async updateTravelPackageByAdmin(@Args('input') input: TravelPackageUpdate): Promise<TravelPackage> {
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.travelPackageService.updateTravelPackageByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation((returns) => TravelPackage)
	public async removeTravelPackageByAdmin(@Args('packageId') input: string): Promise<TravelPackage> {
		const packageId = shapeIntoMongoObjectId(input);
		return await this.travelPackageService.removeTravelPackageByAdmin(packageId);
	}
}
