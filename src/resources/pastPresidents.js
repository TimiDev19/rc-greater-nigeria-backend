const v = require('../utils/validators');

module.exports = {
  table: 'past_presidents',
  label: 'Past president',
  schemaName: 'PastPresident',
  tag: 'Past Presidents',
  basePath: '/api/past-presidents',
  plural: 'past presidents',
  searchColumn: 'full_name',
  orderBy: [
    { column: 'year_served', ascending: false },
    { column: 'created_at', ascending: false },
  ],
  fields: [
    { name: 'full_name', required: true, validate: v.text({ min: 2, max: 120 }), doc: { type: 'string', example: 'Chief Emeka Nwosu' } },
    {
      name: 'year_served',
      required: true,
      validate: v.yearServed(),
      doc: { type: 'string', description: 'A year (2019) or a range (2019/2020 or 2019-2020)', example: '2019/2020' },
    },
  ],
  files: [
    {
      name: 'image',
      kind: 'image',
      required: true,
      urlColumn: 'image_url',
      pathColumn: 'image_path',
      folder: 'past-presidents',
      doc: 'Past president picture (JPEG, PNG or WebP, max 5MB)',
    },
  ],
};
