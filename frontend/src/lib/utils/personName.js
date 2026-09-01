/**
 * Validation for a person's name typed by a customer.
 *
 * Customers were putting MESSAGES in the name field - real orders went out under
 * "Please cancel my order" and "Order chesta bill pay cheyava". They were not
 * misusing the form for fun: there was no reachable way to ask for help from an
 * order, so the name box was the only free-text field they could find, and the
 * message travelled to the restaurant and the rider as the customer's name.
 *
 * The rules are deliberately loose, because a name is not a format. Single names,
 * initials, particles and apostrophes are all ordinary here - "Rocky",
 * "M. Ravi Kumar", "D'Souza", "Sri Lakshmi Narayana Reddy" must all pass. Only
 * two things are rejected: input that cannot be a name at all (digits, sentence
 * punctuation), and input that reads as a sentence addressed to staff.
 *
 * Rejecting a real name is worse than letting a message through, so every rule
 * below is chosen to fail open when unsure.
 */

// Letters (any script, so Telugu and Hindi names are fine), spaces, and the
// punctuation that genuinely appears in names.
const ALLOWED_NAME_CHARACTERS = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u

// A name is short. Five words is already generous for this market.
const MAX_NAME_WORDS = 5
const MAX_NAME_LENGTH = 60
const MIN_NAME_LENGTH = 2

// Words that turn a phrase into a request. Any of these alone is fine - "Bill" is
// a name, "Payal" contains "pay" - so they only count against input that is
// already sentence-shaped, and they are matched as whole words.
const REQUEST_WORDS = [
  'please', 'cancel', 'cancelled', 'refund', 'urgent', 'complaint', 'complain',
  'deliver', 'delivery', 'delivered', 'contact', 'call', 'help', 'payment',
  'paid', 'money', 'wrong', 'missing', 'late', 'return', 'replace', 'order',
  'sorry', 'want', 'need', 'send', 'give', 'change',
]

const REQUEST_WORD_RE = new RegExp(`(^|\\s)(${REQUEST_WORDS.join('|')})(\\s|$)`, 'iu')

export const countNameWords = (value) =>
  String(value || '').trim().split(/\s+/).filter(Boolean).length

/**
 * @returns {{ valid: boolean, error: string }} error is "" when valid.
 */
export const validatePersonName = (value, { required = true, label = 'Name' } = {}) => {
  const text = String(value ?? '').trim()

  if (!text) {
    return required
      ? { valid: false, error: `${label} is required` }
      : { valid: true, error: '' }
  }

  if (text.length < MIN_NAME_LENGTH) {
    return { valid: false, error: `${label} is too short` }
  }

  if (text.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `${label} is too long` }
  }

  // Digits and sentence punctuation (?, !, comma, colon...) cannot be part of a
  // name, and are the clearest sign the box is being used for something else.
  if (!ALLOWED_NAME_CHARACTERS.test(text)) {
    return {
      valid: false,
      error: `${label} can only contain letters. To tell us something about your order, use Need help with this order.`,
    }
  }

  const words = countNameWords(text)

  if (words > MAX_NAME_WORDS) {
    return {
      valid: false,
      error: `That looks like a message rather than a name. To tell us something about your order, use Need help with this order.`,
    }
  }

  // Sentence-shaped AND asking for something. Two words are left alone so real
  // names that happen to contain one of these words still pass.
  if (words >= 3 && REQUEST_WORD_RE.test(text)) {
    return {
      valid: false,
      error: `That looks like a message rather than a name. To tell us something about your order, use Need help with this order.`,
    }
  }

  return { valid: true, error: '' }
}

export default validatePersonName
