const { supabaseAdmin } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const dbError = require('../utils/dbError');
const { isUuid } = require('../utils/validators');
const { parsePagination, buildMeta, fetchPage } = require('../utils/pagination');

// Admin: list comments across everything (optionally filtered) for moderation.
exports.list = asyncHandler(async (req, res) => {
  const { target_type: targetType, target_id: targetId } = req.query;
  if (targetType !== undefined && !['project', 'bulletin'].includes(targetType)) {
    throw new ApiError(400, 'target_type must be "project" or "bulletin"');
  }
  if (targetId !== undefined && !isUuid(targetId)) throw new ApiError(400, 'target_id must be a UUID');

  const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });
  const build = () => {
    let q = supabaseAdmin
      .from('comments')
      .select('id,target_type,target_id,author_name,body,created_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (targetType) q = q.eq('target_type', targetType);
    if (targetId) q = q.eq('target_id', targetId);
    return q;
  };

  const { data, count } = await fetchPage(build, from, to);
  res.json({ success: true, data, meta: buildMeta(page, limit, count) });
});

// Admin: delete any comment.
exports.remove = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) throw new ApiError(400, 'Invalid id: must be a UUID');

  const { data, error } = await supabaseAdmin.from('comments').delete().eq('id', req.params.id).select('id');
  if (error) throw dbError(error);
  if (!data || !data.length) throw new ApiError(404, 'Comment not found');

  res.json({ success: true, message: 'Comment deleted successfully' });
});
