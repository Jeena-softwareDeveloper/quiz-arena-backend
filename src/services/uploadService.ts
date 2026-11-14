import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config';

// Ensure uploads directory exists for local fallback
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure Cloudinary if credentials are provided in environment
const hasCloudinary = Boolean(
  CONFIG.CLOUDINARY_URL ||
    (CONFIG.CLOUDINARY_CLOUD_NAME && CONFIG.CLOUDINARY_API_KEY && CONFIG.CLOUDINARY_API_SECRET)
);

if (CONFIG.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: CONFIG.CLOUDINARY_URL,
  });
} else if (hasCloudinary) {
  cloudinary.config({
    cloud_name: CONFIG.CLOUDINARY_CLOUD_NAME,
    api_key: CONFIG.CLOUDINARY_API_KEY,
    api_secret: CONFIG.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadResult {
  url: string;
  provider: 'cloudinary' | 'local';
}

/**
 * Robust image upload service:
 * 1. If Cloudinary credentials configured -> Upload to Cloudinary CDN
 * 2. If no Cloudinary / offline / error -> Save to backend/uploads local static folder
 * 3. If already a valid HTTPS/HTTP link -> Return untouched
 */
export async function uploadImage(
  dataUriOrUrl: string,
  hostHeader?: string
): Promise<UploadResult> {
  // If it's already a standard hosted web URL (and not a base64 data URI), keep it
  if (
    dataUriOrUrl.startsWith('http://') ||
    dataUriOrUrl.startsWith('https://')
  ) {
    return {
      url: dataUriOrUrl,
      provider: dataUriOrUrl.includes('cloudinary') ? 'cloudinary' : 'local',
    };
  }

  // Attempt Cloudinary upload if configured
  if (hasCloudinary) {
    try {
      const res = await cloudinary.uploader.upload(dataUriOrUrl, {
        folder: 'quicktrade_slides',
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      return {
        url: res.secure_url,
        provider: 'cloudinary',
      };
    } catch (err) {
      console.warn('[uploadService] Cloudinary upload failed, falling back to local storage:', err);
    }
  }

  // Local storage fallback
  try {
    const matches = dataUriOrUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    let extension = 'png';
    let base64Data = dataUriOrUrl;

    if (matches && matches.length === 3) {
      extension = matches[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      base64Data = matches[2];
    }

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const filename = `slide_${Date.now()}_${uniqueId}.${extension}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    const protocol = 'http';
    const host = hostHeader || `localhost:${CONFIG.PORT}`;
    const localUrl = `${protocol}://${host}/uploads/${filename}`;

    return {
      url: localUrl,
      provider: 'local',
    };
  } catch (err: any) {
    console.error('[uploadService] Local write failed:', err);
    throw new Error('Failed to process and store image upload: ' + err.message);
  }
}

