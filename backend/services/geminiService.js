// backend/services/geminiService.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { GEMINI_API_KEY, GEMINI_MODEL_NAME } from '../config/config.js';

let genAI;
let geminiModel;

const defaultSafetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

const initializeGeminiClient = () => {
    if (!GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not found. Gemini features disabled.");
        return null;
    }
    if (!genAI) {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    }
    if (!geminiModel && genAI) {
        try {
            geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
            console.log("Gemini model initialized:", GEMINI_MODEL_NAME);
        } catch (initError) {
            console.error("Failed to initialize Gemini model:", initError);
            geminiModel = null;
        }
    }
    return geminiModel;
};

// Initialize on load
initializeGeminiClient();

export const getGeminiModelInstance = () => {
    return initializeGeminiClient(); // Ensures it's initialized
};

export const generateGeminiContent = async (contents, safetySettings = defaultSafetySettings) => {
    const model = getGeminiModelInstance();
    if (!model) {
        // Return a structure similar to the Gemini SDK's response for error handling consistency
        return { response: { candidates: [], error: { message: "Gemini model not initialized." } } };
    }
    try {
        // The Gemini SDK's generateContent method is flexible.
        // For clarity with the existing controller code, 'contents' is expected to be the array for the `contents` field.
        const result = await model.generateContent({ contents, safetySettings });
        return result;
    } catch (error) {
        console.error("Error during Gemini content generation:", error);
        // Mimic Gemini SDK error structure if possible, or provide a clear error object
        return { response: { candidates: [], error: { message: error.message || "Unknown Gemini SDK error" } } };
    }
};

// Specific function for text-only generation for summarization
export const generateTextOnly = async (prompt, safetySettings = defaultSafetySettings) => {
    const model = getGeminiModelInstance();
    if (!model) {
         // Return a structure similar to the Gemini SDK's response for error handling consistency
        return { response: { candidates: [], error: { message: "Gemini model not initialized." } } };
    }
    try {
        // Pass prompt string directly for text-only, and safetySettings as the second argument (options object)
        const result = await model.generateContent(prompt, {safetySettings});
        return result;
    } catch (error) {
        console.error("Error during Gemini text-only generation:", error);
        return { response: { candidates: [], error: { message: error.message || "Unknown Gemini SDK error" } } };
    }
};
