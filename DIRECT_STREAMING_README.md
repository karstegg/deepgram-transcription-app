# Direct Deepgram Streaming Implementation

This branch implements direct WebSocket streaming to Deepgram, eliminating the need for Google Cloud infrastructure (GCS, Cloud Run, Firebase). 

## Key Changes

### Architecture
- **Before**: Frontend → GCS Upload → Backend → Deepgram → SSE Results
- **After**: Frontend → Direct Deepgram WebSocket → Real-time Results

### Benefits
- ✅ **Faster transcription start** - No upload wait time
- ✅ **Simplified deployment** - Frontend-only or simple static hosting
- ✅ **Lower costs** - No GCP infrastructure needed
- ✅ **Real-time streaming** - Sub-300ms latency
- ✅ **Reduced complexity** - No backend required for basic functionality

## Setup Instructions

### 1. Environment Configuration
```bash
# Copy environment template
cp frontend/.env.example frontend/.env

# Add your Deepgram API key
REACT_APP_DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### 2. Get Deepgram API Key
1. Visit [console.deepgram.com](https://console.deepgram.com/)
2. Create account (includes $200 free credit)
3. Copy API key to `.env` file

### 3. Install & Run
```bash
cd frontend
npm install
npm start
```

## Technical Implementation

### Direct Streaming Service (`useDirectStreamingService.js`)
- **WebSocket Connection**: Direct to `wss://api.deepgram.com/v1/listen`
- **File Chunking**: Client-side 8KB chunks for optimal streaming
- **Real-time Results**: Immediate transcript updates via WebSocket
- **Progress Tracking**: File upload progress + transcription status

### Features Supported
- ✅ Multiple models (Nova-2, Nova-3, etc.)
- ✅ Speaker diarization
- ✅ Smart formatting & punctuation
- ✅ Interim results for real-time feedback
- ✅ Progress indication
- ✅ Copy/download transcripts

### Limitations in Direct Mode
- ❌ No built-in summarization (Deepgram streaming doesn't include Gemini)
- ❌ No file history/storage
- ❌ API key exposed in frontend (acceptable for personal use)

## Cost Comparison

### Original Architecture (GCS + Cloud Run)
- GCS storage: ~$0.02/GB/month
- Cloud Run: ~$0.40/hour active
- Firebase Hosting: ~$0.15/GB transferred
- **Total**: ~$10-50/month depending on usage

### Direct Streaming
- Deepgram API: ~$0.0043/minute
- Static hosting: Free (Netlify/Vercel) or ~$1/month
- **Total**: Pay only for transcription usage

## Deployment Options

### Option 1: Static Hosting (Recommended)
```bash
npm run build
# Deploy /build folder to Netlify, Vercel, or any static host
```

### Option 2: Local Development
```bash
npm start
# Runs on localhost:3000
```

## Usage

1. **Select audio/video file** (MP3, WAV, M4A, etc.)
2. **Choose transcription model** (Advanced Options)
3. **Enable diarization** if multiple speakers
4. **Click "Start Transcription"**
5. **Watch real-time results** appear as file streams

## Browser Compatibility

- ✅ Chrome/Edge/Safari (WebSocket support)
- ✅ Firefox (WebSocket support)
- ❌ Internet Explorer (no WebSocket support)

## Security Considerations

- **API Key Exposure**: Deepgram key is in frontend bundle
- **Mitigation**: Use restricted API keys with domain limitations
- **Alternative**: Implement simple proxy server if security is critical

## Migration from Original Version

If migrating from the GCS-based version:

1. **Keep existing summarization**: Backend still needed for Gemini API
2. **Hybrid approach**: Direct streaming + backend summarization
3. **Full migration**: Replace both with client-side only

## Troubleshooting

### "API key not found" Error
- Ensure `.env` file exists in `frontend/` directory
- Verify `REACT_APP_DEEPGRAM_API_KEY` is set correctly
- Restart development server after adding environment variables

### WebSocket Connection Fails
- Check browser developer tools for CORS errors
- Verify Deepgram API key is valid
- Ensure stable internet connection

### No Transcription Results
- Verify audio file format is supported
- Check audio file isn't corrupted
- Monitor browser console for errors

## Performance Tips

- **File Size**: Larger files stream longer but start transcribing immediately
- **Audio Quality**: Higher quality audio = better transcription accuracy
- **Network**: Stable connection improves streaming reliability
- **Chunking**: 8KB chunks balance speed vs reliability

## Future Enhancements

- [ ] Add offline transcription capability
- [ ] Implement client-side summarization
- [ ] Add transcription history (localStorage)
- [ ] Support live microphone streaming
- [ ] Add multiple language support UI
