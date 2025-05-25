import React from 'react';
import { AlertTriangle } from 'lucide-react'; // Using AlertTriangle for error indication

const ErrorDisplay = ({ errorMessage, onClearError }) => {
  // If no error message, don't render anything
  if (!errorMessage) {
    return null;
  }

  // In App.js, the error message was prefixed with "Error: ". 
  // We'll let the parent component pass the fully formed message including any prefix.
  return (
    <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-600" role="alert">
      <div className="flex items-center">
        <AlertTriangle size={20} className="mr-3 flex-shrink-0 text-red-500 dark:text-red-400" />
        <p className="text-sm font-medium flex-grow">
          {errorMessage}
        </p>
        {onClearError && (
          <button
            onClick={onClearError}
            className="ml-3 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-700/30 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Clear error message"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorDisplay;
