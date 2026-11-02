/**
 * Generates OpenAPI paths and schemas from the resource configs in src/resources,
 * so Swagger UI always matches what the routes actually accept.
 */
const { REACTION_TYPES } = require('../config/constants');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const ok = (description, schema) => ({ description, content: json(schema) });
const err = (description) => ({ description, content: json(ref('Error')) });
const bearer = [{ bearerAuth: [] }];

const envelope = (data, extra = {}) => ({
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, data, ...extra },
});
const message = (example) => ({
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example } },
});

const idParam = { name: 'id', in: 'path', required: true, description: 'UUID', schema: { type: 'string', format: 'uuid' } };
const pageParams = (defaultLimit = 10) => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: defaultLimit } },
];

const authErrors = {
  401: err('Missing, invalid or expired token'),
  403: err('Authenticated, but not an admin'),
};

// ---------------------------------------------------------------- schemas
const entitySchema = (cfg) => {
  const properties = { id: { type: 'string', format: 'uuid' } };
  cfg.fields.forEach((f) => { properties[f.name] = { ...f.doc }; });
  cfg.files.forEach((f) => {
    properties[f.urlColumn] = {
      type: 'string',
      format: 'uri',
      description: `Public URL. ${f.doc}`,
      example: `https://<project>.supabase.co/storage/v1/object/public/media/${f.folder}/<file>`,
    };
  });
  properties.created_at = { type: 'string', format: 'date-time' };
  properties.updated_at = { type: 'string', format: 'date-time' };
  if (cfg.targetType) {
    properties.comments_count = { type: 'integer', example: 4 };
    properties.reactions = ref('ReactionCounts');
    properties.reactions_total = { type: 'integer', example: 12 };
  }
  return { type: 'object', properties };
};

const formSchema = (cfg, forCreate) => {
  const properties = {};
  const required = [];
  cfg.fields.forEach((f) => {
    properties[f.name] = { ...f.doc };
    if (forCreate && f.required) required.push(f.name);
  });
  cfg.files.forEach((f) => {
    properties[f.name] = { type: 'string', format: 'binary', description: f.doc };
    if (forCreate && f.required) required.push(f.name);
  });
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
};

const sharedSchemas = () => {
  const reactionProps = Object.fromEntries(REACTION_TYPES.map((t) => [t, { type: 'integer', example: 0 }]));
  return {
    Pagination: {
      type: 'object',
      properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 10 },
        total: { type: 'integer', example: 42 },
        total_pages: { type: 'integer', example: 5 },
      },
    },
    ReactionCounts: { type: 'object', description: 'Number of reactions of each type', properties: reactionProps },
    Comment: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        author_name: { type: 'string', example: 'Ngozi A.' },
        body: { type: 'string', example: 'Great work, team!' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
    AdminComment: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        target_type: { type: 'string', enum: ['project', 'bulletin'] },
        target_id: { type: 'string', format: 'uuid' },
        author_name: { type: 'string' },
        body: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
    CommentInput: {
      type: 'object',
      required: ['author_name', 'body'],
      properties: {
        author_name: { type: 'string', minLength: 1, maxLength: 80, example: 'Ngozi A.' },
        body: { type: 'string', minLength: 1, maxLength: 1000, example: 'Great work, team!' },
      },
    },
    ReactionInput: {
      type: 'object',
      required: ['type', 'visitor_id'],
      properties: {
        type: { type: 'string', enum: REACTION_TYPES, example: 'love' },
        visitor_id: {
          type: 'string',
          minLength: 8,
          maxLength: 100,
          pattern: '^[A-Za-z0-9_-]{8,100}$',
          description: 'Random ID generated once by the frontend and kept in localStorage (e.g. crypto.randomUUID()).',
          example: '5b9c1f3e-7a2d-4c8e-9f10-2d6a8b4e1c77',
        },
      },
    },
    ReactionState: {
      type: 'object',
      properties: {
        reactions: ref('ReactionCounts'),
        reactions_total: { type: 'integer', example: 12 },
        my_reaction: { type: 'string', nullable: true, enum: [...REACTION_TYPES, null], description: 'This visitor\'s reaction, or null' },
      },
    },
    ReactionResult: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['added', 'changed', 'removed'] },
        reactions: ref('ReactionCounts'),
        reactions_total: { type: 'integer' },
        my_reaction: { type: 'string', nullable: true },
      },
    },
  };
};

