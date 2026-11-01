const router = require('express').Router();
const controller = require('../controllers/clubhouse.controller');
const { requireAuth, requireAdmin, requireMember } = require('../middleware/auth');

router.post('/auth/login', controller.memberLogin);

// Member account administration: email is only writable through these admin routes.
router.get('/members', requireAuth, requireAdmin, controller.listMembers);
router.get('/members/:id', requireAuth, requireAdmin, controller.getMember);
router.post('/members', requireAuth, requireAdmin, controller.createMember);
router.put('/members/:id', requireAuth, requireAdmin, controller.updateMember);
router.delete('/members/:id', requireAuth, requireAdmin, controller.deleteMember);

router.get('/profile', requireAuth, requireMember, controller.profile);
router.post('/profile/change-password', requireAuth, requireMember, controller.changeOwnPassword);

router.get('/articles', requireAuth, requireMember, controller.listArticles);
router.post('/articles', requireAuth, requireMember, controller.createArticle);
router.get('/articles/:id', requireAuth, requireMember, controller.getArticle);
router.put('/articles/:id', requireAuth, requireMember, controller.updateArticle);
router.delete('/articles/:id', requireAuth, requireMember, controller.deleteArticle);
router.get('/articles/:id/comments', requireAuth, requireMember, controller.listComments);
router.post('/articles/:id/comments', requireAuth, requireMember, controller.createComment);
router.put('/articles/:id/comments/:commentId', requireAuth, requireMember, controller.updateComment);
router.delete('/articles/:id/comments/:commentId', requireAuth, requireMember, controller.deleteComment);
router.get('/articles/:id/reactions', requireAuth, requireMember, controller.getReactions);
router.post('/articles/:id/reactions', requireAuth, requireMember, controller.toggleReaction);

module.exports = router;
