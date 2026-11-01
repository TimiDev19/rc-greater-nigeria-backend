const express = require('express');
const createCrud = require('../controllers/crud.factory');
const engagementRouter = require('./engagement.router');
const uploadFor = require('../middleware/upload');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Reads are public. Writes require an admin token (checked BEFORE the upload is parsed).
module.exports = (cfg) => {
  const router = express.Router();
  const crud = createCrud(cfg);
  const admin = [requireAuth, requireAdmin];
  const upload = uploadFor(cfg.files);

  router.get('/', crud.list);
  router.get('/:id', crud.getOne);
  router.post('/', ...admin, upload, crud.create);
  router.put('/:id', ...admin, upload, crud.update);
  router.delete('/:id', ...admin, crud.remove);

  if (cfg.targetType) router.use('/:id', engagementRouter(cfg));

  return router;
};
