const router = require('express').Router();
const resources = require('../resources');
const resourceRouter = require('./resource.router');

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check (used by Render)
 *     responses:
 *       200:
 *         description: Service is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 uptime: { type: number, example: 123.45 }
 */
router.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

router.use('/api/auth', require('./auth.routes'));
router.use('/api/clubhouse', require('./clubhouse.routes'));
router.use('/api/comments', require('./comments.routes'));
resources.forEach((cfg) => router.use(cfg.basePath, resourceRouter(cfg)));

module.exports = router;
