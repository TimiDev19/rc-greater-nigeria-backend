/**
 * Builds list / getOne / create / update / remove handlers for a resource from its config
 * (see src/resources/*.js). Handles validation, file uploads to Supabase Storage,
 * cleanup of orphaned files, and (optionally) comment/reaction counts.
 */
const { supabaseAdmin } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const dbError = require('../utils/dbError');
const { isUuid } = require('../utils/validators');
const { parsePagination, buildMeta, escapeLike, fetchPage } = require('../utils/pagination');
const storage = require('../services/storage');
const engagement = require('../services/engagement');

module.exports = function createCrud(cfg) {
  const { table, label, fields, files: fileCfgs, targetType } = cfg;

  // Public shape of a row: storage paths are internal and never exposed.
  const serialize = (row, summary) => {
    const out = { id: row.id };
    fields.forEach((f) => { out[f.name] = row[f.name]; });
    fileCfgs.forEach((f) => { out[f.urlColumn] = row[f.urlColumn]; });
    out.created_at = row.created_at;
    out.updated_at = row.updated_at;
    if (targetType) Object.assign(out, summary || engagement.emptySummary());
    return out;
  };

  const assertId = (id) => {
    if (!isUuid(id)) throw new ApiError(400, 'Invalid id: must be a UUID');
    return id;
  };

  const findById = async (id) => {
    assertId(id);
    const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, `${label} not found`);
    return data;
  };

  // Validates text fields. `partial` = update mode (only provided fields are checked).
  const parseFields = (body, partial) => {
    const values = {};
    const errors = {};
    fields.forEach((f) => {
      const raw = body[f.name];
      if (raw === undefined || raw === null || raw === '') {
        if (!partial && f.required) errors[f.name] = 'is required';
        return;
      }
      try {
        values[f.name] = f.validate(raw);
      } catch (e) {
        errors[f.name] = e.message;
      }
    });
    return { values, errors };
  };

  const checkFiles = (uploaded, errors, partial) => {
    fileCfgs.forEach((f) => {
      const file = uploaded[f.name] && uploaded[f.name][0];
      if (!file) {
        if (!partial && f.required) errors[f.name] = 'file is required';
        return;
      }
      try {
        storage.validateFile(file, f.kind);
      } catch (e) {
        errors[f.name] = e.message;
      }
    });
  };

  const throwIfErrors = (errors) => {
    if (Object.keys(errors).length) throw new ApiError(400, 'Validation failed', errors);
  };

  // Uploads any provided files; returns the columns to save and the new paths (for rollback).
  const uploadAll = async (uploaded) => {
    const columns = {};
    const paths = [];
    try {
      for (const f of fileCfgs) {
        const file = uploaded[f.name] && uploaded[f.name][0];
        if (!file) continue;
        const result = await storage.uploadFile(file, f.kind, f.folder);
        paths.push(result.path);
        columns[f.urlColumn] = result.url;
        columns[f.pathColumn] = result.path;
      }
    } catch (err) {
      await storage.removeFiles(paths);
      throw err;
    }
    return { columns, paths };
  };

  const list = asyncHandler(async (req, res) => {
    const { page, limit, from, to } = parsePagination(req.query);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';

    const build = () => {
      let q = supabaseAdmin.from(table).select('*', { count: 'exact' });
      if (search && cfg.searchColumn) q = q.ilike(cfg.searchColumn, `%${escapeLike(search)}%`);
      cfg.orderBy.forEach((o) => { q = q.order(o.column, { ascending: o.ascending }); });
      return q;
    };

    const { data, count } = await fetchPage(build, from, to);
    const summaries = targetType ? await engagement.getSummaries(targetType, data.map((r) => r.id)) : null;

    res.json({
      success: true,
      data: data.map((row) => serialize(row, summaries && summaries.get(row.id))),
      meta: buildMeta(page, limit, count),
    });
  });

  const getOne = asyncHandler(async (req, res) => {
    const row = await findById(req.params.id);
    const summary = targetType ? (await engagement.getSummaries(targetType, [row.id])).get(row.id) : null;
    res.json({ success: true, data: serialize(row, summary) });
  });

  const create = asyncHandler(async (req, res) => {
    const uploaded = req.files || {};
    const { values, errors } = parseFields(req.body || {}, false);
    checkFiles(uploaded, errors, false);
    throwIfErrors(errors);

    const { columns, paths } = await uploadAll(uploaded);

    const { data, error } = await supabaseAdmin
      .from(table)
      .insert({ ...values, ...columns })
      .select()
      .single();
    if (error) {
      await storage.removeFiles(paths); // don't leave orphaned files behind
      throw dbError(error);
    }

    res.status(201).json({ success: true, data: serialize(data) });
  });

  const update = asyncHandler(async (req, res) => {
    const existing = await findById(req.params.id);
    const uploaded = req.files || {};
    const { values, errors } = parseFields(req.body || {}, true);
    checkFiles(uploaded, errors, true);
    throwIfErrors(errors);

    const hasNewFiles = fileCfgs.some((f) => uploaded[f.name] && uploaded[f.name][0]);
    if (!Object.keys(values).length && !hasNewFiles) {
      throw new ApiError(400, 'No valid fields provided to update');
    }

    const { columns, paths } = await uploadAll(uploaded);

    const { data, error } = await supabaseAdmin
      .from(table)
      .update({ ...values, ...columns })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      await storage.removeFiles(paths);
      if (error.code === 'PGRST116') throw new ApiError(404, `${label} not found`);
      throw dbError(error);
    }

    // Row now points at the new files, so the replaced ones can go.
    const replaced = fileCfgs.filter((f) => columns[f.pathColumn]).map((f) => existing[f.pathColumn]);
    await storage.removeFiles(replaced);

    const summary = targetType ? (await engagement.getSummaries(targetType, [data.id])).get(data.id) : null;
    res.json({ success: true, data: serialize(data, summary) });
  });

  const remove = asyncHandler(async (req, res) => {
    const existing = await findById(req.params.id);

    const { error } = await supabaseAdmin.from(table).delete().eq('id', existing.id);
    if (error) throw dbError(error);

    if (targetType) await engagement.deleteForTarget(targetType, existing.id);
    await storage.removeFiles(fileCfgs.map((f) => existing[f.pathColumn]));

    res.json({ success: true, message: `${label} deleted successfully` });
  });

  return { list, getOne, create, update, remove };
};
