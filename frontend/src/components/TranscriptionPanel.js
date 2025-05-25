import React, { useRef, useEffect } from 'react';
import { Copy, Download } from 'lucide-react';

const TranscriptionPanel = ({
  transcriptionText,
  onCopyTranscription, // Specific handler for copying transcription
  onDownloadTranscription, // Specific handler for downloading transcription
  isLoading, 
}) => {
  const transcriptionAreaRef = useRef(null);

  // Auto-scroll Effect (from App.js)
  useEffect(() => {
    if (transcriptionAreaRef.current) {
      transcriptionAreaRef.current.scrollTop = transcriptionAreaRef.current.scrollHeight;
    }
  }, [transcriptionText]); // Dependency is on the text itself

  // Determine if there's actual transcription content to display
  const hasTranscription = transcriptionText && transcriptionText.trim() !== '';

  return (
    <div className="relative"> {/* This div was present in App.js structure */}
      <pre
        ref={transcriptionAreaRef}
        className="transcript-text text-sm h-[400px] overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 whitespace-pre-wrap break-all" // Added whitespace and break styles for better text rendering
      >
        {hasTranscription
          ? transcriptionText
          : isLoading
          ? 'Transcription will appear here...'
          : 'No transcription available'}
      </pre>
      
      {/* Action Buttons: Only show if there is a transcription and not currently loading */}
      {!isLoading && hasTranscription && (
        <div className="flex space-x-2 mt-4">
          <button
            onClick={onCopyTranscription}
            className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
            aria-label="Copy transcription"
          >
            <Copy size={16} className="mr-1" />
            Copy
          </button>
          
          <button
            onClick={onDownloadTranscription}
            className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
            aria-label="Download transcription as text file"
          >
            <Download size={16} className="mr-1" />
            Save as .txt
          </button>
        </div>
      )}
    </div>
  );
};

export default TranscriptionPanel;
