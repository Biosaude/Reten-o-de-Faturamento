import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{ "import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT": JSON.stringify(process.env.VERCEL_ENV ?? "development") },server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3001'}},build:{sourcemap:false,rollupOptions:{output:{manualChunks:(id)=>id.includes('/node_modules/recharts/')||id.includes('/node_modules/d3-')?'charts':id.includes('/node_modules/@supabase/')?'auth':undefined}}}});
