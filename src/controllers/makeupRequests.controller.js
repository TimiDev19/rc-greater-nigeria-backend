const { supabaseAdmin } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const dbError = require('../utils/dbError');
const { isUuid, text } = require('../utils/validators');
const { parsePagination, buildMeta, fetchPage } = require('../utils/pagination');
const makeupCard = require('../services/makeupCard');

const TABLE = 'makeup_requests';
const BUCKET = 'makeup-cards';
const displayDate = (date) => {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
};
const lagosDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const findRequest = async (id) => {
  if (!isUuid(id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data, error } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, 'Make-up request not found');
  return data;
};
const shape = (row) => ({
  id: row.id,
  visitor_name: row.visitor_name,
  host_club: row.host_club,
  request_date: row.request_date,
  request_date_display: displayDate(row.request_date),
  status: row.status,
  president_name: row.president_name,
  rejection_note: row.rejection_note,
  reviewed_at: row.reviewed_at,
  reviewed_by: row.reviewed_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
  card_available: row.card_path !== null,
});

exports.create = asyncHandler(async (req, res) => {
  const errors = {};
  let visitorName;
  let hostClub;
  try { visitorName = text({ max: 160 })(req.body?.visitor_name); } catch (e) { errors.visitor_name = e.message; }
  try { hostClub = text({ max: 160 })(req.body?.host_club); } catch (e) { errors.host_club = e.message; }
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);

  // Date is assigned by the API in the club's local timezone; clients cannot backdate it.
  const { data, error } = await supabaseAdmin.from(TABLE)
    .insert({ visitor_name: visitorName, host_club: hostClub, request_date: lagosDate() })
    .select('*').single();
  if (error) throw dbError(error);
  res.status(201).json({ success: true, data: shape(data) });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });
  const status = req.query.status;
  if (status !== undefined && !['pending', 'approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'status must be pending, approved, or rejected');
  }
  const build = () => {
    let q = supabaseAdmin.from(TABLE).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return q;
  };
  const { data, count } = await fetchPage(build, from, to);
  res.json({ success: true, data: data.map(shape), meta: buildMeta(page, limit, count) });
});

exports.getOne = asyncHandler(async (req, res) => res.json({ success: true, data: shape(await findRequest(req.params.id)) }));

exports.approve = asyncHandler(async (req, res) => {
  const existing = await findRequest(req.params.id);
  if (existing.status !== 'pending') throw new ApiError(409, `Request is already ${existing.status}`);
  let presidentName;
  try { presidentName = text({ max: 160 })(req.body?.president_name); } catch (e) {
    throw new ApiError(400, 'Validation failed', { president_name: e.message });
  }

  const pdf = await makeupCard.generateMakeupCard({
    visitorName: existing.visitor_name,
    hostClub: existing.host_club,
    requestDate: existing.request_date,
    presidentName,
  });
  const cardPath = `${existing.id}/${Date.now()}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(cardPath, pdf, {
    contentType: 'application/pdf', cacheControl: 'private, max-age=0', upsert: false,
  });
  if (uploadError) throw new ApiError(500, `Could not save generated card: ${uploadError.message}`);

  const { data, error } = await supabaseAdmin.from(TABLE).update({
    status: 'approved', president_name: presidentName, card_path: cardPath,
    reviewed_at: new Date().toISOString(), reviewed_by: req.user.id, rejection_note: null,
  }).eq('id', existing.id).eq('status', 'pending').select('*').maybeSingle();
  if (error || !data) {
    await supabaseAdmin.storage.from(BUCKET).remove([cardPath]);
    if (error) throw dbError(error);
    throw new ApiError(409, 'Request status changed while it was being reviewed');
  }
  res.json({ success: true, data: shape(data) });
});

exports.reject = asyncHandler(async (req, res) => {
  const existing = await findRequest(req.params.id);
  if (existing.status !== 'pending') throw new ApiError(409, `Request is already ${existing.status}`);
  let rejectionNote = null;
  if (req.body?.rejection_note !== undefined && req.body.rejection_note !== '') {
    try { rejectionNote = text({ max: 1000 })(req.body.rejection_note); } catch (e) {
      throw new ApiError(400, 'Validation failed', { rejection_note: e.message });
    }
  }
  const { data, error } = await supabaseAdmin.from(TABLE).update({
    status: 'rejected', rejection_note: rejectionNote,
    reviewed_at: new Date().toISOString(), reviewed_by: req.user.id,
  }).eq('id', existing.id).eq('status', 'pending').select('*').maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(409, 'Request status changed while it was being reviewed');
  res.json({ success: true, data: shape(data) });
});

exports.downloadCard = asyncHandler(async (req, res) => {
  const row = await findRequest(req.params.id);
  if (row.status !== 'approved' || !row.card_path) throw new ApiError(404, 'Approved card not found');
  // Re-render on download so cards approved before a layout/font fix are refreshed too.
  const buffer = await makeupCard.generateMakeupCard({
    visitorName: row.visitor_name,
    hostClub: row.host_club,
    requestDate: row.request_date,
    presidentName: row.president_name,
  });
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(row.card_path, buffer, {
    contentType: 'application/pdf', cacheControl: 'private, max-age=0', upsert: true,
  });
  if (error) throw new ApiError(500, 'Could not refresh generated card');
  const safeName = row.visitor_name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'visitor';
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="makeup-card-${safeName}-${row.request_date}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
});
