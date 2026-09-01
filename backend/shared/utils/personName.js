/**
 * Server-side validation for a person's name.
 *
 * This is the authoritative copy. The consumer app validates the same way in
 * `frontend/src/lib/utils/personName.js`, but that is a convenience for the person
 * typing - it can be skipped entirely by calling the API directly, so anything that
 * actually matters has to be checked here.
 *
 * It exists because customers were putting MESSAGES in the name field. Real orders
 * went out under "Please cancel my order" and "Order chesta bill pay cheyava", and
 * that text travelled to the restaurant and the rider as the customer's name. They
 * were not being difficult: there was no reachable way to ask for help from an
 * order, so the name box was the only free-text field they could find.
 *
 * The rules are deliberately loose, because a name is not a format. Single names,
 * initials, particles and non-Latin scripts are all ordinary here. Rejecting a real
 * customer's name is worse than letting a message through, so every rule below
 * fails open when unsure.
 */

const ALLOWED_NAME_CHARACTERS = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;

const MAX_NAME_WORDS = 5;
const MAX_NAME_LENGTH = 60;
const MIN_NAME_LENGTH = 2;

// Any one of these is fine on its own - "Bill" is a name, "Payal" contains "pay" -
// so they only count against input that is already sentence-shaped, and they are
// matched as whole words.
const REQUEST_WORDS = [
  'please', 'cancel', 'cancelled', 'refund', 'urgent', 'complaint', 'complain',
  'deliver', 'delivery', 'delivered', 'contact', 'call', 'help', 'payment',
  'paid', 'money', 'wrong', 'missing', 'late', 'return', 'replace', 'order',
  'sorry', 'want', 'need', 'send', 'give', 'change',
];

const REQUEST_WORD_RE = new RegExp(`(^|\\s)(${REQUEST_WORDS.join('|')})(\\s|$)`, 'iu');

const MESSAGE_HINT =
  'That looks like a message rather than a name. To tell us about an order, use Need help with this order.';

export const countNameWords = (value) =>
  String(value || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * @returns {{ valid: boolean, error: string }} error is '' when valid.
 */
export const validatePersonName = (value, { required = true, label = 'Name' } = {}) => {
  const text = String(value ?? '').trim();

  if (!text) {
    return required
      ? { valid: false, error: `${label} is required` }
      : { valid: true, error: '' };
  }

  if (text.length < MIN_NAME_LENGTH) {
    return { valid: false, error: `${label} is too short` };
  }

  if (text.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `${label} is too long` };
  }

  if (!ALLOWED_NAME_CHARACTERS.test(text)) {
    return { valid: false, error: `${label} can only contain letters. ${MESSAGE_HINT}` };
  }

  const words = countNameWords(text);

  if (words > MAX_NAME_WORDS) {
    return { valid: false, error: MESSAGE_HINT };
  }

  // Sentence-shaped AND asking for something. Two-word names are left alone so a
  // real name containing one of these words still passes.
  if (words >= 3 && REQUEST_WORD_RE.test(text)) {
    return { valid: false, error: MESSAGE_HINT };
  }

  return { valid: true, error: '' };
};

export default validatePersonName;
