import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';

dotenv.config();

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
  console.error('Error: GCS_BUCKET_NAME is not set in environment variables.');
  // Optionally, throw an error to prevent the app from starting without this critical config
  // throw new Error('GCS_BUCKET_NAME must be set');
}

/**
 * Generates a v4 signed URL for uploading a file to GCS.
 * @param {string} gcsObjectName - The name of the object in GCS (e.g., 'uploads/my-audio.mp3').
 * @param {string} contentType - The content type of the file (e.g., 'audio/mpeg').
 * @returns {Promise<string>} The signed URL.
 */
async function generateUploadSignedUrl(gcsObjectName, contentType) {
  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME is not configured.');
  }

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
  };

  try {
    // Get a v4 signed URL for uploading the file
    const [url] = await storage
      .bucket(bucketName)
      .file(gcsObjectName)
      .getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
      });
    console.log(`Generated signed URL for ${gcsObjectName} with content type ${contentType}`);
    return url;
  } catch (error) {
    console.error(`Error generating signed URL for ${gcsObjectName}:`, error);
    throw new Error('Could not generate signed URL.');
  }
}

export { generateUploadSignedUrl };
