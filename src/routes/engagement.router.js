const express = require('express');
const createEngagementController = require('../controllers/engagement.controller');
const { commentLimiter, reactionLimiter } = require('../middleware/rateLimiters');

// Mounted at <basePath>/:id by resource.router.js
module.exports = (cfg) => {
  const router = express.Router({ mergeParams: true });
  const c = createEngagementController({ targetType: cfg.targetType, table: cfg.table, label: cfg.label });

  router.get('/comments', c.listComments);
  router.post('/comments', commentLimiter, c.addComment);
  router.get('/reactions', c.getReactions);
  router.post('/reactions', reactionLimiter, c.toggleReaction);

  return router;
};
