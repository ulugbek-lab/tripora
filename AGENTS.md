Tripora - Codex Instructions
Purpose
Modify the duplicated Nestar project into Tripora, a travel-package marketplace, while preserving Nestar's architecture and working behavior wherever the domain does not require a change.
Reference repositories:
- Backend: https://github.com/ulugbek-lab/nestar, branch develop
- Backend commit reviewed: b3a454b64335a24785a6f73cd5d6328ee59be190
This is the single authoritative instruction and backend-specification file for the Tripora backend repository. Do not look for a separate backend specification. The frontend will have its own AGENTS.md later.
All backend implementation and deferred-infrastructure guidance is contained in this file.
Product Goal
Create a marketplace where:
- USER members discover, like, view, and discuss travel packages and use the AI itinerary planner.
- AGENT members create and manage their own travel packages.
- ADMIN members moderate members, packages, and community content.
The first release is a minimal Nestar travel modification, not a full Expedia or Trip.com clone. Rename the property domain to travel packages, make only the field changes approved in this file, preserve shared modules, and add the AI itinerary component only after the converted backend works.
Architecture
Keep the recognizable Nestar request flow:
GraphQL client -> NestJS resolver -> service -> Mongoose model -> MongoDB
Keep the duplicated NestJS monorepo structure during the first modification phases:
- apps/tripora-api
- apps/tripora-batch
- the existing libs/ and application-local layout
Do not rename the Nest application folders or restructure the monorepo during the domain conversion. A later cleanup may rename them to Tripora only when the user explicitly requests it and the backend is already stable.
Scope Guardrails
- Do not implement live airline inventory, hotel inventory, payments, visa advice, or supplier APIs in the MVP.
- Do not add microservices, CQRS, Prisma, SQL, or REST domain controllers unless explicitly requested.
- Do not modify either Nestar reference repository.
- Replace property-specific domain names only where required by the approved mapping; do not redesign unrelated Nestar code.
- Do not generate the whole backend in one unverified step.
- Implement the AI itinerary component after auth, members, and travel packages work.
- Do not implement Booking; it is absent from the current ER model and backend scope.
- Do not implement Notice or Notification in the current MVP. They may remain in the ER model for a later optional phase.
Approved Nestar-to-Tripora Mapping
The TravelPackage domain must remain structurally close to Nestar's Property domain. Do not invent additional travel fields during the initial conversion.
Class and module mapping
Nestar	Tripora
Property	TravelPackage
PropertyModule	TravelPackageModule
PropertyService	TravelPackageService
PropertyResolver	TravelPackageResolver
PropertyInput	TravelPackageInput
PropertyUpdate	TravelPackageUpdate
PropertiesInquiry	TravelPackagesInquiry
PropertyType	TravelPackageType
PropertyStatus	TravelPackageStatus
Property.model.ts	TravelPackage.model.ts
properties collection	travelPackages collection


Use TravelPackage, not the generic class name Package.
Field mapping
Nestar field	Tripora field
propertyType	packageType
propertyStatus	packageStatus
propertyLocation	packageCountry
propertyAddress	packageCity
propertyTitle	packageTitle
propertyPrice	packagePrice
propertySquare	packageDurationDays
propertyBeds	packageMaxTravellers
propertyRooms	packageAvailableSlots
propertyViews	packageViews
propertyLikes	packageLikes
propertyComments	packageComments
propertyRank	packageRank
propertyImages	packageImages
propertyDesc	packageDesc
soldAt	soldOutAt
constructedAt	packageStartDate
memberProperties	memberPackages
propertyId	packageId


