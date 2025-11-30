
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
};

export const checkConfig = () => {
    console.log("Environment Check:");
    const apiKey = ENV.FIREBASE.apiKey;
    console.log("Gemini Key:", ENV.GEMINI_API_KEY ? "Present" : "Missing");
    console.log("Firebase Key Status:", apiKey ? "Present" : "Missing");
    if (apiKey) {
        console.log("Firebase Key (Masked):", apiKey.substring(0, 5) + "...");
        console.log("Firebase Key Length:", apiKey.length);
    }
    console.log("Firebase Project:", ENV.FIREBASE.projectId);

    if (!ENV.GEMINI_API_KEY) {
        console.warn("Missing API_KEY for Gemini. AI features will not work.");
    }
};
