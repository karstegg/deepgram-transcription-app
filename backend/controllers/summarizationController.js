// backend/controllers/summarizationController.js
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { sendSseMessage, closeSseConnection } from '../services/sseService.js';

// SDK client is now imported from services
import { generateTextOnly, getGeminiModelInstance } from '../services/geminiService.js';

export const handleSummarizationRequest = (req, res) => {
    const clientId = uuidv4();
    const { existingTranscription } = req.body;

    if (!existingTranscription) {
        // Though the original route had upload.single('audio'), the core logic depends on existingTranscription.
        // If file upload is still desired for this route, it should be handled by multer middleware
        // before this controller, and then this controller would decide whether to use uploaded audio
        // or existingTranscription. For now, focusing on the provided text.
        return res.status(400).json({ error: 'No existingTranscription provided.' });
    }

    console.log(`[${clientId}] Received summarization request for existing transcription (${existingTranscription.length} chars).`);

    // Process the summarization asynchronously
    (async () => {
        try {
            sendSseMessage(clientId, 'status', { message: 'Generating summary...' });
            
            const geminiModelInstance = getGeminiModelInstance(); // Check if model is available via service
            if (!geminiModelInstance) {
                sendSseMessage(clientId, 'error', { message: 'Summarization failed: Gemini model not available.' });
                return; 
            }

            const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
---
${existingTranscription.trim()}
---`;
            const safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ];

            sendSseMessage(clientId, 'status', { message: 'Sending request to Gemini...' });
            const result = await generateTextOnly(prompt, { safetySettings }); // Use service

            // Check for errors from the service call
            if (result.response && result.response.error) {
                 throw new Error(result.response.error.message || "Gemini summarization failed in service.");
            }
            const response = result?.response; // result itself is the response from SDK via service
            const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

            console.log(`[${clientId}] Gemini summary received.`);

            if (summaryText.trim().length > 0) {
                sendSseMessage(clientId, 'summary_result', { summary: summaryText, text: summaryText });
                sendSseMessage(clientId, 'status', { message: 'Summary generated successfully.', progress: 100 });
            } else {
                sendSseMessage(clientId, 'error', { message: 'Failed to generate summary: Empty response from Gemini.' });
            }
        } catch (error) {
            console.error(`[${clientId}] Error during summarization:`, error);
            sendSseMessage(clientId, 'error', { message: `Summarization failed: ${error.message || 'Unknown error'}` });
        } finally {
            sendSseMessage(clientId, 'done', { message: 'Summarization process finished.' });
            closeSseConnection(clientId);
        }
    })();

    res.json({ clientId });
};
