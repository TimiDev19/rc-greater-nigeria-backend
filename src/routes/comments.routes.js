const router = require('express').Router();
const controller = require('../controllers/comments.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Admin moderation. Docs for these are generated in src/docs/buildDocs.js
router.get('/', requireAuth, requireAdmin, controller.list);
router.delete('/:id', requireAuth, requireAdmin, controller.remove);

module.exports = router;
