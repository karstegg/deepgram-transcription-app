// backend/routes/summarizationRoutes.js
import express from 'express';
import { handleSummarizationRequest } from '../controllers/summarizationController.js';
import upload from '../middleware/multerUpload.js'; // Corrected path

const router = express.Router();

// The 'upload.single('audio')' middleware is included as per original server.js structure for this route.
// The controller logic should handle cases where 'req.file' might not be present if only text is submitted.
router.post('/summarize', upload.single('audio'), handleSummarizationRequest);

export default router;
