import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import config from '../config.js';
import path from 'path';
import mime from 'mime-types';
import fs from 'fs';

// Initialize Gemini AI client and model
let geminiModel = null;
const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

if (!genAI) {
    console.warn("[GEMINI_SERVICE] GEMINI_API_KEY not found in config. Gemini features will be disabled.");
} else {
    try {
        geminiModel = genAI.getGenerativeModel({ model: config.GEMINI_MODEL_NAME });
        console.log(`[GEMINI_SERVICE] Gemini model initialized successfully: ${config.GEMINI_MODEL_NAME}`);
    } catch (initError) {
        console.error(`[GEMINI_SERVICE] Failed to initialize Gemini model (${config.GEMINI_MODEL_NAME}): ${initError.message}`);
        geminiModel = null; 
    }
}

// Local helper function to determine MIME type
function _determineMimeType(originalName, clientId) {
    const fileExt = path.extname(originalName).toLowerCase();
    let detectedMimeType = mime.lookup(originalName) || ''; // Returns false if not found, convert to empty string

    // Prioritize common audio/video types that Gemini is likely to support well
    const knownSupportedTypes = {
        '.mp3': 'audio/mp3', '.wav': 'audio/wav', '.m4a': 'audio/m4a', '.aac': 'audio/aac',
        '.ogg': 'audio/ogg', '.flac': 'audio/flac',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mpg': 'video/mpeg',
        '.webm': 'video/webm', '.wmv': 'video/x-ms-wmv', '.avi': 'video/x-msvideo',
        // Add other video types if known to be supported by Gemini
    };

    if (knownSupportedTypes[fileExt]) {
        console.log(`[${clientId}] Determined MIME type for ${originalName} as '${knownSupportedTypes[fileExt]}' based on extension.`);
        return knownSupportedTypes[fileExt];
    }
    
    if (detectedMimeType && (detectedMimeType.startsWith('audio/') || detectedMimeType.startsWith('video/'))) {
        console.log(`[${clientId}] Determined MIME type for ${originalName} as '${detectedMimeType}' using mime.lookup.`);
        return detectedMimeType;
    }

    // Fallback for unrecognised or non-audio/video types from mime.lookup
    if (!detectedMimeType) {
        console.warn(`[${clientId}] MIME type for ${originalName} (ext: ${fileExt}) could not be determined by mime.lookup. Critical functionality might be affected.`);
    } else {
        console.warn(`[${clientId}] Detected MIME type '${detectedMimeType}' for ${originalName} (ext: ${fileExt}) is not a known audio/video type. This may not be supported by Gemini.`);
    }
    // If Gemini fails on a generic 'application/octet-stream', the calling function's error handling
    // for Gemini API errors should provide feedback to the user.
    return detectedMimeType || 'application/octet-stream'; 
}


