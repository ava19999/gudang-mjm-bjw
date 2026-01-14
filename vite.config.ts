import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        // Naikkan batas peringatan chunk size (misal ke 1600 kbs atau 2000 kbs)
        chunkSizeWarningLimit: 1600, 
        
        // Opsional: Memecah vendor chunk agar lebih rapi (bisa membantu load time)
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('xlsx')) {
                            return 'xlsx'; // Pisahkan xlsx jadi chunk sendiri
                        }
                        if (id.includes('@google/genai')) {
                            return 'genai'; // Pisahkan AI jadi chunk sendiri
                        }
                        if (id.includes('lucide-react')) {
                            return 'icons'; // Pisahkan icon
                        }
                        return 'vendor'; // Sisanya masuk vendor
                    }
                }
            }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});