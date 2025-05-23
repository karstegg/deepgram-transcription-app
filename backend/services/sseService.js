// backend/services/sseService.js
let sseConnections = {};

export const addClientConnection = (clientId, res) => {
    console.log(`[SSE Service] Client ${clientId} connected.`);
    sseConnections[clientId] = res;
    res.sse('connected', { message: 'Connected to SSE' }); // Initial connection message

    res.on('close', () => {
        console.log(`[SSE Service] Client ${clientId} disconnected.`);
        delete sseConnections[clientId];
    });
};

export const sendSseMessage = (clientId, type, data) => {
    if (sseConnections[clientId]) {
        try {
            sseConnections[clientId].sse(type, data);
            // Avoid logging full transcripts or sensitive data in general logs
            if (type !== 'partial_transcript' && type !== 'summary_result' && type !== 'transcription_chunk') {
                console.log(`[SSE Service] Sent SSE [${type}] to ${clientId}:`, data);
            }
        } catch (sseError) {
            console.error(`[SSE Service] Failed to send SSE message type ${type} to ${clientId}:`, sseError);
            delete sseConnections[clientId]; // Remove problematic connection
        }
    } else {
        // console.warn(`[SSE Service] Attempted to send message to disconnected client ${clientId}`);
    }
};

export const closeSseConnection = (clientId) => {
    if (sseConnections[clientId]) {
        try {
            console.log(`[SSE Service] Closing SSE connection for ${clientId}.`);
            sseConnections[clientId].end(); // Gracefully close the connection
        } catch (e) {
            console.error(`[SSE Service] Error ending SSE connection for ${clientId}:`, e);
        }
        delete sseConnections[clientId];
    }
};
