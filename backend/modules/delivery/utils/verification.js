export const DELIVERY_ORDER_ELIGIBLE_STATUSES = ['approved', 'active'];

export function canDeliveryReceiveOrders(delivery) {
  if (!delivery) return false;

  return (
    delivery.isActive === true &&
    DELIVERY_ORDER_ELIGIBLE_STATUSES.includes(String(delivery.status || '').toLowerCase())
  );
}

export function getDeliveryVerificationBlockMessage(delivery) {
  const status = String(delivery?.status || '').toLowerCase();

  if (status === 'pending') {
    return 'Your profile is under verification. You can go online and receive orders only after admin approval.';
  }

  if (status === 'blocked') {
    return 'Your profile verification was denied. Please reverify your profile before going online or receiving orders.';
  }

  if (status === 'suspended') {
    return 'Your account is suspended. Please contact admin support.';
  }

  if (delivery?.isActive === false) {
    return 'Your account is inactive. Please contact admin support.';
  }

  return 'Your account is not approved to receive orders yet.';
}