// Gemini Transcription/Summarization Function (Using Inline Data)
const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, modelIdentifier, sendProgress) => {
    console.log(`[${clientId}] Initiating Gemini transcription for '${originalName}'. Options: Diarize=${diarizeEnabled}, Summarize=${summarizeEnabled}, Model=${modelIdentifier}`);
    
    if (!geminiModel) {
        const modelErrorMsg = "Gemini model is not initialized. This might be due to a missing API key or an initialization issue.";
        console.error(`[${clientId}] Gemini transcription attempt failed: ${modelErrorMsg}`);
        sendProgress(clientId, 'error', { message: modelErrorMsg });
        throw new Error(modelErrorMsg); // Critical, stop processing for this request
    }
    
    sendProgress(clientId, 'status', { message: `Processing '${originalName}' with Gemini model ${modelIdentifier}...`});
    let mimeType = 'application/octet-stream'; // Default, will be updated by _determineMimeType

    try {
        sendProgress(clientId, 'status', { message: `Preparing audio data from '${originalName}' for Gemini...` });
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`[${clientId}] Read audio buffer for '${originalName}' (${(fileBuffer.length / (1024*1024)).toFixed(2)} MB).`);
        
        mimeType = _determineMimeType(originalName, clientId); // Update mimeType
        
        if (fileBuffer.length > config.MAX_INLINE_BYTES_GEMINI) {
            const sizeErrorMsg = `File '${originalName}' (${(fileBuffer.length / (1024*1024)).toFixed(1)}MB) exceeds Gemini inline data limit of ${(config.MAX_INLINE_BYTES_GEMINI / (1024*1024)).toFixed(1)}MB.`;
            console.error(`[${clientId}] ${sizeErrorMsg}`);
            throw new Error(sizeErrorMsg);
        }

        const audioDataPart = { inlineData: { mimeType: mimeType, data: fileBuffer.toString("base64") } }; // base64 data is not logged

        // Constructing the prompt for Gemini
        let promptText = "Transcribe the following audio accurately.";
        if (diarizeEnabled) { promptText += " Identify different speakers and label their utterances clearly (e.g., 'Speaker 0:', 'Speaker 1:')."; }
        if (summarizeEnabled) { promptText += " After the transcription, provide a concise summary starting with the exact text 'Summary:'."; }
        
        const contents = [{ role: "user", parts: [{ text: promptText }, audioDataPart] }];
        
        // Standard safety settings for Gemini
        const safetySettings = [ 
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, 
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, 
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, 
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } 
        ];

        console.log(`[${clientId}] Sending request to Gemini model '${modelIdentifier}' for '${originalName}'.`);
        sendProgress(clientId, 'status', { message: `Request sent to Gemini model '${modelIdentifier}'. Awaiting response...` });
        
        const result = await geminiModel.generateContent({ contents, safetySettings });
        
        const response = result?.response;
        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
            const errorMsg = `Invalid or empty response structure from Gemini for '${originalName}'.`;
            console.error(`[${clientId}] ${errorMsg} Response: ${JSON.stringify(response)}`);
            throw new Error(errorMsg);
        }
        const responseText = response.candidates[0].content.parts[0].text ?? ''; 
        console.log(`[${clientId}] Gemini response received for '${originalName}'. Extracted text length: ${responseText.length}.`);

        let transcript = responseText; 
        let extractedSummary = null;
        if (summarizeEnabled) {
            const summaryMarker = "\nSummary:"; 
            const summaryIndex = responseText.lastIndexOf(summaryMarker);
            if (summaryIndex !== -1) {
                extractedSummary = responseText.substring(summaryIndex + summaryMarker.length).trim();
                transcript = responseText.substring(0, summaryIndex).trim(); 
                console.log(`[${clientId}] Extracted summary (length: ${extractedSummary.length}) from Gemini response for '${originalName}'.`);
                sendProgress(clientId, 'summary_result', { summary: extractedSummary });
            } else { 
                console.warn(`[${clientId}] Summarization enabled for '${originalName}', but summary marker "${summaryMarker.replace('\n', '\\n')}" not found. Full response treated as transcript.`);
            }
        }
        
        if (transcript && transcript.trim().length > 0) { 
             sendProgress(clientId, 'partial_transcript', { transcript: transcript }); 
             console.log(`[${clientId}] Sent transcript (length: ${transcript.length}) for '${originalName}' via SSE.`);
        } else if (!extractedSummary) { // Only throw error if neither transcript nor summary could be extracted
             const noContentMsg = `Gemini response for '${originalName}' did not yield a usable transcript or summary.`;
             console.warn(`[${clientId}] ${noContentMsg}`);
             throw new Error(noContentMsg);
        }
        return { transcript, summary: extractedSummary }; // Return both for the orchestrator

    } catch (err) {
        const baseErrorMessage = `Error processing '${originalName}' with Gemini in geminiService: ${err.message || 'Unknown error'}`;
        console.error(`[${clientId}] ${baseErrorMessage}`, err.stack ? `\nStack: ${err.stack}` : '');
        
        let clientErrorMessage = `Gemini processing failed for '${originalName}'.`;
        if (err.message?.includes('404') && err.message?.includes('models/')) {
             clientErrorMessage = `Gemini model '${modelIdentifier}' not found or is not available.`;
        } else if (err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota')) {
             clientErrorMessage = `Gemini API quota exceeded. Please check your project quota and billing.`;
        } else if (err.message?.includes('Unsupported MIME type') || err.message?.includes('Could not determine a supported audio/video MIME type') || mimeType === 'application/octet-stream') { 
             clientErrorMessage = `Unsupported file type or MIME type ('${mimeType}' for '${originalName}').`;
        } else if (err.message?.includes("Received invalid or empty response from Gemini")) {
            clientErrorMessage = "Gemini returned an invalid or empty response. Please try again later.";
        } else if (err.message?.includes("exceeds Gemini inline data limit")) {
            clientErrorMessage = err.message; // Use the specific error message about size limit
        }
        sendProgress(clientId, 'error', { message: clientErrorMessage });
        throw new Error(baseErrorMessage); // Re-throw with a more context-rich error for server logs
    }
};

