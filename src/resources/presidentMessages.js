const v = require('../utils/validators');

module.exports = {
  table: 'president_messages',
  label: "President's message",
  schemaName: 'PresidentMessage',
  tag: "President's Message",
  basePath: '/api/president-messages',
  plural: "president's messages",
  searchColumn: 'president_name',
  orderBy: [
    { column: 'year_served', ascending: false },
    { column: 'created_at', ascending: false },
  ],
  fields: [
    { name: 'president_name', required: true, validate: v.text({ min: 2, max: 120 }), doc: { type: 'string', example: 'Rotarian Adaeze Okonkwo' } },
    {
      name: 'year_served',
      required: true,
      validate: v.yearServed(),
      doc: { type: 'string', description: 'Presidential year, e.g. 2026/27, 2026/2027, or 2026', example: '2026/27' },
    },
    { name: 'message', required: true, validate: v.text({ min: 2, max: 10000 }), doc: { type: 'string', maxLength: 10000, example: 'A message from the club president to members and visitors.' } },
  ],
  files: [
    {
      name: 'image',
      kind: 'image',
      required: true,
      urlColumn: 'image_url',
      pathColumn: 'image_path',
      folder: 'president-messages',
      doc: 'President portrait (JPEG, PNG or WebP, max 5MB)',
    },
  ],
};