Add only this new package field:
packageCurrency: string;
Remove propertyBarter and propertyRent without replacements.
Do not add package region, departure city, end date, booking deadline, inclusions, exclusions, transport, hotel, persisted itinerary, publication timestamp, or booking fields during the initial conversion.
Core Data Contracts
Member
Keep Nestar's member schema and authentication flow. Rename only memberProperties to memberPackages for the package relationship. Keep the existing member identity, profile, engagement, rank, warning, block, deletion, and timestamp fields.
Do not add:
- memberLanguages
- memberAgencyName
- memberBookings
Never expose memberPassword through GraphQL.
TravelPackage
The initial schema must match the approved ER model:
{
	packageType: TravelPackageType;
	packageStatus: TravelPackageStatus;
	packageCountry: string;
	packageCity: string;
	packageTitle: string;
	packagePrice: number;
	packageCurrency: string;
	packageDurationDays: number;
	packageMaxTravellers: number;
	packageAvailableSlots: number;
	packageViews: number;
	packageLikes: number;
	packageComments: number;
	packageRank: number;
	packageImages: string[];
	packageDesc?: string;
	memberId: Types.ObjectId;
	soldOutAt?: Date;
	deletedAt?: Date;
	packageStartDate: Date;
	createdAt: Date;
	updatedAt: Date;
}
Mongoose requirements:
- Model/reference name: TravelPackage.
- Collection name: travelPackages.
- Enable timestamps.
- memberId references Member and comes from the authenticated agent.
- Counters default to 0.
- Use Nestar's existing soft-delete behavior.
- packageAvailableSlots must not exceed packageMaxTravellers.
- Set soldOutAt when a package becomes sold out and clear it if the package becomes available again.
Validation requirements:
- Validate country, city, title, currency, images, type, status, price, duration, capacity, slots, and start date.
- packageTitle should be 5-120 characters.
- packagePrice >= 0.
- packageCurrency must be an uppercase three-letter code from an allowlist.
- packageDurationDays >= 1.
- packageMaxTravellers >= 1.
- 0 <= packageAvailableSlots <= packageMaxTravellers.
- Require at least one package image when creating an active package.
- Reject or ignore client-supplied owner IDs, counters, rank, and system timestamps.
Recommended indexes:
{ packageType: 1, packageCountry: 1, packageCity: 1, packageTitle: 1, packagePrice: 1 }
{ packageStatus: 1, packageStartDate: 1 }
{ memberId: 1, packageStatus: 1 }
{ packageRank: -1 }
Do not create an itinerary subdocument or another itinerary collection. AI-generated itineraries are response data only.
Shared engagement
Keep the existing Like, View, Comment, and Follow models. Change only the property group value:
export enum LikeGroup {
	MEMBER = 'MEMBER',
	TRAVEL_PACKAGE = 'TRAVEL_PACKAGE',
	ARTICLE = 'ARTICLE',
}

export enum ViewGroup {
	MEMBER = 'MEMBER',
	TRAVEL_PACKAGE = 'TRAVEL_PACKAGE',
	ARTICLE = 'ARTICLE',
}

