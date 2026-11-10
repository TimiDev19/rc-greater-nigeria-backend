const { supabaseAdmin } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const dbError = require('../utils/dbError');
const { isUuid, text, date, rotaryYear } = require('../utils/validators');
const { parsePagination, buildMeta, escapeLike, fetchPage } = require('../utils/pagination');
const duesReceipt = require('../services/duesReceipt');

const TABLE = 'dues_receipts';
const FIELDS = {
  receipt_date: date(),
  rotarian_name: text({ min: 2, max: 160 }),
  amount_paid: text({ max: 80 }),
  rotary_year: rotaryYear(),
  president_name: text({ max: 160 }),
  secretary_name: text({ max: 160 }),
};

const shape = (row) => ({
  id: row.id,
  receipt_date: row.receipt_date,
  rotarian_name: row.rotarian_name,
  amount_paid: row.amount_paid,
  rotary_year: row.rotary_year,
  president_name: row.president_name,
  secretary_name: row.secretary_name,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const parseFields = (body, partial) => {
  const values = {};
  const errors = {};
  Object.entries(FIELDS).forEach(([name, validate]) => {
    const raw = body[name];
    if (raw === undefined || raw === null || raw === '') {
      if (!partial) errors[name] = 'is required';
      return;
    }
    try { values[name] = validate(raw); } catch (e) { errors[name] = e.message; }
  });
  if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  return values;
};

const findReceipt = async (id) => {
  if (!isUuid(id)) throw new ApiError(400, 'Invalid id: must be a UUID');
  const { data, error } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, 'Dues receipt not found');
  return data;
};

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query, { defaultLimit: 20 });
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const build = () => {
    let query = supabaseAdmin.from(TABLE).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.ilike('rotarian_name', `%${escapeLike(search)}%`);
    if (req.query.rotary_year) query = query.eq('rotary_year', req.query.rotary_year);
    return query;
  };
  const { data, count } = await fetchPage(build, from, to);
  res.json({ success: true, data: data.map(shape), meta: buildMeta(page, limit, count) });
});

exports.getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: shape(await findReceipt(req.params.id)) });
});

exports.create = asyncHandler(async (req, res) => {
  const values = parseFields(req.body || {}, false);
  const { data, error } = await supabaseAdmin.from(TABLE)
    .insert({ ...values, created_by: req.user.id })
    .select('*').single();
  if (error) throw dbError(error);
  res.status(201).json({ success: true, data: shape(data) });
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await findReceipt(req.params.id);
  const values = parseFields(req.body || {}, true);
  if (!Object.keys(values).length) throw new ApiError(400, 'No valid fields provided to update');
  const { data, error } = await supabaseAdmin.from(TABLE).update(values)
    .eq('id', existing.id).select('*').single();
  if (error) throw dbError(error);
  res.json({ success: true, data: shape(data) });
});

exports.remove = asyncHandler(async (req, res) => {
  const existing = await findReceipt(req.params.id);
  const { error } = await supabaseAdmin.from(TABLE).delete().eq('id', existing.id);
  if (error) throw dbError(error);
  res.json({ success: true, message: 'Dues receipt deleted successfully' });
});

exports.downloadPdf = asyncHandler(async (req, res) => {
  const row = await findReceipt(req.params.id);
  const pdf = await duesReceipt.generateDuesReceipt(row);
  const safeName = row.rotarian_name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'rotarian';
  const safeYear = row.rotary_year.replace('/', '-');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `attachment; filename="dues-receipt-${safeName}-${safeYear}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(pdf);
});
