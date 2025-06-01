// backend/routes/transcriptionRoutes.js
import express from 'express';
import { handleTranscriptionRequest, handleCancellationRequest } from '../controllers/transcriptionController.js';
import upload from '../middleware/multerUpload.js'; // Corrected path

const router = express.Router();

router.post('/transcribe', handleTranscriptionRequest); // Removed upload.single('audio')
router.post('/cancel/:clientId', handleCancellationRequest);

export default router;
