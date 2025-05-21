# Deepgram Transcription App

A modern web application for transcribing audio and video files using Deepgram's advanced AI models with optional summarization powered by Google Gemini.

![Deepgram Transcription App Screenshot](https://i.imgur.com/placeholder.png)

## Features

- **Audio/Video Transcription**: Upload and transcribe audio/video files with high accuracy
- **Multiple AI Models**: Choose from various Deepgram models optimized for different use cases:
  - Nova-3 (highest accuracy)
  - Nova-2 Meeting (optimized for conference rooms)
  - Nova-2 specialized models (finance, medical, etc.)
  - Whisper models
- **AI Summarization**: Generate concise summaries of transcriptions using Google Gemini
- **Speaker Identification**: Diarization to identify different speakers in conversations
- **Modern UI**: Clean, responsive interface with dark/light mode support
- **Export Options**: Save transcriptions and summaries as text files
- **Real-time Progress**: Live updates during transcription processing

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Deepgram API key
- Google Gemini API key (for summarization)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/karstegg/deepgram-transcription-app.git
   cd deepgram-transcription-app
   ```

2. Install dependencies for both frontend and backend
   ```bash
   # Install frontend dependencies
   cd frontend
   npm install
   
   # Install backend dependencies
   cd ../backend
   npm install
   ```

3. Set up environment variables
   - Create a `.env` file in the backend directory
   ```
   DEEPGRAM_API_KEY=your_deepgram_api_key
   GEMINI_API_KEY=your_gemini_api_key
   PORT=5000
   ```

4. Start the development servers
   ```bash
   # Start backend server
   cd backend
   npm run dev
   
   # In a separate terminal, start frontend
   cd frontend
   npm start
   ```

5. Open your browser and navigate to http://localhost:3000

## Usage

1. **Upload File**: Drop an audio/video file or click to browse
2. **Select Options**: Choose transcription model and enable/disable features
3. **Transcribe**: Click the "Transcribe File" button
4. **View Results**: See the transcription in the right panel
5. **Generate Summary**: Click "Generate Summary" to create an AI summary
6. **Export**: Copy or save the transcription/summary as needed

## Advanced Options

- **Theme Toggle**: Switch between dark and light modes
- **Model Selection**: Choose the optimal AI model for your content type
- **Chunk Size**: Adjust processing chunk size for larger files
- **Diarization**: Enable/disable speaker identification

## Deployment

The application is deployed on Netlify. You can view the live version at:
[https://deepgram-transcription-app.netlify.app](https://deepgram-transcription-app.netlify.app)

### Deploying Your Own Instance

1. Set up a Netlify account
2. Connect your GitHub repository
3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `build`
4. Add environment variables in Netlify dashboard

## Technologies

- **Frontend**: React, TailwindCSS, Lucide React icons
- **Backend**: Node.js, Express
- **APIs**: Deepgram API, Google Gemini API
- **Styling**: Custom design system with consistent color palette

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Deepgram](https://deepgram.com) for their powerful speech-to-text API
- [Google Gemini](https://ai.google.dev/) for AI summarization capabilities