// ---------------------------------------------------------------- paths
const crudPaths = (cfg) => {
  const { tag, label, plural, schemaName, basePath } = cfg;
  const searchHint = cfg.searchColumn === 'title' ? 'title' : 'full name';
  const item = ref(schemaName);
  const paths = {};

  paths[basePath] = {
    get: {
      tags: [tag],
      summary: `List ${plural}`,
      description: `Public. Paginated, with optional case-insensitive search on ${searchHint}.`,
      parameters: [
        ...pageParams(),
        { name: 'search', in: 'query', description: `Filter by ${searchHint}`, schema: { type: 'string', maxLength: 100 } },
      ],
      responses: {
        200: ok('List of results', envelope({ type: 'array', items: item }, { meta: ref('Pagination') })),
      },
    },
    post: {
      tags: [tag],
      summary: `Create a ${label.toLowerCase()}`,
      description: 'Admin only. Send as `multipart/form-data` (needed for the file upload).',
      security: bearer,
      requestBody: { required: true, content: { 'multipart/form-data': { schema: formSchema(cfg, true) } } },
      responses: {
        201: ok('Created', envelope(item)),
        400: err('Validation failed (see `errors` for per-field messages)'),
        ...authErrors,
      },
    },
  };

  paths[`${basePath}/{id}`] = {
    get: {
      tags: [tag],
      summary: `Get one ${label.toLowerCase()}`,
      description: 'Public.',
      parameters: [idParam],
      responses: { 200: ok('Found', envelope(item)), 400: err('Invalid id'), 404: err('Not found') },
    },
    put: {
      tags: [tag],
      summary: `Update a ${label.toLowerCase()}`,
      description:
        'Admin only. Send only the fields you want to change. Upload a new file to replace the old one (the old file is deleted from storage). Accepts `multipart/form-data`; a text-only update may also be sent as JSON.',
      security: bearer,
      parameters: [idParam],
      requestBody: { required: true, content: { 'multipart/form-data': { schema: formSchema(cfg, false) } } },
      responses: {
        200: ok('Updated', envelope(item)),
        400: err('Validation failed or nothing to update'),
        404: err('Not found'),
        ...authErrors,
      },
    },
    delete: {
      tags: [tag],
      summary: `Delete a ${label.toLowerCase()}`,
      description: `Admin only. Also deletes its uploaded files${cfg.targetType ? ', comments and reactions' : ''}.`,
      security: bearer,
      parameters: [idParam],
      responses: {
        200: ok('Deleted', message(`${label} deleted successfully`)),
        404: err('Not found'),
        ...authErrors,
      },
    },
  };

  return paths;
};

const engagementPaths = (cfg) => {
  const { tag, label, basePath } = cfg;
  const lower = label.toLowerCase();

  return {
    [`${basePath}/{id}/comments`]: {
      get: {
        tags: [tag],
        summary: `List comments on a ${lower}`,
        description: 'Public. Newest first.',
        parameters: [idParam, ...pageParams(20)],
        responses: {
          200: ok('Comments', envelope({ type: 'array', items: ref('Comment') }, { meta: ref('Pagination') })),
          404: err('Not found'),
        },
      },
      post: {
        tags: [tag],
        summary: `Comment on a ${lower}`,
        description: 'Public (no login). Limited to 10 comments per 15 minutes per IP. Comment text is stored as plain text: escape it when rendering.',
        parameters: [idParam],
        requestBody: { required: true, content: json(ref('CommentInput')) },
        responses: {
          201: ok('Comment created', envelope(ref('Comment'))),
          400: err('Validation failed'),
          404: err('Not found'),
          429: err('Too many requests'),
        },
      },
    },
    [`${basePath}/{id}/reactions`]: {
      get: {
        tags: [tag],
        summary: `Get reaction counts for a ${lower}`,
        description: 'Public. Pass `visitor_id` to also learn which reaction this visitor has made.',
        parameters: [
          idParam,
          { name: 'visitor_id', in: 'query', required: false, schema: { type: 'string', minLength: 8, maxLength: 100 } },
        ],
        responses: { 200: ok('Reaction state', envelope(ref('ReactionState'))), 400: err('Invalid visitor_id'), 404: err('Not found') },
      },
      post: {
        tags: [tag],
        summary: `React to a ${lower} (toggle)`,
        description:
          'Public (no login). One reaction per visitor. Sending the same `type` again removes it; a different `type` switches it. Limited to 60 per 15 minutes per IP.',
        parameters: [idParam],
        requestBody: { required: true, content: json(ref('ReactionInput')) },
        responses: {
          200: ok('Reaction updated', envelope(ref('ReactionResult'))),
          400: err('Validation failed'),
          404: err('Not found'),
          429: err('Too many requests'),
        },
      },
    },
  };
};

