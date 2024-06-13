// index.js

const http = require('http');
const { Counter, Histogram, register: registerMetrics } = require('prom-client');
const pino = require('pino');
const pinoLoki = require('pino-loki');

const port = process.env.PORT ?? 8080
const lokiHost = process.env.LOKI_HOST ?? 'http://loki:3100'

// Prometheus метрики
const requestsCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method']
});

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method'],
  // Define some buckets (in seconds) - you can adjust these as needed
  buckets: [0.01, 0.03, 0.07, 0.15, 0.3, 0.7, 1.5, 3]
});

// configure pino to send logs to loki
const lokiStream = new pinoLoki({
  host: lokiHost,
  batching: false,
  // These labels will be added to every log
  labels: { application: 'myapp' },
})
const logger = pino({}, lokiStream);

const requestHandler = async (req, res) => {
  const start = Date.now();

  res.on('finish', () => {  // The 'finish' event will be emitted when the response is done
    const duration = Date.now() - start;
    requestDuration.observe({ method: req.method }, duration / 1000);  // Convert to seconds
  });

  if (req.url === '/metrics') {
    res.setHeader('Content-Type', registerMetrics.contentType);
    res.end(await registerMetrics.metrics());
  } else if (req.url === '/action') {
    requestsCounter.inc({ method: req.method });

    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 2000)))
    logger.info({ method: req.method, url: req.url }, 'Action endpoint was hit'); // logging

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Action executed!');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
};

const server = http.createServer(requestHandler);

server.listen(port, () => {
  logger.info('Server running on http://localhost:' + port);
});
