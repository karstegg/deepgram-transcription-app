import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// UPLOADS_DIR_NAME can be imported from config.js later if needed,
// for now, defining it directly as per instructions.
const UPLOADS_DIR_NAME = "uploads";

// Path relative to this middleware file (backend/middleware/multerUpload.js)
// to the desired 'uploads' directory (backend/uploads/)
export const UPLOADS_DIR_PATH = path.join(__dirname, '..', UPLOADS_DIR_NAME);

if (!fs.existsSync(UPLOADS_DIR_PATH)) {
    fs.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
    console.log(`Created uploads directory at: ${UPLOADS_DIR_PATH}`);
} else {
    console.log(`Uploads directory already exists at: ${UPLOADS_DIR_PATH}`);
}

const upload = multer({
    dest: UPLOADS_DIR_PATH,
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

export default upload; // ES Module export