const commentModerationPaths = () => ({
  '/api/comments': {
    get: {
      tags: ['Comments (Admin)'],
      summary: 'List all comments for moderation',
      description: 'Admin only. Optionally filter by the project or bulletin they belong to.',
      security: bearer,
      parameters: [
        ...pageParams(20),
        { name: 'target_type', in: 'query', schema: { type: 'string', enum: ['project', 'bulletin'] } },
        { name: 'target_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: ok('Comments', envelope({ type: 'array', items: ref('AdminComment') }, { meta: ref('Pagination') })),
        400: err('Invalid filter'),
        ...authErrors,
      },
    },
  },
  '/api/comments/{id}': {
    delete: {
      tags: ['Comments (Admin)'],
      summary: 'Delete a comment',
      description: 'Admin only.',
      security: bearer,
      parameters: [idParam],
      responses: { 200: ok('Deleted', message('Comment deleted successfully')), 404: err('Not found'), ...authErrors },
    },
  },
});

const clubhousePaths = () => {
  const auth = bearer;
  const clubhouseError = { 401: err('Missing, invalid or expired token'), 403: err('Insufficient role or resource ownership') };
  const article = { type: 'object', properties: {
    id: { type: 'string', format: 'uuid' }, title: { type: 'string' }, body: { type: 'string' },
    author_id: { type: 'string', format: 'uuid' }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
  } };
  const articleInput = { type: 'object', required: ['title', 'body'], properties: { title: { type: 'string', maxLength: 200 }, body: { type: 'string', maxLength: 50000 } } };
  const paths = {
    '/api/clubhouse/auth/login': { post: {
      tags: ['Clubhouse'], summary: 'Sign in as a clubhouse member',
      description: 'Authenticates member accounts only. Admin accounts should use POST /api/auth/login.',
      requestBody: { required: true, content: json({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } }) },
      responses: { 200: ok('Member session', envelope(ref('Session'))), 400: err('Missing credentials'), 401: err('Invalid member email or password') },
    } },
    '/api/clubhouse/members': {
      get: { tags: ['Clubhouse'], summary: 'List member accounts (admin)', security: auth, parameters: pageParams(), responses: { 200: ok('Paginated members', envelope({ type: 'array', items: ref('ClubhouseMember') }, { meta: ref('Pagination') })), ...clubhouseError } },
      post: { tags: ['Clubhouse'], summary: 'Create a member login (admin)', security: auth, requestBody: { required: true, content: json({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8, maxLength: 8 } } }) }, responses: { 201: ok('Member created', envelope(ref('ClubhouseMember'))), 400: err('Invalid input'), ...clubhouseError } },
    },
    '/api/clubhouse/members/{id}': {
      get: { tags: ['Clubhouse'], summary: 'Get a member login (admin)', security: auth, parameters: [idParam], responses: { 200: ok('Member', envelope(ref('ClubhouseMember'))), 404: err('Member not found'), ...clubhouseError } },
      put: { tags: ['Clubhouse'], summary: 'Update member email and/or password (admin)', security: auth, parameters: [idParam], requestBody: { required: true, content: json({ type: 'object', properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } } }) }, responses: { 200: ok('Updated', envelope(ref('ClubhouseMember'))), 400: err('Invalid input'), 404: err('Member not found'), ...clubhouseError } },
      delete: { tags: ['Clubhouse'], summary: 'Delete a member login (admin)', security: auth, parameters: [idParam], responses: { 200: ok('Deleted', message('Member deleted successfully')), 404: err('Member not found'), ...clubhouseError } },
    },
    '/api/clubhouse/profile': { get: { tags: ['Clubhouse'], summary: 'Get current clubhouse profile', security: auth, responses: { 200: ok('Profile; email is read-only to members', envelope(ref('ClubhouseMember'))), ...clubhouseError } } },
    '/api/clubhouse/profile/change-password': { post: { tags: ['Clubhouse'], summary: 'Change current user password', security: auth, requestBody: { required: true, content: json({ type: 'object', required: ['current_password', 'new_password'], properties: { current_password: { type: 'string' }, new_password: { type: 'string', minLength: 8 } } }) }, responses: { 200: ok('Password updated', message('Password updated successfully')), 400: err('Invalid input'), ...clubhouseError } } },
    '/api/clubhouse/articles': {
      get: { tags: ['Clubhouse'], summary: 'List clubhouse articles (members see all)', security: auth, parameters: [...pageParams(), { name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: ok('Articles', envelope({ type: 'array', items: article }, { meta: ref('Pagination') })), ...clubhouseError } },
      post: { tags: ['Clubhouse'], summary: 'Create clubhouse article', security: auth, requestBody: { required: true, content: json(articleInput) }, responses: { 201: ok('Created', envelope(article)), 400: err('Invalid input'), ...clubhouseError } },
    },
    '/api/clubhouse/articles/{id}': {
      get: { tags: ['Clubhouse'], summary: 'Get article', security: auth, parameters: [idParam], responses: { 200: ok('Article', envelope(article)), 404: err('Not found'), ...clubhouseError } },
      put: { tags: ['Clubhouse'], summary: 'Update own article or any article as admin', security: auth, parameters: [idParam], requestBody: { required: true, content: json({ type: 'object', properties: articleInput.properties }) }, responses: { 200: ok('Updated', envelope(article)), 400: err('Invalid input'), 404: err('Not found'), ...clubhouseError } },
      delete: { tags: ['Clubhouse'], summary: 'Delete own article or any article as admin', security: auth, parameters: [idParam], responses: { 200: ok('Deleted', message('Article deleted successfully')), 404: err('Not found'), ...clubhouseError } },
    },
    '/api/clubhouse/articles/{id}/comments': {
      get: { tags: ['Clubhouse'], summary: 'List article comments', security: auth, parameters: [idParam, ...pageParams(20)], responses: { 200: ok('Comments', envelope({ type: 'array', items: ref('ClubhouseComment') }, { meta: ref('Pagination') })), ...clubhouseError } },
      post: { tags: ['Clubhouse'], summary: 'Comment on article', security: auth, parameters: [idParam], requestBody: { required: true, content: json({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }) }, responses: { 201: ok('Created', envelope(ref('ClubhouseComment'))), 400: err('Invalid input'), ...clubhouseError } },
    },
    '/api/clubhouse/articles/{id}/comments/{commentId}': {
      put: { tags: ['Clubhouse'], summary: 'Edit own comment or any comment as admin', security: auth, parameters: [idParam, { name: 'commentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: json({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }) }, responses: { 200: ok('Updated', envelope(ref('ClubhouseComment'))), 404: err('Not found'), ...clubhouseError } },
      delete: { tags: ['Clubhouse'], summary: 'Delete own comment or any comment as admin', security: auth, parameters: [idParam, { name: 'commentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: ok('Deleted', message('Comment deleted successfully')), 404: err('Not found'), ...clubhouseError } },
    },
    '/api/clubhouse/articles/{id}/reactions': {
      get: { tags: ['Clubhouse'], summary: 'Get article reaction totals and own reaction', security: auth, parameters: [idParam], responses: { 200: ok('Reaction state', envelope(ref('ReactionState'))), ...clubhouseError } },
      post: { tags: ['Clubhouse'], summary: 'Toggle article reaction', security: auth, parameters: [idParam], requestBody: { required: true, content: json({ type: 'object', required: ['type'], properties: { type: { type: 'string', enum: REACTION_TYPES } } }) }, responses: { 200: ok('Reaction toggled', envelope(ref('ReactionResult'))), 400: err('Invalid type'), ...clubhouseError } },
    },
  };
  return paths;
};

const makeupRequestPaths = () => {
  const admin = bearer;
  const requestRef = ref('MakeupRequest');
  const publicInput = { type: 'object', required: ['visitor_name', 'host_club'], properties: {
    visitor_name: { type: 'string', minLength: 1, maxLength: 160, example: 'Amina Okafor' },
    host_club: { type: 'string', minLength: 1, maxLength: 160, example: 'Rotary Club of Lagos Mainland' },
  } };
  return {
    '/api/makeup-requests': {
      post: { tags: ['Make-Up Cards'], summary: 'Submit a public make-up card request', description: 'The API sets request_date to the current date in Africa/Lagos. Visitors do not submit the date, president name, or email address.', requestBody: { required: true, content: json(publicInput) }, responses: { 201: ok('Pending request submitted', envelope(requestRef)), 400: err('Validation failed'), 429: err('Submission rate limit reached') } },
      get: { tags: ['Make-Up Cards'], summary: 'List make-up requests (admin)', security: admin, parameters: [...pageParams(20), { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }], responses: { 200: ok('Requests', envelope({ type: 'array', items: requestRef }, { meta: ref('Pagination') })), 400: err('Invalid status filter'), ...authErrors } },
    },
    '/api/makeup-requests/{id}': {
      get: { tags: ['Make-Up Cards'], summary: 'Get make-up request details (admin)', security: admin, parameters: [idParam], responses: { 200: ok('Request', envelope(requestRef)), 404: err('Not found'), ...authErrors } },
    },
    '/api/makeup-requests/{id}/approve': {
      post: { tags: ['Make-Up Cards'], summary: 'Approve request and generate PDF (admin)', security: admin, parameters: [idParam], requestBody: { required: true, content: json({ type: 'object', required: ['president_name'], properties: { president_name: { type: 'string', maxLength: 160 } } }) }, responses: { 200: ok('Approved; PDF is ready to download', envelope(requestRef)), 400: err('Validation failed'), 404: err('Not found'), 409: err('Request already reviewed'), ...authErrors } },
    },
    '/api/makeup-requests/{id}/reject': {
      post: { tags: ['Make-Up Cards'], summary: 'Reject a pending request (admin)', security: admin, parameters: [idParam], requestBody: { content: json({ type: 'object', properties: { rejection_note: { type: 'string', maxLength: 1000 } } }) }, responses: { 200: ok('Rejected', envelope(requestRef)), 404: err('Not found'), 409: err('Request already reviewed'), ...authErrors } },
    },
    '/api/makeup-requests/{id}/card': {
      get: { tags: ['Make-Up Cards'], summary: 'Download approved PDF (admin)', security: admin, parameters: [idParam], responses: { 200: { description: 'Generated make-up card PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, 404: err('Approved card not found'), ...authErrors } },
    },
  };
};

const buildDocs = (resources) => {
  const paths = {};
  const schemas = sharedSchemas();

  schemas.ClubhouseMember = { type: 'object', properties: {
    id: { type: 'string', format: 'uuid' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['admin', 'member'] }, created_at: { type: 'string', format: 'date-time' },
  } };
  schemas.ClubhouseComment = { type: 'object', properties: {
    id: { type: 'string', format: 'uuid' }, article_id: { type: 'string', format: 'uuid' }, author_id: { type: 'string', format: 'uuid' }, body: { type: 'string' }, created_at: { type: 'string', format: 'date-time' },
  } };
  schemas.MakeupRequest = { type: 'object', properties: {
    id: { type: 'string', format: 'uuid' }, visitor_name: { type: 'string' }, host_club: { type: 'string' },
    request_date: { type: 'string', format: 'date', example: '2026-11-02' }, request_date_display: { type: 'string', example: '02/11/2026', description: 'Formatted as DD/MM/YYYY for the card' },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected'] }, president_name: { type: 'string', nullable: true },
    rejection_note: { type: 'string', nullable: true }, card_available: { type: 'boolean' }, reviewed_at: { type: 'string', format: 'date-time', nullable: true },
    reviewed_by: { type: 'string', format: 'uuid', nullable: true }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' },
  } };

  resources.forEach((cfg) => {
    schemas[cfg.schemaName] = entitySchema(cfg);
    Object.assign(paths, crudPaths(cfg));
    if (cfg.targetType) Object.assign(paths, engagementPaths(cfg));
  });
  Object.assign(paths, commentModerationPaths());
  Object.assign(paths, clubhousePaths());
  Object.assign(paths, makeupRequestPaths());

  return { paths, schemas };
};

module.exports = { buildDocs };
