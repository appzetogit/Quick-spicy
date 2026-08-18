/**
 * Go back without ever escaping the app.
 *
 * navigate(-1) walks the browser history blindly. When the current page is the first entry -
 * a deep link, a shared restaurant URL, a notification tap, or any screen reached after a
 * redirect that replaced history - there is nothing behind it, so the back press leaves the
 * web app entirely. In a browser that means the previous website; inside the Flutter WebView
 * it pops the whole view and the app CLOSES, losing whatever the customer was doing.
 *
 * React Router records its position in history.state.idx. Anything above 0 means there is a
 * previous screen of ours to return to. At 0 there is not, so we go somewhere sensible
 * instead of off the end.
 */
export function safeBack(navigate, fallback = "/") {
  const index = typeof window !== "undefined" ? window.history.state?.idx : null;

  if (typeof index === "number" && index > 0) {
    navigate(-1);
    return;
  }

  // No history of our own behind this screen: replace rather than push, so the customer
  // cannot immediately press back again and end up in the same dead end.
  navigate(fallback, { replace: true });
}

export default safeBack;
