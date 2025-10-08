const express = require("express");

const {
  authMiddlewares,
  authorizeRoles,
} = require("../../middlewares/authMiddlewares");
const {
  add_category,
  get_category,
  update_category,
  delete_category,
  add_coupon,
  get_products,
  get_coupon,
  update_coupons,
  reject_seller,
  toggleFeatured,
  approve_seller,
  update_seller_fee,
  reject_seller_products,
  edit_update_user,
  bulk_approve_products,
  get_order_for_admin,
  report_admin,
} = require("../../controllers/admin_controllers/provider_admin");
const {
  get_seller,
} = require("../../controllers/admin_controllers/management_user");
const {
  createFlashSale,
} = require("../../controllers/client_controllers/products");
const router = express.Router();

// Admin routes for category management
router.post(
  "/add-category",
  authMiddlewares,
  authorizeRoles("admin"),
  authorizeRoles("admin"),
  add_category
);
router.get("/get-category", get_category);
router.put(
  "/update-category/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  update_category
);
router.delete(
  "/delete-category/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  delete_category
);

/// Admin routes for coupon management
router.post(
  "/add-coupon",
  authMiddlewares,
  authorizeRoles("admin"),
  add_coupon
);

///get-products
router.get(
  "/get_products_admin",
  authMiddlewares,
  authorizeRoles("admin"),
  get_products
);
//get_sellers
router.get("/get_seller", authMiddlewares, authorizeRoles("admin"), get_seller);
router.get("/get_coupon", authMiddlewares, authorizeRoles("admin"), get_coupon);
router.patch(
  "/update_coupons/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  update_coupons
);
//reject_seller
router.patch(
  "/reject_seller/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  reject_seller
);

//toggleFeatured
router.patch(
  "/toggleFeatured/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  toggleFeatured
);
///approve_seller ອະນຸມັດສິນຄ້າ
router.patch(
  "/approve_seller/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  approve_seller
);
///ປະຕິເສດສິນຄ້າ
router.patch(
  "/reject_products/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  reject_seller_products
);

///flash sale
// router.post(
//   "/create_flash_sale",
//   authMiddlewares,
//   authorizeRoles("admin"),
//   createFlashSale
// );

// Export the router
router.patch(
  "/update_seller_fee/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  update_seller_fee
);
///edit
router.patch(
  "/edit_update_user/:id",
  authMiddlewares,
  authorizeRoles("admin"),
  edit_update_user
);
///bulk_approve_products
router.patch(
  "/bulk_approve_products/:ids",
  authMiddlewares,
  authorizeRoles("admin"),
  bulk_approve_products
);
////order
router.get(
  "/order",
  authMiddlewares,
  authorizeRoles("admin"),
  get_order_for_admin
);
///report_admin
router.get(
  "/report_admin",
  authMiddlewares,
  authorizeRoles("admin"),
  report_admin
);
module.exports = router;
