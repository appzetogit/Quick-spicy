import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

function clean(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function required(name) {
  const value = clean(process.env[name]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createClient(prefix) {
  return {
    cloud_name: required(`${prefix}_CLOUD_NAME`),
    api_key: required(`${prefix}_API_KEY`),
    api_secret: required(`${prefix}_API_SECRET`)
  };
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter(Boolean) : [];
}

function shouldSkip(publicId, excludeSegments) {
  const parts = String(publicId || '')
    .split('/')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

  return excludeSegments.some(segment => parts.includes(segment));
}

function matchesIncludedPrefix(publicId, includePrefixes) {
  if (!includePrefixes.length) {
    return true;
  }

  const normalizedPublicId = String(publicId || '').trim().toLowerCase();
  return includePrefixes.some(prefix =>
    normalizedPublicId === prefix || normalizedPublicId.startsWith(`${prefix}/`)
  );
}

async function listResourcesByType(sourceConfig, resourceType, maxResults) {
  const resources = [];
  let nextCursor;

  cloudinary.config(sourceConfig);

  do {
    const response = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      max_results: maxResults,
      next_cursor: nextCursor,
      direction: 'asc'
    });

    resources.push(...(response.resources || []));
    nextCursor = response.next_cursor;
  } while (nextCursor);

  return resources;
}

async function uploadAsset(targetCloud, asset) {
  cloudinary.config(targetCloud);

  const uploadOptions = {
    public_id: asset.public_id,
    resource_type: asset.resource_type || 'auto',
    type: 'upload',
    overwrite: false,
    use_filename: false,
    unique_filename: false,
    invalidate: false,
    tags: normalizeTags(asset.tags),
    context: asset.context || undefined,
    metadata: asset.metadata || undefined
  };

  if (asset.display_name) {
    uploadOptions.display_name = asset.display_name;
  }

  if (asset.resource_type === 'image' && typeof asset.access_mode === 'string') {
    uploadOptions.access_mode = asset.access_mode;
  }

  return cloudinary.uploader.upload(asset.secure_url, uploadOptions);
}

async function main() {
  const excludeSegments = (clean(process.env.EXCLUDE_SEGMENTS) || 'restaurant')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const includePrefixes = (clean(process.env.INCLUDE_PREFIXES) || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const maxResults = Number.parseInt(process.env.CLOUDINARY_PAGE_SIZE || '500', 10);

  const sourceConfig = createClient('SOURCE');
  const targetConfig = createClient('TARGET');

  console.log(`Loading resources from source Cloudinary account "${sourceConfig.cloud_name}"...`);
  const resourceTypes = ['image', 'video', 'raw'];
  const resourceGroups = [];

  for (const resourceType of resourceTypes) {
    const group = await listResourcesByType(sourceConfig, resourceType, maxResults);
    console.log(`Found ${group.length} ${resourceType} assets.`);
    resourceGroups.push(...group);
  }

  const resources = resourceGroups;
  console.log(`Found ${resources.length} uploaded assets in source account.`);

  let skipped = 0;
  let skippedByInclude = 0;
  let copied = 0;
  let existing = 0;
  const failures = [];

  for (const asset of resources) {
    if (!matchesIncludedPrefix(asset.public_id, includePrefixes)) {
      skippedByInclude += 1;
      continue;
    }

    if (shouldSkip(asset.public_id, excludeSegments)) {
      skipped += 1;
      continue;
    }

    try {
      await uploadAsset(targetConfig, asset);
      copied += 1;
      if (copied % 25 === 0) {
        console.log(`Copied ${copied} assets so far...`);
      }
    } catch (error) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('already exists')) {
        existing += 1;
        continue;
      }

      failures.push({
        publicId: asset.public_id,
        resourceType: asset.resource_type,
        message: message || 'Unknown error'
      });
      console.error(`Failed: ${asset.public_id} (${asset.resource_type}) -> ${message}`);
    }
  }

  console.log('');
  console.log('Migration summary');
  console.log(`Copied: ${copied}`);
  console.log(`Skipped by include filter: ${skippedByInclude}`);
  console.log(`Skipped by folder rule: ${skipped}`);
  console.log(`Already existed in target: ${existing}`);
  console.log(`Failures: ${failures.length}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failed assets:');
    for (const failure of failures) {
      console.log(`- ${failure.publicId} [${failure.resourceType}] ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Cloudinary migration failed:', error?.message || error);
  process.exit(1);
});
