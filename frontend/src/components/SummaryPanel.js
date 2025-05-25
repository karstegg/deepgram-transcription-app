import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Download } from 'lucide-react';

const SummaryPanel = ({
  summaryText,
  onCopySummary, // Specific handler for copying summary
  onDownloadSummary, // Specific handler for downloading summary
  isLoading, 
}) => {
  // Determine if there's actual summary content to display
  const hasSummary = summaryText && summaryText.trim() !== '';

  return (
    <div className="relative"> {/* This div was present in App.js structure */}
      <div className="font-sans text-sm h-[400px] overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
        {hasSummary ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {/* Ensure ReactMarkdown children is a string */}
            <ReactMarkdown>{String(summaryText)}</ReactMarkdown>
          </div>
        ) : isLoading ? (
          <p>Summary will appear here...</p>
        ) : (
          <p>No summary available</p>
        )}
      </div>

      {/* Action Buttons: Only show if there is a summary and not currently loading */}
      {!isLoading && hasSummary && (
        <div className="flex space-x-2 mt-4">
          <button
            onClick={onCopySummary}
            className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
            aria-label="Copy summary"
          >
            <Copy size={16} className="mr-1" />
            Copy
          </button>

          <button
            onClick={onDownloadSummary}
            className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
            aria-label="Download summary as text file"
          >
            <Download size={16} className="mr-1" />
            Save as .txt
          </button>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;