// Function for text summarization using Gemini
const summarizeTextWithGemini = async (clientId, textToSummarize, sendProgress) => {
    console.log(`[${clientId}] Initiating text summarization with Gemini. Text length: ${textToSummarize.length} chars.`);

    if (!geminiModel) {
        const modelErrorMsg = "Gemini model is not initialized. Cannot perform summarization.";
        console.error(`[${clientId}] Gemini summarization attempt failed: ${modelErrorMsg}`);
        if (sendProgress) sendProgress(clientId, 'error', { message: modelErrorMsg });
        throw new Error(modelErrorMsg); // Critical error
    }
    
    if (sendProgress) sendProgress(clientId, 'status', { message: 'Sending text to Gemini for summarization...' });

    try {
        // Standard prompt for structured summarization
        const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
---
${textToSummarize.trim()}
---`;
        // Standard safety settings
        const safetySettings = [ 
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ];
        
        console.log(`[${clientId}] Sending summarization request to Gemini model '${config.GEMINI_MODEL_NAME}'.`);
        const result = await geminiModel.generateContent({ contents: [{role: "user", parts: [{text: prompt}]}], safetySettings});
        
        const response = result?.response;
        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
            const errorMsg = `Invalid or empty response structure from Gemini during summarization.`;
            console.error(`[${clientId}] ${errorMsg} Response: ${JSON.stringify(response)}`);
            throw new Error(errorMsg);
        }
        const summaryText = response.candidates[0].content.parts[0].text?.trim() ?? '';
        console.log(`[${clientId}] Gemini summarization response received. Summary length: ${summaryText.length}.`);

        if (summaryText.length > 0) {
            if (sendProgress) sendProgress(clientId, 'summary_result', { summary: summaryText });
            return summaryText;
        } else {
            const emptySummaryMsg = 'Gemini returned an empty string for the summary.';
            console.warn(`[${clientId}] ${emptySummaryMsg}`);
            if (sendProgress) sendProgress(clientId, 'warning', { message: emptySummaryMsg }); 
            return null; // Or throw an error if an empty summary is considered a critical failure
        }

    } catch (geminiError) {
        const baseErrorMessage = `Error during text summarization with Gemini: ${geminiError.message || 'Unknown error'}`;
        console.error(`[${clientId}] ${baseErrorMessage}`, geminiError.stack ? `\nStack: ${geminiError.stack}` : '');
        if (sendProgress) sendProgress(clientId, 'error', { message: `Failed to generate summary using Gemini: ${geminiError.message}` });
        throw new Error(baseErrorMessage); // Re-throw for the calling orchestrator in server.js
    }
};


export { geminiModel, transcribeWithGemini, summarizeTextWithGemini };
