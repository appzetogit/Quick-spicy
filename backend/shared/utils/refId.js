/**
 * Get the id out of a Mongoose reference that may or may not be populated.
 *
 * `Order.restaurantId` is declared `String` (it holds a Mongo _id as text) but it
 * carries `ref: 'Restaurant'`, so a query that populates it hands back the whole
 * restaurant document while a query that does not hands back the bare string. Both
 * shapes are normal and both reach the same helpers.
 *
 * The trap is `String(value)`: on a populated document that yields the literal
 * "[object Object]", which then silently fails every lookup it is used in. This
 * turns either shape into the id.
 */
export const toRefId = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    // populated document, or a raw ObjectId
    if (value._id !== undefined && value._id !== null) return String(value._id).trim();
    return String(value).trim();
  }
  return String(value).trim();
};

export default toRefId;
