const { v2: cloudinary } = require('cloudinary');

const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const isConfigured = () => required.every((key) => Boolean(process.env[key]));

function configureCloudinary() {
  if (!isConfigured()) return false;
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
  return true;
}

function folderFor(kind) {
  const folders = { profile: 'private-chat/profile-pictures', image: 'private-chat/chat-media/images', file: 'private-chat/chat-media/files' };
  if (!folders[kind]) throw new Error('Invalid upload folder.');
  return folders[kind];
}

function uploadBuffer(buffer, { kind, publicId }) {
  if (!isConfigured()) { const error = new Error('Media storage is not configured.'); error.status = 503; throw error; }
  const image = kind === 'profile' || kind === 'image';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: folderFor(kind), public_id: publicId, resource_type: image ? 'image' : 'raw', type: 'authenticated', overwrite: false, transformation: image ? [{ width: kind === 'profile' ? 800 : 1920, height: kind === 'profile' ? 800 : 1920, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }] : undefined }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
  });
}

async function deleteAsset(publicId, resourceType = 'image') {
  if (!publicId || !isConfigured()) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType === 'raw' ? 'raw' : 'image', type: 'authenticated', invalidate: true });
}

function optimizedImageUrl(publicId, options = {}) {
  return cloudinary.url(publicId, { secure: true, sign_url: true, type: 'authenticated', fetch_format: 'auto', quality: 'auto', width: options.width || 960, crop: 'limit' });
}
function signedAssetUrl(publicId, resourceType = 'raw') { return cloudinary.url(publicId, { secure: true, sign_url: true, type: 'authenticated', resource_type: resourceType }); }

configureCloudinary();
module.exports = { cloudinary, configureCloudinary, isConfigured, folderFor, uploadBuffer, deleteAsset, optimizedImageUrl, signedAssetUrl };
