import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider, 
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  updatePassword
} from 'firebase/auth';

// Disable Firebase initialization and create mock auth
// const firebaseConfig = {
//   apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
//   authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
//   storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
//   appId: import.meta.env.VITE_FIREBASE_APP_ID
// };

// Create mock auth instead of Firebase
// const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const googleProvider = new GoogleAuthProvider();

// Mock auth object with necessary methods
const auth = {
  currentUser: {
    email: 'test@example.com',
    displayName: 'Test User',
    uid: 'test-user-id',
    getIdToken: () => Promise.resolve('mock-token')
  },
  onAuthStateChanged: (callback) => {
    callback(auth.currentUser);
    return () => {}; // Return unsubscribe function
  }
};

// Mock authentication methods
export const loginWithEmail = (email, password) => 
  Promise.resolve({ user: auth.currentUser });

export const loginWithGoogle = () => 
  Promise.resolve({ user: auth.currentUser });

export const registerWithEmail = (email, password) =>
  Promise.resolve({ user: auth.currentUser });

export const logoutUser = () => Promise.resolve();

export const verifyEmail = (user) => 
  Promise.resolve();

export const changePassword = (user, newPassword) => 
  Promise.resolve();

export { auth }; 