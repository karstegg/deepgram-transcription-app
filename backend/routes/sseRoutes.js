// backend/routes/sseRoutes.js
import express from 'express';
import { handleSseConnection } from '../controllers/sseController.js';
import sseExpress from 'sse-express';

const router = express.Router();

router.get('/progress/:clientId', sseExpress, handleSseConnection);

export default router;
