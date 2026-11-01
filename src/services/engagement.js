const { supabaseAdmin } = require('../config/supabase');
const { REACTION_TYPES } = require('../config/constants');
const dbError = require('../utils/dbError');

const emptyReactions = () => Object.fromEntries(REACTION_TYPES.map((t) => [t, 0]));

const emptySummary = () => ({
  comments_count: 0,
  reactions: emptyReactions(),
  reactions_total: 0,
});

/** Returns Map<id, { comments_count, reactions: {like: n, ...}, reactions_total }> */
const getSummaries = async (targetType, ids) => {
  const map = new Map(ids.map((id) => [id, emptySummary()]));
  if (!ids.length) return map;

  const [comments, reactions] = await Promise.all([
    supabaseAdmin.from('comment_counts').select('target_id,total').eq('target_type', targetType).in('target_id', ids),
    supabaseAdmin
      .from('reaction_counts')
      .select('target_id,type,total')
      .eq('target_type', targetType)
      .in('target_id', ids),
  ]);
  if (comments.error) throw dbError(comments.error);
  if (reactions.error) throw dbError(reactions.error);

  for (const row of comments.data) map.get(row.target_id).comments_count = row.total;
  for (const row of reactions.data) {
    const summary = map.get(row.target_id);
    summary.reactions[row.type] = row.total;
    summary.reactions_total += row.total;
  }
  return map;
};

// Removes comments and reactions when their parent project/bulletin is deleted.
const deleteForTarget = async (targetType, id) => {
  const results = await Promise.all([
    supabaseAdmin.from('comments').delete().eq('target_type', targetType).eq('target_id', id),
    supabaseAdmin.from('reactions').delete().eq('target_type', targetType).eq('target_id', id),
  ]);
  results.forEach((r) => r.error && console.error('[engagement] cleanup failed:', r.error));
};

module.exports = { getSummaries, deleteForTarget, emptySummary, emptyReactions };
