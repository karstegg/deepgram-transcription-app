import express from 'express';
import { handleGenerateUploadUrl } from '../controllers/gcsController.js';

const router = express.Router();

// Route to generate a signed URL for GCS upload
router.post('/generate-upload-url', handleGenerateUploadUrl);

export default router;
