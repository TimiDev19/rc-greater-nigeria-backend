const v = require('../utils/validators');

module.exports = {
  table: 'bulletins',
  label: 'Bulletin',
  schemaName: 'Bulletin',
  tag: 'Bulletins',
  basePath: '/api/bulletins',
  plural: 'bulletins',
  targetType: 'bulletin', // enables comments + reactions
  searchColumn: 'title',
  orderBy: [{ column: 'created_at', ascending: false }],
  fields: [
    { name: 'title', required: true, validate: v.text({ min: 2, max: 200 }), doc: { type: 'string', example: 'October 2025 Club Bulletin' } },
  ],
  files: [
    {
      name: 'image',
      kind: 'image',
      required: true,
      urlColumn: 'image_url',
      pathColumn: 'image_path',
      folder: 'bulletins/images',
      doc: 'Bulletin cover picture (JPEG, PNG or WebP, max 5MB)',
    },
    {
      name: 'pdf',
      kind: 'pdf',
      required: true,
      urlColumn: 'pdf_url',
      pathColumn: 'pdf_path',
      folder: 'bulletins/pdfs',
      doc: 'Bulletin document (PDF, max 20MB)',
    },
  ],
};
