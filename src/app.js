const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const env = require('./config/env');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Render sits behind a proxy; needed so rate limiting sees the real client IP.
app.set('trust proxy', 1);

// CSP is disabled so Swagger UI's inline assets load; everything else in helmet stays on.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => res.redirect('/api-docs'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'API Docs' }));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

app.use(routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
