
// Centralized configuration for Environment Variables

export const ENV = {
    // Gemini / Google Gen AI
    GEMINI_API_KEY: process.env.API_KEY || '',
  
    // Firebase Configuration
    FIREBASE: {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID,
    },
  
    // Feature Flags / System Config
    IS_DEMO_MODE: !process.env.REACT_APP_FIREBASE_API_KEY,
  };
  
  export const checkConfig = () => {
      if (!ENV.GEMINI_API_KEY) {
          console.warn("Missing API_KEY for Gemini. AI features will run in mock mode.");
      }
      if (ENV.IS_DEMO_MODE) {
          console.warn("Missing Firebase Keys. App is running in Mock/Demo mode using LocalStorage.");
      }
  };
