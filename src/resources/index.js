// To add a new resource: create a config like the others, add it here, and add its table to supabase/schema.sql.
// Routes and Swagger docs are generated from these configs automatically.
module.exports = [
  require('./projects'),
  require('./bulletins'),
  require('./clubOfficers'),
  require('./pastPresidents'),
];
