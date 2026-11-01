const v = require('../utils/validators');

module.exports = {
  table: 'projects',
  label: 'Project',
  schemaName: 'Project',
  tag: 'Projects',
  basePath: '/api/projects',
  plural: 'projects',
  targetType: 'project', // enables comments + reactions
  searchColumn: 'title',
  orderBy: [
    { column: 'date', ascending: false },
    { column: 'created_at', ascending: false },
  ],
  fields: [
    { name: 'title', required: true, validate: v.text({ min: 2, max: 200 }), doc: { type: 'string', example: 'Community Borehole Project' } },
    { name: 'date', required: true, validate: v.date(), doc: { type: 'string', format: 'date', example: '2025-03-14' } },
    {
      name: 'description',
      required: true,
      validate: v.text({ min: 2, max: 1000 }),
      doc: { type: 'string', example: 'We drilled a solar-powered borehole serving over 500 residents.' },
    },
  ],
  files: [
    {
      name: 'image',
      kind: 'image',
      required: true,
      urlColumn: 'image_url',
      pathColumn: 'image_path',
      folder: 'projects',
      doc: 'Project picture (JPEG, PNG or WebP, max 5MB)',
    },
  ],
};
