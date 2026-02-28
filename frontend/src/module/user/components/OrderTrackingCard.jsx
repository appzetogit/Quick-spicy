import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrdersContext';
import { orderAPI } from '@/lib/api';

const getOrderKey = (order) => order?.id || order?._id || order?.orderId || null;

const getOrderStatus = (order) =>
  (order?.status || order?.deliveryState?.status || '').toLowerCase();

const isActiveOrder = (order) => {
  const status = getOrderStatus(order);
  return !(
    status === 'delivered' ||
    status === 'cancelled' ||
    status === 'completed' ||
    status === ''
  );
};

const getTimeRemaining = (order) => {
  if (!order) return null;

  const orderTime = new Date(
    order.createdAt || order.orderDate || order.created_at || order.date || Date.now(),
  );
  const estimatedMinutes =
    order.estimatedDeliveryTime ||
    order.estimatedTime ||
    order.estimated_delivery_time ||
    35;
  const deliveryTime = new Date(orderTime.getTime() + estimatedMinutes * 60000);
  return Math.max(0, Math.floor((deliveryTime - new Date()) / 60000));
};

export default function OrderTrackingCard() {
  const navigate = useNavigate();
  const { orders: contextOrders } = useOrders();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [apiOrders, setApiOrders] = useState([]);

  useEffect(() => {
    const userToken =
      localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken');
    if (!userToken) {
      return;
    }

    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await orderAPI.getOrders({ limit: 10, page: 1 });
        let nextOrders = [];

        if (response?.data?.success && response?.data?.data?.orders) {
          nextOrders = response.data.data.orders;
        } else if (response?.data?.orders) {
          nextOrders = response.data.orders;
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          nextOrders = response.data.data;
        }

        if (isMounted) {
          setApiOrders(Array.isArray(nextOrders) ? nextOrders : []);
        }
      } catch {
        if (isMounted) {
          setApiOrders([]);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, []);

  const uniqueOrders = useMemo(() => {
    const seen = new Set();

    return [...contextOrders, ...apiOrders].filter((order) => {
      const key = getOrderKey(order);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [contextOrders, apiOrders]);

  const activeOrder = useMemo(
    () => uniqueOrders.find((order) => isActiveOrder(order)) || null,
    [uniqueOrders],
  );

  useEffect(() => {
    if (!activeOrder) {
      setTimeRemaining(null);
      return;
    }

    const updateRemainingTime = () => {
      setTimeRemaining(getTimeRemaining(activeOrder));
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 60000);

    return () => clearInterval(interval);
  }, [activeOrder]);

  if (!activeOrder) {
    return null;
  }

  const orderStatus = getOrderStatus(activeOrder) || 'preparing';
  if (orderStatus === 'delivered' || orderStatus === 'completed' || timeRemaining === 0) {
    return null;
  }

  const restaurantName =
    activeOrder.restaurant || activeOrder.restaurantName || 'Restaurant';
  const statusText =
    orderStatus === 'preparing' || orderStatus === 'confirmed' || orderStatus === 'pending'
      ? 'Preparing your order'
      : orderStatus === 'out_for_delivery' ||
          orderStatus === 'outfordelivery' ||
          orderStatus === 'on_way'
        ? 'On the way'
        : 'Preparing your order';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed bottom-20 left-4 right-4 z-[60] md:hidden"
        onClick={() => navigate(`/user/orders/${activeOrder.id || activeOrder._id}`)}
      >
        <div className="bg-gray-800 rounded-xl p-4 shadow-2xl border border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{restaurantName}</p>
                <div className="flex items-center gap-1">
                  <p className="text-gray-300 text-xs truncate">{statusText}</p>
                  <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            </div>

            <div className="bg-[#EB590E] rounded-lg px-3 py-2 flex-shrink-0">
              <p className="text-white text-[10px] font-medium uppercase leading-tight">
                arriving in
              </p>
              <p className="text-white text-sm font-bold leading-tight">
                {timeRemaining !== null ? `${timeRemaining} mins` : '-- mins'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
