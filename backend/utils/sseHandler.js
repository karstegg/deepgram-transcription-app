import sseExpress from 'sse-express'; // sseExpress is a function that returns a middleware

const sseConnections = {};

const sendProgress = (clientId, type, data) => {
  if (sseConnections[clientId] && sseConnections[clientId].res) {
    try {
      sseConnections[clientId].res.sse(type, data);
      if (type !== 'partial_transcript' && type !== 'summary_result') {
        // Avoid logging full data object if it's large or sensitive
        const logData = typeof data === 'object' && data !== null && data.message ? { message: data.message } : data;
        console.log(`[${clientId}] Sent SSE [${type}] via sseHandler:`, logData);
      }
    } catch (sseError) {
      console.error(`[${clientId}] Failed to send SSE message type '${type}' via sseHandler: ${sseError.message}`);
      // Connection issues are often handled by client disconnect or subsequent close operations.
    }
  } else {
    // This can be common if client disconnects. Avoid warning spam.
    // console.log(`[${clientId}] Attempted to send SSE type '${type}', but no active connection found.`);
  }
};

const initializeSSE = (app, activeProcesses, uploadsDir, fs, path) => {
  app.get('/progress/:clientId', sseExpress, (req, res) => {
    const clientId = req.params.clientId;
    console.log(`[${clientId}] SSE stream opened by client.`);
    sseConnections[clientId] = { res, req }; // Store res for sending, req for close handling
    res.sse('connected', { message: 'Successfully connected to SSE stream.' });

    req.on('close', () => {
      console.log(`[${clientId}] SSE stream closed by client.`);
      
      // Section: Active Process Cleanup on Disconnect
      if (activeProcesses && activeProcesses[clientId] && activeProcesses[clientId].length > 0) {
        console.log(`[${clientId}] Client disconnected. Terminating ${activeProcesses[clientId].length} active FFmpeg process(es).`);
        activeProcesses[clientId].forEach(process => {
          try {
            process.kill('SIGTERM'); 
            console.log(`[${clientId}] Sent SIGTERM to FFmpeg process PID ${process.pid} due to client disconnect.`);
          } catch (killError) {
            console.error(`[${clientId}] Failed to kill FFmpeg process PID ${process.pid} on client disconnect: ${killError.message}`);
          }
        });
        delete activeProcesses[clientId]; // Remove the entry for this client
      } else {
        // console.log(`[${clientId}] Client disconnected. No active FFmpeg processes found for this client.`);
      }

      // Section: Chunk File Cleanup on Disconnect
      try {
        if (uploadsDir && fs && path && fs.existsSync(uploadsDir)) {
            const chunkPattern = new RegExp(`^${clientId}_chunk_.*\\.mp3$`);
            const filesInUploads = fs.readdirSync(uploadsDir);
            const clientChunks = filesInUploads.filter(f => chunkPattern.test(f));
            
            if (clientChunks.length > 0) {
                console.log(`[${clientId}] Client disconnected. Cleaning up ${clientChunks.length} orphaned audio chunk(s).`);
                clientChunks.forEach(chunkName => {
                  const chunkPath = path.join(uploadsDir, chunkName);
                  if (fs.existsSync(chunkPath)) {
                    try {
                        fs.unlinkSync(chunkPath);
                        // console.log(`[${clientId}] Cleaned up orphaned chunk: ${chunkPath}`); // Can be verbose
                    } catch (unlinkErr) {
                        console.error(`[${clientId}] Error cleaning up orphaned chunk ${chunkPath} on client disconnect: ${unlinkErr.message}`);
                    }
                  }
                });
            }
        }
      } catch (cleanupError) {
        console.error(`[${clientId}] Error during orphaned chunk cleanup on client disconnect: ${cleanupError.message}`);
      }

      // Section: SSE Connection Removal
      delete sseConnections[clientId]; 
      console.log(`[${clientId}] SSE connection resources cleaned up from sseHandler.`);
    });
  });
};

const closeAndRemoveSSEConnection = (clientId, finalSseMessageType = 'done', finalSseMessage = 'Process finished.', statusMessage = 'Closing connection.') => {
    if (sseConnections[clientId] && sseConnections[clientId].res && !sseConnections[clientId].res.writableEnded) {
        console.log(`[${clientId}] Closing SSE connection: Status='${statusMessage}', Type='${finalSseMessageType}', Msg='${finalSseMessage}'`);
        try {
            if (statusMessage) { 
                 sendProgress(clientId, 'status', { message: statusMessage });
            }
            sendProgress(clientId, finalSseMessageType, { message: finalSseMessage }); // Send the final outcome message
            
            // Delay slightly to allow messages to be sent before closing the stream
            setTimeout(() => {
                if (sseConnections[clientId] && sseConnections[clientId].res && !sseConnections[clientId].res.writableEnded) {
                    try {
                        sseConnections[clientId].res.end(); // End the HTTP response for the SSE stream
                        console.log(`[${clientId}] SSE stream formally ended.`);
                    } catch (endError) {
                        console.error(`[${clientId}] Error explicitly ending SSE response stream: ${endError.message}`);
                    }
                }
                // Always remove the connection object after attempting to close
                if (sseConnections[clientId]) {
                    delete sseConnections[clientId];
                    console.log(`[${clientId}] SSE connection object removed from sseHandler.`);
                }
            }, 250); // Reduced delay, ensure it's sufficient for messages to flush
        } catch (sendError) {
            console.error(`[${clientId}] Error sending final SSE messages during close: ${sendError.message}`);
            // Fallback: ensure connection is removed if sending final messages failed
            if (sseConnections[clientId]) {
                if (sseConnections[clientId].res && !sseConnections[clientId].res.writableEnded) {
                    try { sseConnections[clientId].res.end(); } catch (e) { /* Ignore further errors */ }
                }
                delete sseConnections[clientId];
                console.log(`[${clientId}] SSE connection object removed due to error during final message send.`);
            }
        }
    } else {
        // It's normal for this to be called when a connection might already be closed by client or an earlier error.
        // console.log(`[${clientId}] Attempted to close SSE connection, but no active/writable connection found.`);
    }
};


export { sseConnections, sendProgress, initializeSSE, closeAndRemoveSSEConnection };
