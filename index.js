// Minimal zero-dependency server for the Ollama raw-generate demo.
// - Serves index.html
// - Proxies /api/* to the local Ollama instance (avoids browser CORS and
//   keeps everything a single `npm start` command).

const http = require('http');
const fs = require('fs');
const path = require('path');

// Minimal .env loader (avoids a dependency). Lines like KEY=value.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env file — fine */ }

const OLLAMA = {
  host: process.env.OLLAMA_HOST || '127.0.0.1',
  port: process.env.OLLAMA_PORT || 11434,
};
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || '';

if (!ACCESS_CODE) {
  console.warn('⚠  No ACCESS_CODE set in .env — the API is open to anyone.');
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('index.html not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Transparent proxy to Ollama, streaming the response straight back.
  if (req.url.startsWith('/api/')) {
    // Access gate: learners must send the shared code.
    if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing access code.' }));
      return;
    }
    const proxy = http.request(
      {
        host: OLLAMA.host,
        port: OLLAMA.port,
        method: req.method,
        path: req.url,
        headers: { 'Content-Type': 'application/json' },
      },
      (pres) => {
        res.writeHead(pres.statusCode, pres.headers);
        pres.pipe(res);
      }
    );
    proxy.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Cannot reach Ollama at ${OLLAMA.host}:${OLLAMA.port} — ${e.message}`,
        })
      );
    });
    req.pipe(proxy);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () =>
  console.log(`Ollama raw-generate demo → http://localhost:${PORT}`)
);
