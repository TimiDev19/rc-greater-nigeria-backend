const v = require('../utils/validators');

module.exports = {
  table: 'club_officers',
  label: 'Club officer',
  schemaName: 'ClubOfficer',
  tag: 'Club Officers',
  basePath: '/api/club-officers',
  plural: 'club officers',
  searchColumn: 'full_name',
  // display_order lets the admin control how officers appear (President first, etc.)
  orderBy: [
    { column: 'display_order', ascending: true },
    { column: 'created_at', ascending: true },
  ],
  fields: [
    { name: 'full_name', required: true, validate: v.text({ min: 2, max: 120 }), doc: { type: 'string', example: 'Adaeze Okonkwo' } },
    { name: 'position', required: true, validate: v.text({ min: 2, max: 120 }), doc: { type: 'string', example: 'President' } },
    {
      name: 'display_order',
      required: false,
      validate: v.integer({ min: 0, max: 1000 }),
      doc: { type: 'integer', minimum: 0, maximum: 1000, default: 0, description: 'Sort position, lowest first', example: 1 },
    },
  ],
  files: [
    {
      name: 'image',
      kind: 'image',
      required: true,
      urlColumn: 'image_url',
      pathColumn: 'image_path',
      folder: 'club-officers',
      doc: 'Officer picture (JPEG, PNG or WebP, max 5MB)',
    },
  ],
};
