import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ENV_CONFIG } from '../lib/firebase';

// React component export
export const FirebaseSetup: React.FC = () => {
  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-blue-600" />
        <h3 className="font-medium text-blue-900">Firebase Configuration</h3>
      </div>
      <p className="mt-2 text-sm text-blue-700">
        Firebase is configured and ready. Project ID: {ENV_CONFIG.apiUrl}
      </p>
    </div>
  );
};

export default FirebaseSetup;