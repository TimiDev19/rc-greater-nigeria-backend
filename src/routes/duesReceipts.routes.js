const router = require('express').Router();
const controller = require('../controllers/duesReceipts.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Payment records are private and every operation is restricted to admins.
router.use(requireAuth, requireAdmin);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/pdf', controller.downloadPdf);

module.exports = router;
