# Anime Checklist App

A smart anime tracker powered by Gemini AI and Firebase.

## Setup Instructions

### 1. Prerequisites
- Node.js (v16+)
- npm or yarn

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
This application requires Firebase for authentication/database and Google Gemini for AI recommendations.

1.  Open the `.env` file in the root directory.
2.  Fill in the values using your actual keys:

```env
# Gemini API Key (https://aistudio.google.com/)
API_KEY=your_gemini_key

# Firebase Config (Firebase Console -> Project Settings)
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

### 4. Running the App
```bash
npm start
```

## Features
- **Auth**: Email/Password and Google Sign-in via Firebase.
- **Database**: Firestore for user profiles and watchlists.
- **AI**: Google Gemini 2.5 Flash for personalized anime recommendations.
- **API**: Jikan (MyAnimeList) API for anime data.

## Deployment
Set the environment variables in your deployment provider (e.g., Vercel, Netlify) matching the keys in `.env`.
