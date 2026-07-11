export const escapeRegex = (value = '') => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const buildSafeRegex = (value = '', flags = 'i') => {
  return new RegExp(escapeRegex(value), flags);
};

export default {
  escapeRegex,
  buildSafeRegex,
};