export enum CommentGroup {
	MEMBER = 'MEMBER',
	TRAVEL_PACKAGE = 'TRAVEL_PACKAGE',
	ARTICLE = 'ARTICLE',
}
Keep the generic likeRefId, viewRefId, and commentRefId architecture. Preserve or add appropriate compound unique indexes for likes, retained visits, and follow relationships.
BoardArticle
Keep Nestar's article structure. Use travel-oriented categories:
export enum BoardArticleCategory {
	DESTINATION = 'DESTINATION',
	TRAVEL_TIPS = 'TRAVEL_TIPS',
	NEWS = 'NEWS',
	EXPERIENCE = 'EXPERIENCE',
}
Notices and notifications
They may remain in the ER model but are not MVP modules. Do not scaffold them. If existing Nestar notification code must remain temporarily for compilation, change only propertyId to packageId and the Mongoose reference from Property to TravelPackage. Do not add bookingId.
Domain Enums
Use a small replacement for the Nestar Property enums:
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
This status enum intentionally stays close to Nestar's ACTIVE | SOLD | DELETE. Do not add draft, payment, booking, or supplier states without an approved requirement. Register every GraphQL enum using registerEnumType.
Backend Stack and Structure
Required backend technologies:
- TypeScript
- NestJS monorepo
- NestJS code-first GraphQL with Apollo
- MongoDB with Mongoose
- class-validator and class-transformer
- JWT authentication and bcryptjs
- Nest schedule for background jobs
Deferred infrastructure options - do not implement until the user requests the relevant phase:
- Cloudinary for member, package, and article media
- Redis for explicit cache-aside caching and shared infrastructure state
- @nestjs/throttler and a shared store for distributed rate limiting
- BullMQ for background jobs
- WebSockets for concrete real-time notification behavior
- Load balancing, CDN/WAF, and multiple API replicas
For the initial backend phases, use the simplest buildable development setup. Keep narrow abstractions such as MediaService so a later provider can be added without changing domain logic, but do not install or configure deferred infrastructure merely because it appears in the planning documents.
During conversion, use the existing API layout and replace the property feature in place:
apps/tripora-api/src/
├── components/
│   ├── auth/
│   ├── member/
│   ├── travel-package/
│   ├── board-article/
│   ├── comment/
│   ├── like/
│   ├── view/
│   ├── follow/
│   └── travel-ai/
├── database/
├── libs/
│   ├── dto/
│   ├── enums/
│   ├── interceptor/
│   ├── types/
│   └── config.ts
├── schemas/
├── app.module.ts
├── app.resolver.ts
└── main.ts
Optional components such as notice, notification, and socket must not be scaffolded until the user requests them. Do not scaffold a booking component.
Each persistent feature normally contains:
components/feature/feature.module.ts
components/feature/feature.resolver.ts
components/feature/feature.service.ts
schemas/Entity.model.ts
libs/dto/entity/entity.ts
libs/dto/entity/entity.input.ts
libs/dto/entity/entity.update.ts
libs/enums/entity.enum.ts
Backend Conventions
GraphQL and DTOs
- Use code-first decorators: @ObjectType(), @InputType(), and @Field().
- Register every GraphQL enum with registerEnumType.
- Separate create, update, inquiry/search, and output types.
- Paginated outputs use { list, metaCounter }.
- Validate all external inputs.
- Treat MongoDB ObjectIds as Types.ObjectId internally and validate string IDs before conversion.
- Never expose memberPassword, tokens, or secrets through GraphQL.
Resolvers and Services
- Keep resolvers thin: obtain authenticated identity, apply guards, shape IDs, log the operation, and call services.
- Keep authorization, ownership checks, package status changes, AI validation, and database operations in services.
- Never trust client-supplied memberId, owner IDs, prices, ranks, counters, or status timestamps.
- Use narrow stats-editor methods with $inc, and prevent counters from becoming negative.
- Return empty paginated results for valid searches with no matches; do not throw a server error.
Aggregation and Personalization
The latest Nestar backend adds authenticated lookup helpers, favorite lists, and visited lists. Adapt these patterns for packages:
- Public package lists may attach meLiked when optional authentication resolves a member.
- Package details may attach memberData, meLiked, and agent-follow state.
- getFavoriteTravelPackages starts from likes, joins packages, then attaches agent data.
- getVisitedTravelPackages starts from views, joins packages, then attaches agent data.
- Guard against an empty aggregation result before accessing data[0].
- Apply $skip and $limit only after the complete filter for the intended list is established.
- Create compound unique indexes for per-member likes and unique package visits instead of relying only on service logic.
GraphQL Contract
Preserve Nestar's operation patterns and rename the Property operations:
createTravelPackage(input)                    AGENT
updateTravelPackage(input)                    owning AGENT
getAgentTravelPackages(input)                 AGENT
likeTargetTravelPackage(packageId)            authenticated member
getTravelPackage(packageId)                   public, optional auth
getTravelPackages(input)                      public, optional auth
getFavoriteTravelPackages(input)              authenticated member
getVisitedTravelPackages(input)               authenticated member
getAllTravelPackagesByAdmin(input)            ADMIN
updateTravelPackageByAdmin(input)             ADMIN
removeTravelPackageByAdmin(packageId)         ADMIN, soft-deleted only
getTravelPackage must return an accessible package, record a member view when appropriate, attach meLiked for authenticated users, and attach the owning agent as memberData.
getTravelPackages must work with and without optional authentication, attach meLiked only when a valid member is resolved, and return { list, metaCounter } safely when the list is empty.
Favorite and visited package operations must derive the member ID from authentication, begin with the Like or View collection, join only accessible packages, attach agent data, and never expose another member's private history.
Keep equivalent Auth, Member, Article, Comment, Like, View, and Follow operations unless a property-specific name must change.
Search and Pagination Contract
Keep the inquiry structure close to Nestar:
{
	page: number;
	limit: number;
	sort?: string;
	direction?: Direction;
	search: {
		memberId?: Types.ObjectId;
		countryList?: string[];
		cityList?: string[];
		typeList?: TravelPackageType[];
		priceRange?: { start: number; end: number };
		durationRange?: { start: number; end: number };
		maxTravellersRange?: { start: number; end: number };
		startDateRange?: { start: Date; end: Date };
		text?: string;
	};
}
- Public lists return accessible ACTIVE packages.
- Text search may match package title, country, and city.
- Do not compare prices across currencies as if they have equal value.
- Escape text before creating a regular expression.
- Add array filters only when the array has values.
- Allowlist dynamic sort fields.
- Useful sort fields include createdAt, updatedAt, packageLikes, packageViews, packageRank, packagePrice, and packageStartDate.
- Apply the complete match before pagination.
- Keep the list and total counter based on the same match criteria.
Cloudinary Media - Later Optional Phase
Do not implement this section during the core backend phases unless the user explicitly chooses Cloudinary.
- Keep Cloudinary credentials only on the server.
- For the MVP, validate GraphQL uploads and stream them from the API to Cloudinary.
- A later signed direct-upload flow may reduce API bandwidth, but the backend must generate the signature and authorize the target folder.
- Store at least secureUrl, publicId, resourceType, width, height, format, and bytes for each retained asset.
- Use controlled folders such as travel/members, travel/packages, and travel/articles.
- Never trust a client-supplied Cloudinary public ID or folder.
- Delete replaced assets only after the new database state succeeds, and queue cleanup for orphaned assets.
- Use Cloudinary transformations/CDN delivery instead of generating many image sizes inside the API.
Redis Cache - Later Optional Phase
Do not install Redis or add caching until the core package queries are correct, tested, and measured.
- Use explicit cache-aside logic for GraphQL services; do not rely on HTTP response interceptors for field-level GraphQL caching.
- Cache public, read-heavy, non-sensitive results such as package details, package searches, ranked packages, agent lists, and public articles.
- Do not cache authentication results, raw tokens, upload payloads, authorization decisions, or other private user data.
- Include query filters, pagination, sorting, locale, and currency context in deterministic cache keys.
- Use short TTLs and invalidate relevant keys after package, member, engagement, or article mutations.
- Treat Redis as an optimization: if cache access fails, log it and read from MongoDB unless the feature requires Redis for correctness.
- Prevent cache stampedes for expensive popular queries with a short lock or stale-while-revalidate approach when needed.
Rate Limiting - Later Optional Phase
Keep validation and authorization in the MVP. Add application throttling when the user begins the infrastructure-hardening phase.
- Use @nestjs/throttler with named global, authentication, upload, and AI limits.
- Override the GraphQL throttler guard using GqlExecutionContext so it resolves the real request context correctly.
- Key anonymous limits by trusted client IP and authenticated limits by member ID where appropriate.
- Use a shared Redis-backed store before running more than one API instance.
- Apply strict limits to login/signup, uploads, AI generation, comment creation, and password/reset-like operations.
- Return a predictable error code and retry metadata without leaking whether an account exists.
- Configure trusted proxies explicitly before reading forwarded IP headers.
Batch Jobs
Use the existing apps/tripora-batch application for scheduled work during the initial conversion. Avoid broad cross-application refactoring in the first phase; move contracts to a shared root library only when a concrete dependency requires it.
Every scheduled job must be:
- idempotent;
- safe to retry;
- protected against overlapping runs where necessary;
- observable through structured logs;
- tested against repeated execution.
Initial jobs may expire packages, mark sold-out packages, and calculate ranks. Departure reminders belong to a later notification phase.
Queues and Workers - Later Optional Phase
Do not create queues or workers until the application has real slow/retryable side effects.
- Use BullMQ for later slow or retryable side effects such as email, analytics events, orphan-media cleanup, or asynchronous AI generation.
- Give jobs stable IDs or idempotency keys, bounded retries, exponential backoff, timeouts, and a failed-job policy.
- A queue worker may live in the existing batch application initially; split it only when operational scaling requires it.
- In production, prefer separate Redis deployments for cache/rate limiting and BullMQ because caches benefit from eviction while BullMQ requires queue keys not to be evicted.
WebSockets - Later Optional Phase
The latest Nestar backend contains an initial connection-count gateway and echo message handler. Treat it as a structural example only.
- Do not add a socket server merely to count connections.
- Add it only if a later chat or notification feature has a defined event contract.
- Choose one transport deliberately: native ws with @nestjs/platform-ws, or Socket.IO with its Nest adapter. Do not mix client and server protocols.
- Authenticate the connection, authorize rooms/channels, validate event payloads, and never trust client-selected user IDs.
- Keep GraphQL as the source of truth; WebSockets announce changes and the client refetches or updates the Apollo cache safely.
Authentication and Authorization
Keep these roles exactly unless the user approves a change:
export enum MemberType {
	USER = 'USER',
	ADMIN = 'ADMIN',
	AGENT = 'AGENT',
}
- USER: browse, like, view, comment, follow, publish permitted articles, and use the AI itinerary planner.
- AGENT: perform appropriate member actions and manage only their own travel packages.
- ADMIN: global moderation and administrative operations.
- Hard deletion is allowed only for eligible soft-deleted records.
- Client-side guards are not authoritative; the backend must enforce every permission.
Travel Business Rules
- A package owner comes from the authenticated agent.
- Keep packagePrice as the Nestar-compatible numeric/double field during this modification and store packageCurrency separately. Revisit integer minor units only if payments are added later.
- Public queries return only accessible active travel packages.
- Agents may update or soft-delete only packages they own.
- Preserve Nestar-style views, likes, comments, follows, articles, favorites, and visited-package queries.
- packageAvailableSlots is display/filtering data in the MVP; do not add reservation or transactional capacity logic.
AI Boundary
- AI itinerary generation is part of the MVP, but implement it only after auth, members, travel packages, and shared engagement features compile.
- Keep provider code inside TravelAiService.
- Validate structured AI output before returning it.
- Do not claim live flight prices, hotel availability, visa requirements, reservation confirmation, or safety guarantees.
- Do not persist generated itineraries by default.
- Keep provider keys in environment variables and commit only placeholder names.
Suggested input:
{
	destination: string;
	durationDays: number;
	budget: number;
	currency: string;
	travellerCount: number;
	interests: string[];
}
Return a validated plan title, one entry per requested day, suggested activities, short descriptions, optional meal/accommodation suggestions, clearly labelled budget estimates, and a warning that live prices and availability must be verified.
System-Design Boundary
Deferred infrastructure is a future roadmap, not the current implementation checklist. Do not implement it unless the user explicitly selects that phase.
When system-design work begins, build a production-shaped modular monolith before distributing the system:
1. API, MongoDB, validation, indexes, tests, and the AI itinerary component.
2. Redis cache and distributed rate limits.
3. BullMQ workers for asynchronous side effects.
4. Health/readiness endpoints, structured logs, metrics, tracing, and backups.
5. Stateless API replicas behind one load balancer only when load testing or real traffic justifies them.
6. Edge CDN/WAF and multi-region design only when deployment requirements justify the operational cost.
Do not add Kafka, Kubernetes, Elasticsearch/OpenSearch, multiple microservices, or multi-region databases as resume decorations. Introduce them only when a measured requirement cannot be met cleanly by the modular monolith.
Correctness Improvements Over Nestar
- Respect strict null checking for Mongoose results.
- Guard empty aggregation arrays before reading data[0].
- Check array length before adding $in filters.
- Escape user search text before creating regular expressions.
- Allowlist all dynamic sort fields.
- Use compound filters with findOneAndDelete, not findByIdAndDelete.
- Keep schema enums, DTO enums, and GraphQL enums aligned.
- Remove debug console.log statements from production paths.
- Use the correct upload options and validate MIME type, size, count, and generated paths.
- Do not import application-internal files across backend apps.
- Remove unused imports and never use as any to hide domain type errors.
- Verify bootstrap syntax and run builds; do not assume the reference branch compiles.
- Never let a cache hit bypass authorization or package accessibility rules.
- Do not clear all Redis keys after a mutation; invalidate the smallest safe key/tag set.
- Do not reuse cache Redis eviction settings for a production BullMQ deployment.
- Never expose Cloudinary API secrets or generate unrestricted upload signatures.
- Do not acknowledge queued side effects as completed; distinguish accepted/queued from sent/finished.
Implementation Phases
Phase 0 - Baseline
- Inspect git status and preserve unrelated changes.
- Install dependencies using the repository's package manager.
- Run the duplicated Nestar build before modifying code.
- Record existing failures separately from failures introduced by the conversion.
- Use a separate Tripora development database.
- Do not rename apps/tripora-api or apps/tripora-batch.
Phase 1 - TravelPackage Conversion
- Rename Property files, classes, DTOs, enums, schema, service, resolver, and module.
- Apply only the approved field mapping in this file.
- Add packageCurrency.
- Remove propertyBarter and propertyRent.
- Use the travelPackages collection and TravelPackage model/reference.
- Build and fix conversion-related failures before continuing.
Phase 2 - Direct References
- Rename memberProperties to memberPackages.
- Change shared PROPERTY group values to TRAVEL_PACKAGE.
- Update favorites, visited packages, counters, aggregations, notification references, and batch imports.
- Search for remaining Property, property, and properties domain references.
- Review every match; do not run a blind global replacement.
Phase 3 - Verification
- Verify agent ownership and package CRUD.
- Verify public search, details, pagination, favorites, and history.
- Verify likes, views, comments, follows, and articles.
- Verify optional-auth operations for authenticated and anonymous callers.
- Run the build, GraphQL schema generation, formatting, and available tests.
Phase 4 - AI Itinerary
- Add an isolated TravelAiModule and TravelAiService.
- Validate user input and provider output.
- Return non-persisted suggestions.
- Test malformed output, timeout, and provider-failure paths.
Later optional phases
- Notices and notifications only if the user requests them.
- Cloudinary, Redis, rate limiting, BullMQ, observability, and scaling only when explicitly requested.
- External hotel, airline, payment, email, or messaging providers only after approval.
- There is no booking implementation phase in the current project scope.
Testing Priorities
At minimum, test:
- Signup uniqueness and hidden passwords.
- Login success and failure conditions.
- Blocked/deleted member behavior.
- Role and package-ownership restrictions.
- TravelPackage create/update validation.
- Package status and soft deletion.
- Public filters, sort allowlist, pagination, and totals.
- Anonymous and authenticated optional-auth package queries.
- Likes, views, comments, favorites, and visited-package behavior.
- Empty aggregation results.
- Admin hard-delete eligibility.
- Batch behavior affected by the conversion.
- AI validation, timeout, malformed output, and provider errors after Phase 4.
Workflow
For each implementation phase:
1. Inspect current git status and preserve unrelated user changes.
2. Re-check the relevant reference branch if access is available.
3. State the small phase scope.
4. Implement only that phase and required dependencies.
5. Format changed files.
6. Run the build and relevant tests.
7. Fix failures caused by the change.
8. Summarize changed files, behavior, validation performed, and remaining work.
Do not use destructive git commands. Do not commit or push unless the user requests it.
Completion Requirements
A phase is complete only when:
- code compiles with strict null checking;
- GraphQL schema generation succeeds;
- inputs are validated;
- role and ownership rules are enforced by the backend;
- indexes and relationships are intentional;
- paginated queries return correct lists and totals;
- important success, authorization, concurrency, and failure paths have tests;
- .env.example contains names only, never real secrets;
- travel modules contain no leftover real-estate names;
- generated GraphQL operations and schema remain internally consistent.
When a deferred infrastructure phase is explicitly implemented, its additional completion requirements apply:
- Cloudinary assets retain the public IDs required for replacement and deletion;
- cache invalidation tests cover package mutations and engagement counter changes;
- rate-limit tests cover protected operations and trusted proxy behavior;
- queued jobs are idempotent and expose failed-job observability.