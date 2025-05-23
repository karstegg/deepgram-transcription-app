// backend/controllers/sseController.js
import { addClientConnection } from '../services/sseService.js';

export const handleSseConnection = (req, res) => {
    const clientId = req.params.clientId;
    // sseExpress middleware is expected to be applied at the router level
    addClientConnection(clientId, res);
};
