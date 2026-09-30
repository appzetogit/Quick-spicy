import { forwardRef, useLayoutEffect, useRef } from "react"
import { Input } from "@/components/ui/input"

/**
 * Phone number field that cannot lose the caret.
 *
 * In the Android app's WebView the caret of a controlled input was being put back at the
 * start after each keystroke, so every digit landed in front of the last: 8125633886 was
 * saved as 6883365218, and "+918125633886" as "688336521+918". This field:
 *  - opens the phone keypad (type="tel"), not the full keyboard with word suggestions,
 *  - keeps only digits (and a leading "+" when allowPlus),
 *  - puts the caret back right after the character just typed on every render.
 *
 * onChange receives { target: { name, value } } with the cleaned value, so existing
 * handlers written for inputs (e.target.name / e.target.value) work unchanged.
 */
export const PhoneInput = forwardRef(function PhoneInput(
  { value, onChange, allowPlus = false, maxLength, name, ...rest },
  forwardedRef,
) {
  const innerRef = useRef(null)
  const caretRef = useRef(null)
  const limit = maxLength ?? (allowPlus ? 13 : 10)

  const clean = (text) => {
    let out = String(text || "").replace(allowPlus ? /[^\d+]/g : /\D/g, "")
    if (allowPlus) out = out.replace(/(?!^)\+/g, "") // "+" only at the start
    return out.slice(0, limit)
  }

  const setRefs = (el) => {
    innerRef.current = el
    if (typeof forwardedRef === "function") forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  useLayoutEffect(() => {
    const el = innerRef.current
    const caret = caretRef.current
    caretRef.current = null
    if (!el || caret == null || document.activeElement !== el) return
    if (el.selectionStart !== caret || el.selectionEnd !== caret) {
      try {
        el.setSelectionRange(caret, caret)
      } catch {
        // some input types refuse selection APIs; the value itself is still right
      }
    }
  }, [value])

  const handleChange = (event) => {
    const raw = event.target.value
    const rawCaret = event.target.selectionStart ?? raw.length
    const cleaned = clean(raw)
    caretRef.current = Math.min(clean(raw.slice(0, rawCaret)).length, cleaned.length)
    onChange?.({ target: { name, value: cleaned }, currentTarget: { name, value: cleaned } })
  }

  return (
    <Input
      {...rest}
      ref={setRefs}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      dir="ltr"
      value={value ?? ""}
      onChange={handleChange}
    />
  )
})

export default PhoneInput
