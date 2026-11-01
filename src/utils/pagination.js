const dbError = require('./dbError');

const parsePagination = (query, { defaultLimit = 10, maxLimit = 100 } = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const from = (page - 1) * limit;
  return { page, limit, from, to: from + limit - 1 };
};

const buildMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  total_pages: Math.ceil(total / limit),
});

// Escape LIKE wildcards so a search for "100%" matches literally.
const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Runs a paginated query. `build` must return a FRESH query builder each time
 * (select with { count: 'exact' } already applied). If the requested page is past
 * the end, Supabase returns an error, so we return an empty page with the true total.
 */
const fetchPage = async (build, from, to) => {
  const { data, error, count } = await build().range(from, to);
  if (!error) return { data: data || [], count: count || 0 };

  if (error.code === 'PGRST103') {
    const head = await build().range(0, 0);
    if (!head.error) return { data: [], count: head.count || 0 };
  }
  throw dbError(error);
};

module.exports = { parsePagination, buildMeta, escapeLike, fetchPage };
