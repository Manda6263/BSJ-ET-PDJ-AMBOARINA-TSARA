import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA8OyZsCiyqV1d_qabSjgXkYCUeJGoo690",
  authDomain: "beuasejour.firebaseapp.com",
  projectId: "beuasejour",
  storageBucket: "beuasejour.firebasestorage.app",
  messagingSenderId: "1039638627856",
  appId: "1:1039638627856:web:d2483c24e9cc4540b3ec95",
  measurementId: "G-5Z1Q0783N3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);


// Configure auth settings for production
auth.useDeviceLanguage(); // Use device language for auth UI
auth.settings.appVerificationDisabledForTesting = false; // Enable app verification

export default app;

// Firestore collection names
export const COLLECTIONS = {
  REGISTER_SALES: 'register_sales',
  PRODUCTS: 'products',
  USERS: 'users',
  ALERTS: 'alerts',
  SETTINGS: 'settings'
} as const;

// Firestore data types
export interface FirestoreRegisterSale {
  id: string;
  product: string;
  category: string;
  register: string;
  date: string; // ISO string
  seller: string;
  quantity: number;
  price: number;
  total: number;
  createdAt: string; // ISO string
  // ✅ NEW: Categorization metadata field
  category_metadata?: {
    category: string;
    subcategory?: string | null;
    categorized_at: string;
    categorized_by: string;
  };
}

export interface FirestoreProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number; // Final quantity
  initialStock?: number; // Initial quantity from stock import
  initialStockDate?: string; // Effective date for initial stock (YYYY-MM-DD)
  quantitySold?: number; // Quantity sold from sales import
  minStock: number;
  description?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface FirestoreUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'seller' | 'viewer';
  createdAt: string; // ISO string
  lastLogin?: string; // ISO string
}

export interface FirestoreAlert {
  id: string;
  type: 'low-stock' | 'high-sales' | 'system' | 'duplicate';
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string; // ISO string
  read: boolean;
  userId?: string;
}

// Environment configuration
export const ENV_CONFIG = {
  isDevelopment: true,
  isProduction: false,
  apiUrl: 'https://beuasejour.firebaseapp.com',
  enableAnalytics: true,
  enablePerformanceMonitoring: true,
  logLevel: 'error' // Only log errors in production
};

// Security configuration for production
export const SECURITY_CONFIG = {
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  requireEmailVerification: true,
  enableTwoFactorAuth: false, // Can be enabled later
  passwordMinLength: 8,
  passwordRequireSpecialChars: true
};

// Performance configuration
export const PERFORMANCE_CONFIG = {
  enableOfflineSupport: true,
  cacheSizeBytes: 40 * 1024 * 1024, // 40MB
  enablePersistence: true,
  syncSettings: {
    cacheSizeBytes: 40 * 1024 * 1024
  }
};