let cashfreeLoaded = false;

export const loadCashfreeScript = () => {
  return new Promise((resolve, reject) => {
    if (cashfreeLoaded) {
      resolve();
      return;
    }

    if (window.Cashfree) {
      cashfreeLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => {
      cashfreeLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Cashfree script'));
    document.body.appendChild(script);
  });
};

export const initCashfreePayment = async (options) => {
  await loadCashfreeScript();

  if (!window.Cashfree) {
    throw new Error('Cashfree SDK not available');
  }

  const isWebView =
    Boolean(window.ReactNativeWebView) ||
    Boolean(window.flutter_inappwebview) ||
    /\bwv\b|WebView/i.test(navigator.userAgent);

  const cashfree = window.Cashfree({
    mode: options.environment === 'production' ? 'production' : 'sandbox'
  });

  const result = await cashfree.checkout({
    paymentSessionId: options.paymentSessionId,
    redirectTarget: isWebView ? '_self' : '_modal'
  });

  if (result?.error) {
    throw new Error(result.error.message || 'Cashfree checkout failed');
  }

  return result;
};
