import Menu from '../models/Menu.js';
import Restaurant from '../models/Restaurant.js';
import RestaurantCategory from '../models/RestaurantCategory.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

const normalizeSingleItemImages = (item = {}) => {
  const validArrayImages = Array.isArray(item.images)
    ? item.images.filter((img) => img && typeof img === 'string' && img.trim() !== '')
    : [];
  const fallbackSingleImage = item.image && typeof item.image === 'string' && item.image.trim() !== ''
    ? item.image.trim()
    : '';

  const firstImage = (validArrayImages[0] || fallbackSingleImage || '').trim();
  return {
    image: firstImage,
    images: firstImage ? [firstImage] : [],
    photoCount: firstImage ? 1 : 0,
  };
};

const getItemAddedAtMs = (item = {}) => {
  if (item.requestedAt) {
    const requestedAtMs = new Date(item.requestedAt).getTime();
    if (!Number.isNaN(requestedAtMs)) return requestedAtMs;
  }

  const rawId = String(item.id || item._id || '');
  const tsMatch = rawId.match(/(\d{10,13})/);
  if (tsMatch && tsMatch[1]) {
    const parsed = Number(tsMatch[1]);
    if (!Number.isNaN(parsed)) {
      return tsMatch[1].length === 10 ? parsed * 1000 : parsed;
    }
  }

  return 0;
};

const sortNewestFirst = (items = []) =>
  [...items].sort((a, b) => getItemAddedAtMs(b) - getItemAddedAtMs(a));

// Get menu for a restaurant
export const getMenu = asyncHandler(async (req, res) => {
  // Restaurant is attached by authenticate middleware
  const restaurantId = req.restaurant._id;

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    // Create empty menu
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      isActive: true,
    });
    await menu.save();
  }

  return successResponse(res, 200, 'Menu retrieved successfully', {
    menu: {
      sections: menu.sections || [],
      isActive: menu.isActive,
    },
  });
});

