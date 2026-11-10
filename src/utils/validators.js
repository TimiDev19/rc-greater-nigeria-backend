// Each validator takes a raw value and returns the cleaned value, or throws Error(message).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR_RE = /^[A-Za-z0-9_-]{8,100}$/;

const text = ({ min = 1, max = 255 } = {}) => (value) => {
  if (typeof value !== 'string') throw new Error('must be a string');
  const s = value.trim();
  if (s.length < min) throw new Error(min <= 1 ? 'cannot be empty' : `must be at least ${min} characters`);
  if (s.length > max) throw new Error(`must be at most ${max} characters`);
  return s;
};

const date = () => (value) => {
  const s = typeof value === 'string' ? value.trim() : '';
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new Error('must be a valid date in YYYY-MM-DD format');
  }
  return s;
};

const integer = ({ min = -Infinity, max = Infinity } = {}) => (value) => {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) throw new Error('must be a whole number');
  if (n < min || n > max) throw new Error(`must be between ${min} and ${max}`);
  return n;
};

// "2019", "2019/2020" or "2019-2020"
const yearServed = () => (value) => {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}([/-]\d{2,4})?$/.test(s)) {
    throw new Error('must look like 2019, 2019/2020 or 2019-2020');
  }
  return s;
};

const rotaryYear = () => (value) => {
  const s = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})\/(\d{2})$/.exec(s);
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) {
    throw new Error('must be a Rotary year like 2026/27');
  }
  return s;
};

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isVisitorId = (v) => typeof v === 'string' && VISITOR_RE.test(v);

module.exports = { text, date, integer, yearServed, rotaryYear, isUuid, isVisitorId };
