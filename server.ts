import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import helmet from 'helmet';
// @ts-ignore - Build output will be available at runtime
import * as build from './build/server/index.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Serve static assets from build/client
app.use(express.static('build/client', {
  immutable: true,
  maxAge: '1y',
}));

// Custom React Router request handler
app.use(async (req, res, next) => {
  try {
    // Convert Express request to Web API Request
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    const init: RequestInit = {
      method: req.method,
      headers: new Headers(req.headers as HeadersInit),
    };

    // Add body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req.body;
    }

    const request = new Request(url.toString(), init);

    // Get the entry module and its handler
    const entryModule = build.entry?.module || build;
    const handleRequest = entryModule.default || entryModule;

    // Create mock router context and headers for the handler
    const responseStatusCode = 200;
    const responseHeaders = new Headers();
    const routerContext = {};
    const loadContext = {};

    // Call the entry.server handler
    const response = await handleRequest(
      request,
      responseStatusCode,
      responseHeaders,
      routerContext,
      loadContext
    );

    // Convert Web API Response back to Express response
    res.status(response.status);

    // Set response headers
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });

    // Send response body
    if (response.body) {
      const body = await response.text();
      res.send(body);
    } else {
      res.end();
    }
  } catch (error) {
    next(error);
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`🚀 Express server listening on port ${port}`);
});