// Update menu (upsert)
export const updateMenu = asyncHandler(async (req, res) => {
  // Restaurant is attached by authenticate middleware
  const restaurantId = req.restaurant._id;
  const { sections } = req.body;

  console.log('=== UPDATE MENU REQUEST RECEIVED ===');
  console.log('Restaurant ID:', restaurantId);
  console.log('Sections count:', sections?.length || 0);

  // CRITICAL: Get existing menu FIRST to preserve approval status fields
  const existingMenu = await Menu.findOne({ restaurant: restaurantId });
  console.log('[UPDATE MENU] Existing menu found:', existingMenu ? 'Yes' : 'No');

  if (existingMenu) {
    console.log('[UPDATE MENU] Existing sections count:', existingMenu.sections?.length || 0);
  }

  // Debug: Log incoming images data
  if (sections && Array.isArray(sections)) {
    sections.forEach((section, sIdx) => {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach((item, iIdx) => {
          console.log(`[INCOMING] Section ${sIdx}, Item ${iIdx} (${item.name || 'unnamed'}):`);
          console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
          console.log(`  - images length: ${Array.isArray(item.images) ? item.images.length : 'N/A'}`);
          console.log(`  - images value:`, item.images);
          console.log(`  - photoCount: ${item.photoCount}`);
        });
      }
      // Also check subsections
      if (section.subsections && Array.isArray(section.subsections)) {
        section.subsections.forEach((subsection, ssIdx) => {
          if (subsection.items && Array.isArray(subsection.items)) {
            subsection.items.forEach((item, iIdx) => {
              console.log(`[INCOMING] Section ${sIdx}, Subsection ${ssIdx}, Item ${iIdx} (${item.name || 'unnamed'}):`);
              console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
              console.log(`  - images length: ${Array.isArray(item.images) ? item.images.length : 'N/A'}`);
              console.log(`  - images value:`, item.images);
              console.log(`  - photoCount: ${item.photoCount}`);
            });
          }
        });
      }
    });
  }

  // Normalize and validate sections
  const normalizedSections = Array.isArray(sections) ? sections.map((section, index) => {
    // Find existing section to preserve approval status
    const existingSection = existingMenu?.sections?.find(s => s.id === section.id);

    return {
      id: section.id || `section-${index}`,
      name: section.name || "Unnamed Section",
      items: Array.isArray(section.items) ? section.items.map(item => {
        const normalizedMedia = normalizeSingleItemImages(item);
        // CRITICAL: Find existing item to preserve approval status fields
        const existingItem = existingSection?.items?.find(i => String(i.id) === String(item.id));

        return {
          id: String(item.id || Date.now() + Math.random()),
          name: item.name || "Unnamed Item",
          nameArabic: item.nameArabic || "",
          image: normalizedMedia.image,
          category: item.category || section.name,
          rating: item.rating ?? 0.0,
          reviews: item.reviews ?? 0,
          price: item.price || 0,
          stock: item.stock || "Unlimited",
          discount: item.discount || null,
          originalPrice: item.originalPrice || null,
          foodType: item.foodType || "Non-Veg",
          availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
          availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
          description: item.description || "",
          discountType: item.discountType || "Percent",
          discountAmount: item.discountAmount ?? 0.0,
          isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
          isRecommended: item.isRecommended || false,
          variations: Array.isArray(item.variations) ? item.variations.map(v => ({
            id: String(v.id || Date.now() + Math.random()),
            name: v.name || "",
            price: v.price || 0,
            stock: v.stock || "Unlimited",
          })) : [],
          tags: Array.isArray(item.tags) ? item.tags : [],
          nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
          allergies: Array.isArray(item.allergies) ? item.allergies : [],
          photoCount: normalizedMedia.photoCount,
          // Additional fields for complete item details
          subCategory: item.subCategory || "",
          servesInfo: item.servesInfo || "",
          itemSize: item.itemSize || "",
          itemSizeQuantity: item.itemSizeQuantity || "",
          itemSizeUnit: item.itemSizeUnit || "piece",
          gst: item.gst ?? 0,
          preparationTime: existingItem?.preparationTime || item.preparationTime || "",
          images: normalizedMedia.images,
          // CRITICAL: Preserve approval status fields from existing item
          // Restaurant should NOT be able to overwrite these fields
          approvalStatus: existingItem?.approvalStatus || item.approvalStatus || 'pending',
          rejectionReason: existingItem?.rejectionReason || item.rejectionReason || '',
          requestedAt: existingItem?.requestedAt || item.requestedAt || (item.approvalStatus === 'pending' ? new Date() : undefined),
          approvedAt: existingItem?.approvedAt || item.approvedAt,
          approvedBy: existingItem?.approvedBy || item.approvedBy,
          rejectedAt: existingItem?.rejectedAt || item.rejectedAt,
        };
      }) : [],
      subsections: Array.isArray(section.subsections) ? section.subsections.map(subsection => {
        // Find existing subsection to preserve approval status
        const existingSubsection = existingSection?.subsections?.find(s => s.id === subsection.id);

        return {
          id: subsection.id || `subsection-${Date.now()}`,
          name: subsection.name || "Unnamed Subsection",
          items: Array.isArray(subsection.items) ? subsection.items.map(item => {
            const normalizedMedia = normalizeSingleItemImages(item);
            // CRITICAL: Find existing item to preserve approval status fields
            const existingItem = existingSubsection?.items?.find(i => String(i.id) === String(item.id));

            return {
              id: String(item.id || Date.now() + Math.random()),
              name: item.name || "Unnamed Item",
              nameArabic: item.nameArabic || "",
              image: normalizedMedia.image,
              category: item.category || section.name,
              rating: item.rating ?? 0.0,
              reviews: item.reviews ?? 0,
              price: item.price || 0,
              stock: item.stock || "Unlimited",
              discount: item.discount || null,
              originalPrice: item.originalPrice || null,
              foodType: item.foodType || "Non-Veg",
              availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
              availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
              description: item.description || "",
              discountType: item.discountType || "Percent",
              discountAmount: item.discountAmount ?? 0.0,
              isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
              isRecommended: item.isRecommended || false,
              variations: Array.isArray(item.variations) ? item.variations.map(v => ({
                id: String(v.id || Date.now() + Math.random()),
                name: v.name || "",
                price: v.price || 0,
                stock: v.stock || "Unlimited",
              })) : [],
              tags: Array.isArray(item.tags) ? item.tags : [],
              nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
              allergies: Array.isArray(item.allergies) ? item.allergies : [],
              photoCount: normalizedMedia.photoCount,
              // Additional fields for complete item details
              subCategory: item.subCategory || "",
              servesInfo: item.servesInfo || "",
              itemSize: item.itemSize || "",
              itemSizeQuantity: item.itemSizeQuantity || "",
              itemSizeUnit: item.itemSizeUnit || "piece",
              gst: item.gst ?? 0,
              preparationTime: existingItem?.preparationTime || item.preparationTime || "",
              images: normalizedMedia.images,
              // CRITICAL: Preserve approval status fields from existing item
              // Restaurant should NOT be able to overwrite these fields
              approvalStatus: existingItem?.approvalStatus || item.approvalStatus || 'pending',
              rejectionReason: existingItem?.rejectionReason || item.rejectionReason || '',
              requestedAt: existingItem?.requestedAt || item.requestedAt || (item.approvalStatus === 'pending' ? new Date() : undefined),
              approvedAt: existingItem?.approvedAt || item.approvedAt,
              approvedBy: existingItem?.approvedBy || item.approvedBy,
              rejectedAt: existingItem?.rejectedAt || item.rejectedAt,
            };
          }) : [],
        };
      }) : [],
      isEnabled: section.isEnabled !== undefined ? section.isEnabled : true,
      order: section.order !== undefined ? section.order : index,
    };
  }) : [];

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  // Debug: Log normalized sections before saving
  console.log('[UPDATE MENU] Normalized sections before save:');
  normalizedSections.forEach((section, sIdx) => {
    if (section.items && Array.isArray(section.items)) {
      section.items.forEach((item, iIdx) => {
        console.log(`[UPDATE MENU] Section ${sIdx}, Item ${iIdx} (${item.name}): images array =`, item.images, `length = ${item.images?.length || 0}`);
      });
    }
  });

  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: normalizedSections,
      isActive: true,
    });
    console.log('[UPDATE MENU] Creating new menu');
  } else {
    console.log('[UPDATE MENU] Updating existing menu');
    // Use set method to ensure Mongoose properly tracks changes
    menu.set('sections', normalizedSections);
    // Mark sections as modified to ensure Mongoose saves nested arrays properly
    // This is CRITICAL for nested arrays in Mongoose
    menu.markModified('sections');
    // Force Mongoose to treat this as a direct assignment
    menu.isNew = false;
  }

  console.log('[UPDATE MENU] About to save menu...');
  await menu.save();
  console.log('[UPDATE MENU] Menu saved successfully');

  // Debug: Verify what was saved - reload from database
  const savedMenu = await Menu.findOne({ restaurant: restaurantId }).lean();
  if (savedMenu && savedMenu.sections) {
    console.log('[UPDATE MENU] === VERIFICATION AFTER SAVE ===');
    savedMenu.sections.forEach((section, sIdx) => {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach((item, iIdx) => {
          console.log(`[VERIFY] Section ${sIdx}, Item ${iIdx} (${item.name}):`);
          console.log(`  - images type: ${Array.isArray(item.images) ? 'Array' : typeof item.images}`);
          console.log(`  - images length: ${item.images?.length || 0}`);
          console.log(`  - images value:`, item.images);
          console.log(`  - photoCount: ${item.photoCount}`);
          if (item.images && item.images.length === 1 && item.photoCount > 1) {
            console.error(`  - ERROR: Only 1 image saved but photoCount is ${item.photoCount}!`);
          }
        });
      }
    });
    console.log('[UPDATE MENU] === END VERIFICATION ===');
  }

  return successResponse(res, 200, 'Menu updated successfully', {
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new section (category)
export const addSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Section name is required');
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      isActive: true,
    });
  }

  // Check if section with same name already exists
  const existingSection = menu.sections.find(
    s => s.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existingSection) {
    return errorResponse(res, 400, 'Section with this name already exists');
  }

  // Create new section
  const newSection = {
    id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    items: [],
    subsections: [],
    isEnabled: true,
    order: menu.sections.length,
  };

  menu.sections.push(newSection);
  await menu.save();

  return successResponse(res, 201, 'Section added successfully', {
    section: newSection,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new item to a section
export const addItemToSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, item } = req.body;

  if (!sectionId) {
    return errorResponse(res, 400, 'Section ID is required');
  }

  if (!item || !item.name || item.price === undefined) {
    return errorResponse(res, 400, 'Item name and price are required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Normalize item data
  const normalizedMedia = normalizeSingleItemImages(item);
  const newItem = {
    id: String(item.id || Date.now() + Math.random()),
    name: item.name.trim(),
    nameArabic: item.nameArabic || "",
    image: normalizedMedia.image,
    category: item.category || section.name,
    rating: item.rating ?? 0.0,
    reviews: item.reviews ?? 0,
    price: Number(item.price) || 0,
    stock: item.stock || "Unlimited",
    discount: item.discount || null,
    originalPrice: item.originalPrice || null,
    foodType: item.foodType || "Non-Veg",
    availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
    availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
    description: item.description || "",
    discountType: item.discountType || "Percent",
    discountAmount: item.discountAmount ?? 0.0,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isRecommended: item.isRecommended || false,
    variations: Array.isArray(item.variations) ? item.variations.map(v => ({
      id: String(v.id || Date.now() + Math.random()),
      name: v.name || "",
      price: Number(v.price) || 0,
      stock: v.stock || "Unlimited",
    })) : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
    allergies: Array.isArray(item.allergies) ? item.allergies : [],
    photoCount: normalizedMedia.photoCount,
    // Additional fields for complete item details
    subCategory: item.subCategory || "",
    servesInfo: item.servesInfo || "",
    itemSize: item.itemSize || "",
    itemSizeQuantity: item.itemSizeQuantity || "",
    itemSizeUnit: item.itemSizeUnit || "piece",
    gst: item.gst ?? 0,
    images: normalizedMedia.images,
    preparationTime: item.preparationTime || "",
    approvalStatus: 'pending', // New items require admin approval
    requestedAt: new Date(),
  };

  section.items.push(newItem);
  await menu.save();

  return successResponse(res, 201, 'Item added successfully', {
    item: newItem,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a subsection to a section
export const addSubsectionToSection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, name } = req.body;

  if (!sectionId) {
    return errorResponse(res, 400, 'Section ID is required');
  }

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Subsection name is required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Check if subsection with same name already exists
  const existingSubsection = section.subsections.find(
    sub => sub.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existingSubsection) {
    return errorResponse(res, 400, 'Subsection with this name already exists');
  }

  // Create new subsection
  const newSubsection = {
    id: `subsection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    items: [],
  };

  section.subsections.push(newSubsection);
  await menu.save();

  return successResponse(res, 201, 'Subsection added successfully', {
    subsection: newSubsection,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Add a new item to a subsection
export const addItemToSubsection = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, subsectionId, item } = req.body;

  if (!sectionId || !subsectionId) {
    return errorResponse(res, 400, 'Section ID and Subsection ID are required');
  }

  if (!item || !item.name || item.price === undefined) {
    return errorResponse(res, 400, 'Item name and price are required');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find section
  const section = menu.sections.find(s => s.id === sectionId);
  if (!section) {
    return errorResponse(res, 404, 'Section not found');
  }

  // Find subsection
  const subsection = section.subsections.find(sub => sub.id === subsectionId);
  if (!subsection) {
    return errorResponse(res, 404, 'Subsection not found');
  }

  // Normalize item data
  const normalizedMedia = normalizeSingleItemImages(item);
  const newItem = {
    id: String(item.id || Date.now() + Math.random()),
    name: item.name.trim(),
    nameArabic: item.nameArabic || "",
    image: normalizedMedia.image,
    category: item.category || section.name,
    rating: item.rating ?? 0.0,
    reviews: item.reviews ?? 0,
    price: Number(item.price) || 0,
    stock: item.stock || "Unlimited",
    discount: item.discount || null,
    originalPrice: item.originalPrice || null,
    foodType: item.foodType || "Non-Veg",
    availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
    availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
    description: item.description || "",
    discountType: item.discountType || "Percent",
    discountAmount: item.discountAmount ?? 0.0,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isRecommended: item.isRecommended || false,
    variations: Array.isArray(item.variations) ? item.variations.map(v => ({
      id: String(v.id || Date.now() + Math.random()),
      name: v.name || "",
      price: Number(v.price) || 0,
      stock: v.stock || "Unlimited",
    })) : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
    allergies: Array.isArray(item.allergies) ? item.allergies : [],
    photoCount: normalizedMedia.photoCount,
    gst: item.gst ?? 0,
    images: normalizedMedia.images,
    preparationTime: item.preparationTime || "",
    approvalStatus: 'pending', // New items require admin approval
    requestedAt: new Date(),
  };

  subsection.items.push(newItem);
  await menu.save();

  return successResponse(res, 201, 'Item added to subsection successfully', {
    item: newItem,
    menu: {
      sections: menu.sections,
      isActive: menu.isActive,
    },
  });
});

// Get menu by restaurant ID (public - for user module)
export const getMenuByRestaurantId = async (req, res) => {
  try {
    const { id } = req.params;

    // Find restaurant by ID, slug, or restaurantId
    const restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: id },
        { slug: id },
        ...(mongoose.Types.ObjectId.isValid(id) && id.length === 24
          ? [{ _id: new mongoose.Types.ObjectId(id) }]
          : []),
      ],
      isActive: true,
    });

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Find menu
    const menu = await Menu.findOne({
      restaurant: restaurant._id,
      isActive: true,
    });

    if (!menu) {
      // Return empty menu if not found
      return successResponse(res, 200, 'Menu retrieved successfully', {
        menu: {
          sections: [],
          isActive: true,
        },
      });
    }

    console.log('[USER MENU] Processing menu for restaurant:', restaurant._id);
    console.log('[USER MENU] Total sections:', menu.sections?.length || 0);

    const categoryRecords = await RestaurantCategory.find({
      restaurant: restaurant._id,
    })
      .select('name isActive')
      .lean();

    const categoryStatusByName = new Map(
      categoryRecords.map((category) => [
        String(category.name || '').trim().toLowerCase(),
        category.isActive !== false,
      ])
    );

    // Filter menu for user side: only show enabled sections and available items
    const filteredSections = (menu.sections || [])
      .filter(section => {
        const sectionNameKey = String(section.name || '').trim().toLowerCase();
        const categoryExists = categoryStatusByName.has(sectionNameKey);
        const isCategoryActive = categoryExists ? categoryStatusByName.get(sectionNameKey) : true;

        // Only show sections where isEnabled is not explicitly false
        // If isEnabled is undefined/null, treat as enabled (default true)
        const isEnabled = section.isEnabled !== false;
        if (!isEnabled || !isCategoryActive) {
          console.log(`[USER MENU] Filtering out disabled section: "${section.name}"`);
        }
        return isEnabled && isCategoryActive;
      })
      .map(section => {
        console.log(`[USER MENU] Processing section: "${section.name}", items: ${section.items?.length || 0}`);
        // Filter direct items - only show available AND approved items
        // Items where isAvailable is not explicitly false AND approvalStatus is 'approved' should be shown
        const availableItems = (section.items || []).filter(item => {
          const isAvailable = item.isAvailable !== false;
          const isApproved = item.approvalStatus === 'approved' || !item.approvalStatus; // Include approved or legacy items without approvalStatus
          const shouldShow = isAvailable && isApproved;

          // Debug logging for filtered items
          if (!shouldShow) {
            console.log(`[USER MENU] Filtering out item "${item.name}": isAvailable=${item.isAvailable}, approvalStatus=${item.approvalStatus}`);
          }

          // Debug logging for preparationTime - log ALL items to see what's in the data
          if (shouldShow) {
            console.log(`[USER MENU] Item "${item.name}": preparationTime="${item.preparationTime}" (type: ${typeof item.preparationTime}, exists: ${item.hasOwnProperty('preparationTime')})`);
          }

          return shouldShow;
        });

        // Filter subsections and their items
        const availableSubsections = (section.subsections || [])
          .map(subsection => {
            const availableSubsectionItems = (subsection.items || []).filter(item => {
              const isAvailable = item.isAvailable !== false;
              const isApproved = item.approvalStatus === 'approved' || !item.approvalStatus; // Include approved or legacy items without approvalStatus
              const shouldShow = isAvailable && isApproved;

              // Debug logging for filtered items
              if (!shouldShow) {
                console.log(`[USER MENU] Filtering out subsection item "${item.name}": isAvailable=${item.isAvailable}, approvalStatus=${item.approvalStatus}`);
              }

              // Debug logging for preparationTime - log ALL items to see what's in the data
              if (shouldShow) {
                console.log(`[USER MENU] Subsection item "${item.name}": preparationTime="${item.preparationTime}" (type: ${typeof item.preparationTime}, exists: ${item.hasOwnProperty('preparationTime')})`);
              }

              return shouldShow;
            });
            // Only include subsection if it has available items
            const sortedSubsectionItems = sortNewestFirst(availableSubsectionItems);
            if (sortedSubsectionItems.length > 0) {
              return {
                ...subsection,
                items: sortedSubsectionItems,
              };
            }
            return null;
          })
          .filter(subsection => subsection !== null); // Remove null subsections

        // Include section if it has at least one available item OR at least one subsection with available items
        // This ensures category remains visible even if some items are unavailable
        if (availableItems.length > 0 || availableSubsections.length > 0) {
          const sortedItems = sortNewestFirst(availableItems);
          console.log(`[USER MENU] Section "${section.name}" included with ${availableItems.length} items and ${availableSubsections.length} subsections`);
          return {
            ...section,
            name: section.name || "Unnamed Section", // Ensure name is always present
            items: sortedItems,
            subsections: availableSubsections,
          };
        }
        // Return null only if section has no available items AND no subsections with available items
        console.log(`[USER MENU] Section "${section.name}" excluded - no available/approved items`);
        return null;
      })
      .filter(section => section !== null); // Remove null sections (sections with no available items)

    console.log('[USER MENU] Final filtered sections count:', filteredSections.length);
    const totalItems = filteredSections.reduce((sum, section) => {
      const sectionItems = (section.items || []).length;
      const subsectionItems = (section.subsections || []).reduce((subSum, sub) => subSum + (sub.items || []).length, 0);
      return sum + sectionItems + subsectionItems;
    }, 0);
    console.log('[USER MENU] Total items shown to user:', totalItems);

    return successResponse(res, 200, 'Menu retrieved successfully', {
      menu: {
        sections: filteredSections,
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    console.error('Error fetching menu by restaurant ID:', error);
    return errorResponse(res, 500, 'Failed to fetch menu');
  }
};

// Add a new add-on
export const addAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { name, description, price, image, images } = req.body;

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Add-on name is required');
  }

  if (price === undefined || price === null || price < 0) {
    return errorResponse(res, 400, 'Add-on price is required and must be non-negative');
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      addons: [],
      isActive: true,
    });
  }

  // Normalize images array
  const normalizedImages = Array.isArray(images) && images.length > 0
    ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
    : (image && image.trim() !== '' ? [image] : []);

  // Create new add-on
  const newAddon = {
    id: `addon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    description: description || '',
    price: Number(price) || 0,
    image: normalizedImages.length > 0 ? normalizedImages[0] : '',
    images: normalizedImages,
    isAvailable: true,
    approvalStatus: 'pending', // New add-ons require admin approval
    requestedAt: new Date(),
  };

  menu.addons.push(newAddon);
  await menu.save();

  return successResponse(res, 201, 'Add-on added successfully. Pending admin approval.', {
    addon: newAddon,
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

// Get add-ons for restaurant (filtered by approval status)
export const getAddons = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { includePending = false } = req.query;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return successResponse(res, 200, 'No add-ons found', {
      addons: [],
    });
  }

  // Filter add-ons based on approval status
  let addons = menu.addons || [];

  if (!includePending) {
    // For restaurant view, show all add-ons (including pending for their reference)
    // For public view, only show approved add-ons
    addons = addons; // Show all for restaurant admin
  } else {
    // Show all add-ons including pending
    addons = addons;
  }

  return successResponse(res, 200, 'Add-ons retrieved successfully', {
    addons,
  });
});

// Get addons by restaurant ID (public - for user module)
export const getAddonsByRestaurantId = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[ADDONS] Request received for ID: ${id}`);
    console.log(`[ADDONS] ID type: ${typeof id}, length: ${id?.length}`);

    // Find restaurant by ID, slug, or restaurantId - don't filter by isActive
    let restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: id },
        { slug: id },
        ...(mongoose.Types.ObjectId.isValid(id) && id.length === 24
          ? [{ _id: new mongoose.Types.ObjectId(id) }]
          : []),
      ],
    });

    if (!restaurant) {
      console.log(`[ADDONS] Restaurant not found for ID: ${id}`);
      return errorResponse(res, 404, 'Restaurant not found');
    }

    console.log(`[ADDONS] Restaurant found: ${restaurant._id}, name: ${restaurant.name}, isActive: ${restaurant.isActive}`);

    console.log(`[ADDONS] Restaurant found: ${restaurant._id}, name: ${restaurant.name}`);

    // Find menu - don't filter by isActive, just get the menu
    const menu = await Menu.findOne({
      restaurant: restaurant._id,
    });

    if (!menu) {
      console.log(`[ADDONS] No menu found for restaurant: ${restaurant._id}`);
      return successResponse(res, 200, 'No add-ons found', {
        addons: [],
      });
    }

    console.log(`[ADDONS] Menu found for restaurant: ${restaurant._id}`);
    console.log(`[ADDONS] Menu isActive: ${menu.isActive}`);
    console.log(`[ADDONS] Total addons in menu: ${(menu.addons || []).length}`);

    // User-side add-ons: only approved and available should be visible
    const allAddons = (menu.addons || []).filter(
      (addon) => addon.approvalStatus === 'approved' && addon.isAvailable !== false
    );

    // Log filtered addons for debugging
    console.log(`[ADDONS] Returning approved add-ons: ${allAddons.length}`);
    if (allAddons.length > 0) {
      console.log(`[ADDONS] Addon details:`, allAddons.map(a => ({
        id: a.id,
        name: a.name,
        isAvailable: a.isAvailable,
        approvalStatus: a.approvalStatus,
        price: a.price
      })));
    } else {
      console.log(`[ADDONS] Menu.addons is:`, menu.addons);
    }

    return successResponse(res, 200, 'Add-ons retrieved successfully', {
      addons: allAddons,
    });
  } catch (error) {
    console.error('Error fetching addons by restaurant ID:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, 'Failed to fetch add-ons');
  }
};

// Update an add-on
export const updateAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;
  const { name, description, price, image, images, isAvailable } = req.body;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find add-on
  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(id));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  const addon = menu.addons[addonIndex];

  // If isAvailable is provided, update it without requiring re-approval
  if (typeof isAvailable === 'boolean') {
    addon.isAvailable = isAvailable;
    menu.markModified(`addons.${addonIndex}`);
    menu.markModified('addons');
    await menu.save();

    return successResponse(res, 200, 'Add-on availability updated successfully', {
      addon: menu.addons[addonIndex],
      menu: {
        addons: menu.addons,
        isActive: menu.isActive,
      },
    });
  }

  // For other updates, require name and price
  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Add-on name is required');
  }

  if (price === undefined || price === null || price < 0) {
    return errorResponse(res, 400, 'Add-on price is required and must be non-negative');
  }

  // Normalize images array
  const normalizedImages = Array.isArray(images) && images.length > 0
    ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
    : (image && image.trim() !== '' ? [image] : []);

  // Update add-on (preserve approval status if already approved/rejected)
  addon.name = name.trim();
  addon.description = description || '';
  addon.price = Number(price) || 0;
  addon.image = normalizedImages.length > 0 ? normalizedImages[0] : '';
  addon.images = normalizedImages;

  // If editing an approved/rejected add-on, set status back to pending for re-approval
  if (addon.approvalStatus === 'approved' || addon.approvalStatus === 'rejected') {
    addon.approvalStatus = 'pending';
    addon.requestedAt = new Date();
    addon.approvedAt = null;
    addon.approvedBy = null;
    addon.rejectedAt = null;
    addon.rejectionReason = '';
  }

  menu.markModified(`addons.${addonIndex}`);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on updated successfully. Pending admin approval if previously approved.', {
    addon: menu.addons[addonIndex],
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

// Delete an add-on
export const deleteAddon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Find and remove add-on
  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(id));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  menu.addons.splice(addonIndex, 1);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on deleted successfully', {
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});
