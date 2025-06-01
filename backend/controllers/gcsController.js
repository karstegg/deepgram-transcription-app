import { generateUploadSignedUrl } from '../services/gcsService.js';
import { v4 as uuidv4 } from 'uuid'; // For generating unique file names

/**
 * Handles the request to generate a GCS signed URL for file upload.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function handleGenerateUploadUrl(req, res, next) {
  const { fileName, contentType } = req.body;

  if (!fileName || !contentType) {
    return res.status(400).json({ error: 'fileName and contentType are required.' });
  }

  // Generate a more unique object name for GCS to prevent overwrites
  // and make it easier to trace. You can adjust the prefix as needed.
  const uniquePrefix = uuidv4();
  const gcsObjectName = `uploads/${uniquePrefix}-${fileName}`;

  try {
    const signedUrl = await generateUploadSignedUrl(gcsObjectName, contentType);
    res.status(200).json({ signedUrl, gcsObjectName });
  } catch (error) {
    console.error('Error in handleGenerateUploadUrl:', error);
    // Pass the error to the centralized error handler if you have one, or send a generic error
    // next(error); // if you have an error handling middleware
    res.status(500).json({ error: 'Failed to generate upload URL.' });
  }
}

export { handleGenerateUploadUrl };
