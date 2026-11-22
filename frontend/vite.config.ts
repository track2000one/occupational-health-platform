import { defineConfig, type ProxyOptions } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// V4 is initially accessible only over a loopback SSH tunnel.
// The browser must never send credentials or records to the old production API.
const v4Private = process.env.VITE_API_URL === 'http://127.0.0.1:18081/api'
const v4Target = process.env.OHP_V4_PRIVATE_API_TARGET

function privateProxy() {
  if (!v4Target) return undefined
  if (!v4Private) throw new Error('Private API proxy requires the isolated V4 browser origin')
  const target = new URL(v4Target)
  if (target.protocol !== 'http:' || !target.hostname.endsWith('.railway.internal')
      || target.port !== '8080' || target.username || target.password
      || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('V4 API target must be a private Railway HTTP service on port 8080')
  }
  // Runtime diagnosis: record only route and HTTP status. No credentials,
  // names, identifiers, payloads, or query strings appear in these logs.
  const apiProxy: ProxyOptions = {
    target: target.origin,
    changeOrigin: false,
    timeout: 120000,
    proxyTimeout: 120000,
    configure(proxy) {
      proxy.on('proxyReq', (_proxyReq, request) => {
        if (request.url?.split('?')[0] === '/api/provisional-employees/readiness/') {
          console.info('[v4-private-proxy] readiness request forwarded');
        }
      })
      proxy.on('proxyRes', (proxyResponse, request) => {
        if (request.url?.split('?')[0] === '/api/provisional-employees/readiness/') {
          console.info('[v4-private-proxy] readiness upstream status=' + String(proxyResponse.statusCode))
        }
      })
      proxy.on('error', (error, request) => {
        if (request.url?.split('?')[0] === '/api/provisional-employees/readiness/') {
          console.error('[v4-private-proxy] readiness transport error=' + String((error as { code?: string }).code || 'unknown'))
        }
      })
    },
  }
  return {
    '/api/': apiProxy,
    '/health/': { target: target.origin, changeOrigin: false },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: [
      'occupational-health-platform-frontend-production.up.railway.app',
      '.railway.app',
    ],
  },
  preview: {
    proxy: privateProxy(),
    headers: v4Private ? {
      'Content-Security-Policy': "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    } : undefined,
    allowedHosts: [
      'occupational-health-platform-frontend-production.up.railway.app',
      '.railway.app',
    ],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
