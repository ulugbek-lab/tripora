# TravelPackage GraphQL uploads

Authenticated AGENT requests can upload images while creating or updating a package.
Generated signatures:

```graphql
createTravelPackage(input: TravelPackageInput!, files: [Upload!]): TravelPackage!
updateTravelPackage(input: TravelPackageUpdate!, files: [Upload!]): TravelPackage!
```

`files` is optional. When supplied, uploaded URLs replace `input.packageImages`.
Omit `packageImages` from create input when supplying files; do not send an empty array.
When files are omitted, create requires at least one URL in `packageImages`.
Update with neither files nor `packageImages` keeps the existing images.
Uploads accept JPEG, PNG and WebP, up to 5 MB each, with 1–10 files.
Cloudinary credentials remain in environment variables. The folder is fixed to `tripora/packages`.

## Multipart create example

Use an AGENT bearer token. Set `AGENT_TOKEN` locally without committing it.
Replace the two image file paths in the command. The default local API port is 3009.

```bash
curl 'http://localhost:3009/graphql' \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H 'Apollo-Require-Preflight: true' \
  -F 'operations={"query":"mutation Create($input: TravelPackageInput!, $files: [Upload!]) { createTravelPackage(input: $input, files: $files) { _id packageTitle packageImages } }","variables":{"input":{"packageType":"GROUP","packageCountry":"Korea","packageCity":"Seoul","packageTitle":"Seoul discovery","packagePrice":100,"packageCurrency":"USD","packageDurationDays":3,"packageMaxTravellers":10,"packageAvailableSlots":5,"packageStartDate":"2027-01-01T00:00:00.000Z"},"files":[null,null]}}' \
  -F 'map={"0":["variables.files.0"],"1":["variables.files.1"]}' \
  -F '0=@/absolute/path/first.jpg;type=image/jpeg' \
  -F '1=@/absolute/path/second.png;type=image/png'
```

Do not manually set `Content-Type`: curl supplies the multipart boundary.
In Postman, use POST with form-data text fields `operations` and `map`, and File fields `0` and `1` with the same headers.
`files` contains null placeholders in the operations JSON; the map assigns each multipart file to its placeholder.

## Update

Use the same multipart mapping with this operation and update input:

```graphql
mutation Update($input: TravelPackageUpdate!, $files: [Upload!]) {
	updateTravelPackage(input: $input, files: $files) {
		_id
		packageImages
	}
}
```

Set `variables.input` to `{ "_id": "YOUR_PACKAGE_ID" }`, optionally including other update fields.
Only the owning AGENT can update images. Ownership is checked before upload and by the existing update service.

The flow is GraphQL files → validated Cloudinary upload → secure URLs → `packageImages` → existing service → MongoDB.
No image metadata collection is registered or written. Existing metadata records are not deleted.
No Cloudinary asset deletion is performed; replaced or failed uploads may leave assets for later cleanup.
Member/BoardArticle image handling and local `/uploads` support remain unchanged.
