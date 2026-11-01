const { supabaseAdmin, createAuthClient } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const dbError = require('../utils/dbError');
const { isUuid, text } = require('../utils/validators');
const { parsePagination, buildMeta, fetchPage } = require('../utils/pagination');

const role = (user) => user.app_metadata?.role;
const publicUser = (user) => ({ id: user.id, email: user.email, role: role(user), created_at: user.created_at });
const emailValidator = (value) => {
  const email = text({ max: 254 })(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('must be a valid email');
  return email;
};
const passwordValidator = (value, exactEight = false) => {
  if (typeof value !== 'string' || (exactEight ? value.length !== 8 : value.length < 8) || value.length > 72) {
    throw new Error(exactEight ? 'must be exactly 8 characters' : 'must be at least 8 characters');
  }
  return value;
};
exports.listMembers = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const allMembers = [];
  for (let userPage = 1; ; userPage++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: userPage, perPage: 1000 });
    if (error) throw new ApiError(400, error.message);
    allMembers.push(...data.users.filter((u) => role(u) === 'member'));
    if (data.users.length < 1000) break;
  }
  const from = (page - 1) * limit;
  res.json({ success: true, data: allMembers.slice(from, from + limit).map(publicUser), meta: buildMeta(page, limit, allMembers.length) });
});

exports.getMember = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
  if (error || !data.user || role(data.user) !== 'member') throw new ApiError(404, 'Member not found');
  res.json({ success: true, data: publicUser(data.user) });
});

exports.createMember = asyncHandler(async (req, res) => {
  const input = { email: req.body?.email, password: req.body?.password };
  const errors = {};
  try { input.email = emailValidator(input.email); } catch (e) { errors.email = e.message; }
  try { input.password = passwordValidator(input.password, true); } catch (e) { errors.password = e.message; }
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
    app_metadata: { role: 'member' }, user_metadata: {},
  });
  if (error) throw new ApiError(400, error.message);
  res.status(201).json({ success: true, data: publicUser(data.user) });
});

exports.updateMember = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const input = req.body || {};
  const changes = {};
  const errors = {};
  if (input.email !== undefined) { try { changes.email = emailValidator(input.email); } catch (e) { errors.email = e.message; } }
  if (input.password !== undefined) { try { changes.password = passwordValidator(input.password); } catch (e) { errors.password = e.message; } }
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  if (!Object.keys(changes).length) throw new ApiError(400, 'Provide email and/or password');
  const { data: found, error: getError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
  if (getError || !found.user || role(found.user) !== 'member') throw new ApiError(404, 'Member not found');
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, changes);
  if (error) throw new ApiError(400, error.message);
  res.json({ success: true, data: publicUser(data.user) });
});

exports.deleteMember = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data: found, error: getError } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
  if (getError || !found.user || role(found.user) !== 'member') throw new ApiError(404, 'Member not found');
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
  if (error) throw new ApiError(400, error.message);
  res.json({ success: true, message: 'Member deleted successfully' });
});

exports.profile = (req, res) => res.json({ success: true, data: publicUser(req.user) });

exports.memberLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new ApiError(400, 'email and password are required');
  }
  const { data, error } = await createAuthClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  // Keep the same response for invalid credentials and non-member accounts.
  if (error || !data?.session || role(data.user) !== 'member') throw new ApiError(401, 'Invalid member email or password');
  res.json({ success: true, data: {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: data.session.token_type,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    user: publicUser(data.user),
  } });
});

exports.changeOwnPassword = asyncHandler(async (req, res) => {
  const { current_password: current, new_password: next } = req.body || {};
  if (typeof current !== 'string' || typeof next !== 'string') throw new ApiError(400, 'current_password and new_password are required');
  passwordValidator(next);
  if (current === next) throw new ApiError(400, 'new_password must differ from current_password');
  const { error: verifyError } = await createAuthClient().auth.signInWithPassword({ email: req.user.email, password: current });
  if (verifyError) throw new ApiError(401, 'Current password is incorrect');
  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: next });
  if (error) throw new ApiError(400, error.message);
  res.json({ success: true, message: 'Password updated successfully' });
});

const articleFields = { title: (v) => text({ max: 200 })(v), body: (v) => text({ max: 50000 })(v) };
const articleOut = (row) => ({ id: row.id, title: row.title, body: row.body, author_id: row.author_id, created_at: row.created_at, updated_at: row.updated_at });
const getArticle = async (id) => {
  if (!isUuid(id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data, error } = await supabaseAdmin.from('clubhouse_articles').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, 'Article not found');
  return data;
};
const canEdit = (req, row) => role(req.user) === 'admin' || row.author_id === req.user.id;

