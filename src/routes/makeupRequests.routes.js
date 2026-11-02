const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/makeupRequests.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' },
});

router.post('/', submitLimiter, controller.create);
router.get('/', requireAuth, requireAdmin, controller.list);
router.get('/:id', requireAuth, requireAdmin, controller.getOne);
router.post('/:id/approve', requireAuth, requireAdmin, controller.approve);
router.post('/:id/reject', requireAuth, requireAdmin, controller.reject);
router.get('/:id/card', requireAuth, requireAdmin, controller.downloadCard);

module.exports = router;
