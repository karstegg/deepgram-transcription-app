import React from 'react';

const ProgressDisplay = ({ isLoading, progress, progressMessage }) => {
  // Render only if loading, or if there's a progress message (e.g., success/completion messages after loading is false)
  // or if progress is 100 (implying completion message might be there or coming)
  if (!isLoading && !progressMessage && progress !== 100) {
    return null;
  }
  
  // Do not render if there's an error message style progress message but we are not loading.
  // This check is a bit fragile. Ideally, App.js should not send error-like messages
  // to ProgressDisplay. For now, we assume progressMessage will be cleared or appropriate if !isLoading.
  if (!isLoading && progressMessage && (progressMessage.toLowerCase().startsWith('error') || progressMessage.toLowerCase().includes('failed'))) {
      // This case should be handled by ErrorDisplay component.
      // If App.js sends an error message here when !isLoading, we choose not to display it.
      // This avoids ProgressDisplay showing an error.
      // A better solution is for App.js to manage state so error messages only go to ErrorDisplay.
      return null;
  }


  // Determine background color:
  // If not loading and there's a progress message, it might be a success message.
  let bgColor = 'bg-gray-100 dark:bg-gray-800'; // Default for loading/neutral messages
  if (!isLoading && progressMessage) {
    // Example: if message contains "complete" or "success", use green. This is heuristic.
    // A more robust way would be to pass a 'status' prop (e.g., 'loading', 'success', 'info')
    if (progressMessage.toLowerCase().includes('complete') || progressMessage.toLowerCase().includes('success') || progressMessage.toLowerCase().includes('copied') || progressMessage.toLowerCase().includes('saved')) {
      bgColor = 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300';
    }
    // If it's a cancellation message.
    else if (progressMessage.toLowerCase().includes('cancelled')) {
         bgColor = 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300';
    }
  }


  return (
    // The outer div's visibility is controlled by the conditions at the start of the component.
    // It will only render if isLoading is true or a progressMessage is present.
    <div className={`p-4 rounded-lg ${bgColor}`}>
      {/* Progress Bar: Only show if isLoading. App.js ensures progress is 0-100. */}
      {isLoading && (
        <div className="mb-2">
          <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-in-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Progress Message: Show if there's a message. */}
      {/* The message itself is styled by the bgColor a */}
      {progressMessage && (
        <p className="text-sm font-medium">
          {progressMessage}
        </p>
      )}
    </div>
  );
};

export default ProgressDisplay;