exports.listArticles = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const build = () => {
    let q = supabaseAdmin.from('clubhouse_articles').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (typeof req.query.search === 'string' && req.query.search.trim()) q = q.ilike('title', `%${req.query.search.trim().slice(0, 100).replace(/[%_,]/g, '')}%`);
    return q;
  };
  const { data, count } = await fetchPage(build, from, to);
  res.json({ success: true, data: data.map(articleOut), meta: buildMeta(page, limit, count) });
});
exports.getArticle = asyncHandler(async (req, res) => res.json({ success: true, data: articleOut(await getArticle(req.params.id)) }));
exports.createArticle = asyncHandler(async (req, res) => {
  const values = { title: req.body?.title, body: req.body?.body };
  const errors = {};
  for (const key of Object.keys(articleFields)) { try { values[key] = articleFields[key](values[key]); } catch (e) { errors[key] = e.message; } }
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  const { data, error } = await supabaseAdmin.from('clubhouse_articles').insert({ ...values, author_id: req.user.id }).select().single();
  if (error) throw dbError(error);
  res.status(201).json({ success: true, data: articleOut(data) });
});
exports.updateArticle = asyncHandler(async (req, res) => {
  const existing = await getArticle(req.params.id);
  if (!canEdit(req, existing)) throw new ApiError(403, 'You can only edit your own articles');
  const changes = {};
  const errors = {};
  for (const key of Object.keys(articleFields)) if (req.body?.[key] !== undefined) {
    try { changes[key] = articleFields[key](req.body[key]); } catch (e) { errors[key] = e.message; }
  }
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  if (!Object.keys(changes).length) throw new ApiError(400, 'Provide title and/or body');
  const { data, error } = await supabaseAdmin.from('clubhouse_articles').update(changes).eq('id', existing.id).select().single();
  if (error) throw dbError(error);
  res.json({ success: true, data: articleOut(data) });
});
exports.deleteArticle = asyncHandler(async (req, res) => {
  const existing = await getArticle(req.params.id);
  if (!canEdit(req, existing)) throw new ApiError(403, 'You can only delete your own articles');
  const { error } = await supabaseAdmin.from('clubhouse_articles').delete().eq('id', existing.id);
  if (error) throw dbError(error);
  res.json({ success: true, message: 'Article deleted successfully' });
});

exports.listComments = asyncHandler(async (req, res) => {
  const article = await getArticle(req.params.id);
  const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });
  const build = () => supabaseAdmin.from('clubhouse_comments').select('id,article_id,author_id,body,created_at', { count: 'exact' }).eq('article_id', article.id).order('created_at', { ascending: false });
  const { data, count } = await fetchPage(build, from, to);
  res.json({ success: true, data, meta: buildMeta(page, limit, count) });
});
exports.createComment = asyncHandler(async (req, res) => {
  const article = await getArticle(req.params.id);
  let body;
  try { body = text({ max: 2000 })(req.body?.body); } catch (e) { throw new ApiError(400, 'Validation failed', { body: e.message }); }
  const { data, error } = await supabaseAdmin.from('clubhouse_comments').insert({ article_id: article.id, author_id: req.user.id, body }).select('id,article_id,author_id,body,created_at').single();
  if (error) throw dbError(error);
  res.status(201).json({ success: true, data });
});
exports.deleteComment = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.commentId)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data, error } = await supabaseAdmin.from('clubhouse_comments').select('id,author_id').eq('id', req.params.commentId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, 'Comment not found');
  if (!canEdit(req, { author_id: data.author_id })) throw new ApiError(403, 'You can only delete your own comments');
  const { error: deleteError } = await supabaseAdmin.from('clubhouse_comments').delete().eq('id', data.id);
  if (deleteError) throw dbError(deleteError);
  res.json({ success: true, message: 'Comment deleted successfully' });
});

exports.updateComment = asyncHandler(async (req, res) => {
  if (!isUuid(req.params.commentId)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data: existing, error } = await supabaseAdmin.from('clubhouse_comments').select('id,author_id').eq('id', req.params.commentId).maybeSingle();
  if (error) throw dbError(error);
  if (!existing) throw new ApiError(404, 'Comment not found');
  if (!canEdit(req, { author_id: existing.author_id })) throw new ApiError(403, 'You can only edit your own comments');
  let body;
  try { body = text({ max: 2000 })(req.body?.body); } catch (e) { throw new ApiError(400, 'Validation failed', { body: e.message }); }
  const { data, error: updateError } = await supabaseAdmin.from('clubhouse_comments').update({ body }).eq('id', existing.id).select('id,article_id,author_id,body,created_at').single();
  if (updateError) throw dbError(updateError);
  res.json({ success: true, data });
});

const reactionTypes = ['like', 'love', 'celebrate', 'clap', 'wow'];
exports.getReactions = asyncHandler(async (req, res) => {
  const article = await getArticle(req.params.id);
  const { data, error } = await supabaseAdmin.from('clubhouse_reactions').select('type,author_id').eq('article_id', article.id);
  if (error) throw dbError(error);
  const reactions = Object.fromEntries(reactionTypes.map((type) => [type, 0]));
  for (const row of data) reactions[row.type]++;
  const own = data.find((r) => r.author_id === req.user.id);
  res.json({ success: true, data: { reactions, reactions_total: data.length, my_reaction: own?.type || null } });
});
exports.toggleReaction = asyncHandler(async (req, res) => {
  const article = await getArticle(req.params.id);
  const type = req.body?.type;
  if (!reactionTypes.includes(type)) throw new ApiError(400, 'type must be one of: like, love, celebrate, clap, wow');
  const { data: existing, error: findError } = await supabaseAdmin.from('clubhouse_reactions').select('id,type').eq('article_id', article.id).eq('author_id', req.user.id).maybeSingle();
  if (findError) throw dbError(findError);
  let action;
  if (existing?.type === type) {
    const { error } = await supabaseAdmin.from('clubhouse_reactions').delete().eq('id', existing.id);
    if (error) throw dbError(error);
    action = 'removed';
  } else if (existing) {
    const { error } = await supabaseAdmin.from('clubhouse_reactions').update({ type }).eq('id', existing.id);
    if (error) throw dbError(error);
    action = 'changed';
  } else {
    const { error } = await supabaseAdmin.from('clubhouse_reactions').insert({ article_id: article.id, author_id: req.user.id, type });
    if (error) throw dbError(error);
    action = 'added';
  }
  const { data, error } = await supabaseAdmin.from('clubhouse_reactions').select('type,author_id').eq('article_id', article.id);
  if (error) throw dbError(error);
  const reactions = Object.fromEntries(reactionTypes.map((item) => [item, 0]));
  for (const row of data) reactions[row.type]++;
  res.json({ success: true, data: { action, reactions, reactions_total: data.length, my_reaction: data.find((r) => r.author_id === req.user.id)?.type || null } });
});
