import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Menu from '../../restaurant/models/Menu.js';

const toArray = (value) => (Array.isArray(value) ? value : []);

/**
 * When was this menu item added?
 *
 * Mirrors the ordering the admin foods table used while it sorted client-side: an explicit
 * timestamp if the item carries one, otherwise the millisecond stamp embedded in generated
 * ids like "item-1768285554154-0.7038".
 */
const getItemCreatedMs = (item = {}) => {
  const direct = [item.createdAt, item.addedAt, item.requestedAt, item.updatedAt]
    .map((value) => new Date(value).getTime())
    .find((ms) => Number.isFinite(ms) && ms > 0);
  if (direct) return direct;

  const match = String(item.id || '').match(/\d{10,}/);
  if (match) {
    const fromId = Number(match[0]);
    if (Number.isFinite(fromId) && fromId > 0) return fromId;
  }

  return 0;
};

const buildFoodRow = ({ item, section, subsection, restaurant, restaurantId }) => ({
  id: item.id || [restaurantId, section.id, subsection?.id, item.name].filter(Boolean).join('-'),
  _id: item._id,
  name: item.name || 'Unnamed Item',
  image: item.image || toArray(item.images)[0] || '',
  priority: 'Normal',
  status: item.isAvailable !== false && item.approvalStatus !== 'rejected',
  restaurantId,
  restaurantName: restaurant?.name || 'Unknown Restaurant',
  zoneId: String(restaurant?.zoneId?._id || restaurant?.zoneId || ''),
  sectionId: section.id,
  sectionName: section.name || 'Unknown Section',
  ...(subsection
    ? { subsectionId: subsection.id, subsectionName: subsection.name || 'Unknown Subsection' }
    : {}),
  price: item.price || 0,
  foodType: item.foodType || 'Non-Veg',
  approvalStatus: item.approvalStatus || 'pending',
  // The edit form spreads this back over the item it saves, so it has to stay whole -
  // trimming fields here would silently drop them the next time an admin saves a food.
  originalItem: item,
});

/**
 * Admin foods list, filtered, sorted and paginated on the server.
 * GET /api/admin/menu/foods
 *
 * The admin foods page used to fetch every restaurant's menu in its own request - dozens of
 * round trips carrying several megabytes of full menu documents - and then flatten, filter
 * and paginate all of it in the browser just to show twenty rows. This does that work once,
 * next to the data, and returns only the page being displayed.
 */
export const getAdminFoods = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      zoneId = '',
      restaurantId = '',
      category = '',
      stockStatus = '',
      approvalStatus = 'approved',
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const menus = await Menu.find({ isActive: true })
      .populate('restaurant', 'name restaurantId zoneId')
      .lean();

    const foods = [];
    for (const menu of menus) {
      const restaurant = menu.restaurant;
      if (!restaurant) continue;
      const restId = String(restaurant._id || '');

      for (const section of toArray(menu.sections)) {
        for (const item of toArray(section.items)) {
          foods.push(buildFoodRow({ item, section, restaurant, restaurantId: restId }));
        }
        for (const subsection of toArray(section.subsections)) {
          for (const item of toArray(subsection.items)) {
            foods.push(buildFoodRow({ item, section, subsection, restaurant, restaurantId: restId }));
          }
        }
      }
    }

    const wantedApproval = String(approvalStatus || '').trim().toLowerCase();
    const byApproval = wantedApproval && wantedApproval !== 'all'
      ? foods.filter((food) => String(food.approvalStatus).toLowerCase() === wantedApproval)
      : foods;

    // The category dropdown lists every category available for the chosen restaurant, not
    // just the ones surviving the other filters, so it is derived before they are applied.
    const forCategories = restaurantId
      ? byApproval.filter((food) => food.restaurantId === String(restaurantId))
      : byApproval;
    const categoryMap = new Map();
    for (const food of forCategories) {
      const name = String(food.sectionName || '').trim();
      if (name && !categoryMap.has(name.toLowerCase())) categoryMap.set(name.toLowerCase(), name);
    }
    const categories = Array.from(categoryMap.values()).sort((a, b) => a.localeCompare(b));

    let result = byApproval;

    const query = String(search || '').trim().toLowerCase();
    if (query) {
      result = result.filter((food) =>
        String(food.name).toLowerCase().includes(query) ||
        String(food.id).toLowerCase().includes(query) ||
        String(food.restaurantName || '').toLowerCase().includes(query) ||
        String(food.sectionName || '').toLowerCase().includes(query) ||
        String(food.subsectionName || '').toLowerCase().includes(query));
    }
    if (zoneId) result = result.filter((food) => food.zoneId === String(zoneId));
    if (restaurantId) result = result.filter((food) => food.restaurantId === String(restaurantId));
    if (category) {
      const wanted = String(category).trim().toLowerCase();
      result = result.filter((food) => String(food.sectionName || '').trim().toLowerCase() === wanted);
    }
    if (stockStatus === 'in-stock') result = result.filter((food) => food.status === true);
    if (stockStatus === 'out-of-stock') result = result.filter((food) => food.status !== true);

    result.sort((a, b) => getItemCreatedMs(b.originalItem) - getItemCreatedMs(a.originalItem));

    const total = result.length;
    const totalPages = Math.max(Math.ceil(total / limitNum), 1);
    const safePage = Math.min(pageNum, totalPages);
    const start = (safePage - 1) * limitNum;

    return successResponse(res, 200, 'Foods retrieved successfully', {
      foods: result.slice(start, start + limitNum),
      categories,
      pagination: { page: safePage, limit: limitNum, total, totalPages },
    });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch foods');
  }
});

/**
 * Menu categories across every restaurant, built server-side.
 * GET /api/admin/menu/categories-overview
 *
 * Replaces the admin categories page firing one menu request per restaurant, all at once.
 */
export const getAdminMenuCategories = asyncHandler(async (req, res) => {
  try {
    const menus = await Menu.find({ isActive: true })
      .populate('restaurant', 'name restaurantId')
      .lean();

    const categoryMap = new Map();
    for (const menu of menus) {
      const restaurant = menu.restaurant;
      if (!restaurant) continue;
      const restId = String(restaurant._id || '');
      const restName = String(restaurant.name || 'Unknown Restaurant').trim() || 'Unknown Restaurant';

      for (const section of toArray(menu.sections)) {
        const name = String(section?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();

        const image =
          toArray(section.items).find((item) => item?.image)?.image ||
          toArray(section.subsections)
            .flatMap((subsection) => toArray(subsection.items))
            .find((item) => item?.image)?.image ||
          '';

        if (!categoryMap.has(key)) {
          categoryMap.set(key, {
            id: key,
            name,
            image,
            type: 'Menu Section',
            status: true,
            restaurantIds: [],
            restaurantNames: [],
          });
        }

        const entry = categoryMap.get(key);
        if (!entry.image && image) entry.image = image;
        if (restId && !entry.restaurantIds.includes(restId)) entry.restaurantIds.push(restId);
        if (!entry.restaurantNames.includes(restName)) entry.restaurantNames.push(restName);
      }
    }

    const categories = Array.from(categoryMap.values())
      .map((entry) => ({ ...entry, restaurantCount: entry.restaurantIds.length }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return successResponse(res, 200, 'Menu categories retrieved successfully', { categories });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch menu categories');
  }
});

export default { getAdminFoods, getAdminMenuCategories };
