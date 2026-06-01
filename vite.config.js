import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESIGNS_DIR = path.resolve(__dirname, 'designs')

const SAFE_NAME = /^[a-zA-Z0-9 _.\-]+$/

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, body, contentType = 'application/json') {
  res.statusCode = status
  res.setHeader('content-type', contentType)
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function designsApiPlugin() {
  return {
    name: 'designs-api',
    configureServer(server) {
      server.middlewares.use('/api/designs', async (req, res, next) => {
        try {
          await fs.mkdir(DESIGNS_DIR, { recursive: true })
          const url = new URL(req.url, 'http://localhost')
          const sub = decodeURIComponent(url.pathname.replace(/^\/+/, ''))

          // GET /api/designs  → list
          if (req.method === 'GET' && sub === '') {
            const files = await fs.readdir(DESIGNS_DIR)
            const names = files
              .filter((f) => f.toLowerCase().endsWith('.json'))
              .map((f) => f.replace(/\.json$/i, ''))
              .sort()
            return send(res, 200, names)
          }

          if (!sub) return next()
          if (!SAFE_NAME.test(sub) || sub.includes('..')) {
            return send(res, 400, { error: 'invalid name' })
          }
          const filePath = path.join(DESIGNS_DIR, `${sub}.json`)

          if (req.method === 'GET') {
            try {
              const data = await fs.readFile(filePath, 'utf8')
              return send(res, 200, data)
            } catch {
              return send(res, 404, { error: 'not found' })
            }
          }

          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readBody(req)
            try { JSON.parse(body) } catch {
              return send(res, 400, { error: 'invalid json' })
            }
            await fs.writeFile(filePath, body, 'utf8')
            return send(res, 200, { ok: true })
          }

          if (req.method === 'DELETE') {
            try {
              await fs.unlink(filePath)
              return send(res, 200, { ok: true })
            } catch {
              return send(res, 404, { error: 'not found' })
            }
          }

          next()
        } catch (e) {
          send(res, 500, { error: String(e) })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), designsApiPlugin()],
})
