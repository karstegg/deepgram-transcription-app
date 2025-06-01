# Deepgram Transcription App - Project Plan

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Setup Instructions](#4-setup-instructions)
5. [Core Features Implementation](#5-core-features-implementation)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend Components](#7-frontend-components)
8. [Deployment](#8-deployment)
9. [Testing](#9-testing)
10. [Future Enhancements](#10-future-enhancements)
11. [Monitoring and Maintenance](#11-monitoring-and-maintenance)

## 1. Project Overview

**Objective**: Build a web application that allows users to upload audio files, transcribe them using Deepgram, and manage their transcriptions.

**Key Features**:
- User authentication (signup/login)
- Audio file upload
- Real-time transcription status
- Transcription history
- Downloadable transcripts
- User profile management

## 2. Tech Stack

### Frontend
- **Framework**: React 18
- **State Management**: React Context API
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **Form Handling**: React Hook Form
- **Notifications**: React Hot Toast

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT
- **File Upload**: Multer
- **API Client**: Deepgram SDK

### Infrastructure
- **Frontend Hosting**: Vercel/Netlify
- **Backend Hosting**: Railway/Render
- **Database**: MongoDB Atlas

## 3. Project Structure

```
deepgram-transcriber/
├── client/                  # Frontend React app
│   ├── public/
│   └── src/
│       ├── assets/          # Static assets
│       ├── components/      # Reusable UI components
│       ├── contexts/        # React contexts
│       ├── hooks/           # Custom hooks
│       ├── pages/           # Page components
│       ├── services/        # API services
│       ├── utils/           # Utility functions
│       ├── App.jsx          # Main App component
│       └── main.jsx         # Entry point
│
└── server/                  # Backend Express app
    ├── config/             # Configuration files
    ├── controllers/        # Route controllers
    ├── middleware/         # Custom middleware
    ├── models/             # Database models
    ├── routes/             # API routes
    ├── services/           # Business logic
    ├── utils/              # Utility functions
    └── server.js           # Entry point
```

## 4. Setup Instructions

### Prerequisites
- Node.js 18+ and npm/yarn
- MongoDB Atlas account
- Deepgram API key
- Git

### Backend Setup

1. **Initialize Project**
   ```bash
   mkdir deepgram-transcriber
   cd deepgram-transcriber
   mkdir server
   cd server
   npm init -y
   ```

2. **Install Dependencies**
   ```bash
   npm install express mongoose dotenv cors jsonwebtoken bcryptjs multer @deepgram/sdk
   npm install --save-dev nodemon
   ```

3. **Environment Variables**
   Create `.env` file in `server/` directory:
   ```
   PORT=5000
   MONGODB_URI=your_mongodb_uri
   JWT_SECRET=your_jwt_secret
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ```

4. **Basic Server Setup**
   Create `server/server.js`:
   ```javascript
   require('dotenv').config();
   const express = require('express');
   const mongoose = require('mongoose');
   const cors = require('cors');
   // const authRoutes = require('./routes/auth'); // Placeholder - Create this file later
   // const transcriptionRoutes = require('./routes/transcriptions'); // Placeholder - Create this file later
   
   const app = express();
   
   // Middleware
   app.use(cors());
   app.use(express.json());
   
   // Routes (to be implemented)
   // app.use('/api/auth', authRoutes);
   // app.use('/api/transcriptions', transcriptionRoutes);
   
   app.get('/', (req, res) => {
     res.send('Deepgram Transcriber API is running!');
   });

   // Connect to MongoDB
   mongoose.connect(process.env.MONGODB_URI)
     .then(() => console.log('Connected to MongoDB'))
     .catch(err => console.error('MongoDB connection error:', err));
   
   const PORT = process.env.PORT || 5000;
   app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
   ```

### Frontend Setup

1. **Create React App** (from `deepgram-transcriber/` directory)
   ```bash
   npx create-react-app client --template typescript
   cd client
   npm install @tailwindcss/forms @headlessui/react @heroicons/react axios react-hook-form react-hot-toast react-router-dom
   npm install -D tailwindcss postcss autoprefixer
   ```

2. **Configure Tailwind CSS**
   In `client/` directory:
   ```bash
   npx tailwindcss init -p
   ```
   Update `client/tailwind.config.js`:
   ```javascript
   module.exports = {
     content: [
       "./src/**/*.{js,jsx,ts,tsx}",
     ],
     theme: {
       extend: {},
     },
     plugins: [
       require('@tailwindcss/forms'),
     ],
   }
   ```

3. **Update `client/src/index.css`**
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

## 5. Core Features Implementation

### Authentication System

1. **User Model (`server/models/User.js`)**
   ```javascript
   const mongoose = require('mongoose');
   const bcrypt = require('bcryptjs');
   
   const userSchema = new mongoose.Schema({
     name: { type: String, required: true },
     email: { type: String, required: true, unique: true, lowercase: true },
     password: { type: String, required: true },
     createdAt: { type: Date, default: Date.now }
   });
   
   // Hash password before saving
   userSchema.pre('save', async function(next) {
     if (!this.isModified('password')) return next();
     this.password = await bcrypt.hash(this.password, 12);
     next();
   });

   // Method to compare password
   userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
   };
   
   module.exports = mongoose.model('User', userSchema);
   ```

2. **Authentication Controller (`server/controllers/authController.js`)**
   ```javascript
   const jwt = require('jsonwebtoken');
   const User = require('../models/User');
   
   exports.register = async (req, res) => {
     try {
       const { name, email, password } = req.body;
       if (!name || !email || !password) {
         return res.status(400).json({ message: 'Please provide name, email, and password' });
       }

       let user = await User.findOne({ email });
       if (user) {
         return res.status(400).json({ message: 'User already exists' });
       }
       
       user = new User({ name, email, password });
       await user.save();
       
       const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
         expiresIn: '7d'
       });
       
       res.status(201).json({ token, userId: user._id, name: user.name, email: user.email });
     } catch (error) {
       console.error('Register Error:', error);
       res.status(500).json({ message: 'Server error during registration' });
     }
   };
   
   exports.login = async (req, res) => {
     try {
       const { email, password } = req.body;
       if (!email || !password) {
         return res.status(400).json({ message: 'Please provide email and password' });
       }

       const user = await User.findOne({ email });
       if (!user) {
         return res.status(400).json({ message: 'Invalid credentials' });
       }
       
       const isMatch = await user.comparePassword(password);
       if (!isMatch) {
         return res.status(400).json({ message: 'Invalid credentials' });
       }
       
       const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
         expiresIn: '7d'
       });
       
       res.json({ token, userId: user._id, name: user.name, email: user.email });
     } catch (error) {
       console.error('Login Error:', error);
       res.status(500).json({ message: 'Server error during login' });
     }
   };
   ```

### Transcription Service

1. **Transcription Model (`server/models/Transcription.js`)**
   ```javascript
   const mongoose = require('mongoose');

   const transcriptionSchema = new mongoose.Schema({
     user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
     filename: { type: String, required: true }, // Name of the file stored on server
     originalname: { type: String, required: true }, // Original name from client
     mimetype: { type: String, required: true },
     size: { type: Number, required: true },
     status: { 
       type: String, 
       enum: ['pending', 'processing', 'completed', 'failed'],
       default: 'pending'
     },
     transcript: { type: String }, // Could be JSON string of full response or just text
     duration: { type: Number }, // in seconds
     language: { type: String, default: 'en' },
     deepgramJobId: { type: String }, // To potentially check status with Deepgram later
     metadata: { type: Object }, // Store raw Deepgram response or other info
     createdAt: { type: Date, default: Date.now },
     updatedAt: { type: Date, default: Date.now }
   });

   transcriptionSchema.pre('save', function(next){ // Keep `updatedAt` current
    this.updatedAt = Date.now();
    next();
   });

   module.exports = mongoose.model('Transcription', transcriptionSchema);
   ```

2. **Transcription Service Logic (Conceptual - part of `server/controllers/transcriptionController.js`)**
   This involves:
   - Using `multer` for file uploads.
   - Creating a `Transcription` record in the database.
   - Sending the file to Deepgram SDK.
   - Updating the record with the transcript and status.
   - Handling errors and cleaning up files.

## 6. API Endpoints

(Define these in `server/routes/auth.js` and `server/routes/transcriptions.js`, then import into `server.js`)

### Authentication (`server/routes/auth.js`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Transcriptions (`server/routes/transcriptions.js`)
- `POST /api/transcriptions` - Upload audio for transcription (requires auth, uses Multer for file upload)
- `GET /api/transcriptions` - Get user's transcriptions (requires auth)
- `GET /api/transcriptions/:id` - Get single transcription by ID (requires auth, check ownership)
- `DELETE /api/transcriptions/:id` - Delete transcription (requires auth, check ownership)

## 7. Frontend Components

### Required Components
1.  **Layout Components (`client/src/components/layout/`)**
    *   `Navbar.tsx` (with login/signup/logout, user profile links)
    *   `Footer.tsx`
2.  **Authentication Pages (`client/src/pages/auth/`)**
    *   `LoginPage.tsx`
    *   `SignupPage.tsx`
3.  **Core Application Pages (`client/src/pages/`)**
    *   `DashboardPage.tsx` (overview, recent transcriptions)
    *   `UploadPage.tsx` (file upload form)
    *   `TranscriptionListPage.tsx`
    *   `TranscriptionDetailPage.tsx` (view transcript, metadata, audio player)
4.  **Reusable UI Components (`client/src/components/ui/`)**
    *   `Button.tsx`
    *   `Input.tsx`
    *   `Modal.tsx`
    *   `LoadingSpinner.tsx`
5.  **Feature Components (`client/src/components/transcriptions/`)**
    *   `FileUploadForm.tsx`
    *   `TranscriptionCard.tsx`
    *   `AudioPlayer.tsx`
6.  **Routing (`client/src/App.tsx` or a dedicated `Router.tsx`)**
    *   `ProtectedRoute.tsx` (HOC or wrapper for auth-required routes)
7.  **Contexts (`client/src/contexts/`)**
    *   `AuthContext.tsx` (manage user session, token)

## 8. Deployment

### Backend (e.g., Railway, Render, Google Cloud Run)
1.  Ensure `Dockerfile` is present if needed by the platform.
2.  Push code to GitHub.
3.  Connect repository to hosting platform.
4.  Configure build command (e.g., `npm install`).
5.  Set start command (e.g., `npm start` or `node server/server.js`).
6.  Add environment variables (MONGODB_URI, JWT_SECRET, DEEPGRAM_API_KEY, PORT).
7.  Deploy.

### Frontend (e.g., Vercel, Netlify, Firebase Hosting)
1.  Push code to GitHub.
2.  Import project into hosting platform from `client` subdirectory.
3.  Configure build settings (framework: Create React App, build command: `npm run build`, output dir: `build` or `client/build`).
4.  Add environment variables (e.g., `REACT_APP_API_BASE_URL=your_backend_url`).
5.  Deploy.

## 9. Testing

### Backend Tests
-   **Unit Tests**: Use Jest for testing individual functions/modules (e.g., in services, utils).
-   **Integration Tests**: Test interactions between modules (e.g., controller-service-model).
-   **API Endpoint Tests**: Use Supertest to test API routes directly.

### Frontend Tests
-   **Component Tests**: Use React Testing Library and Jest to test individual components.
-   **Integration Tests**: Test interactions between components and page flows.
-   **End-to-End Tests**: (Optional, for critical flows) Use Cypress or Playwright.

## 10. Future Enhancements

1.  **Real-time Updates**: WebSocket integration for live transcription status updates on the frontend.
2.  **Advanced Transcription Features**: Allow users to select Deepgram model features (e.g., diarization, summarization if available, specific languages).
3.  **File Management**: Folder organization for transcriptions.
4.  **Export Options**: Export transcripts in various formats (TXT, SRT, VTT).
5.  **Search**: Search within user's transcripts.
6.  **Editing**: Allow users to edit their transcripts.
7.  **User Experience**: Dark mode, improved audio player with transcript synchronization.
8.  **Collaboration**: Share transcripts with other users (requires more complex auth/permissions).
9.  **Admin Panel**: For managing users and system settings.

## 11. Monitoring and Maintenance

1.  **Error Tracking**: Integrate Sentry or similar for frontend and backend error monitoring.
2.  **Performance Monitoring**: Utilize platform-provided tools or services like New Relic/Datadog.
3.  **Logging**: Implement comprehensive logging in the backend (e.g., using Winston or Morgan).
4.  **Database Backups**: Configure regular automated backups for MongoDB Atlas.
5.  **Dependency Management**: Regularly review and update dependencies (e.g., using `npm outdated`, `npm update`).
6.  **Security Audits**: Periodically review security best practices and audit code for vulnerabilities.

This plan provides a comprehensive guide for building the Deepgram Transcription App. Remember to break down tasks into smaller, manageable pieces and test frequently.
