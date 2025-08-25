const express = require("express");

const { authMiddlewares } = require("../../middlewares/authMiddlewares");
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
} = require("../../controllers/admin_controllers/provider_admin");
const {
  get_seller,
} = require("../../controllers/admin_controllers/management_user");
const { createFlashSale } = require("../../controllers/client_controllers/products");
const router = express.Router();

// Admin routes for category management
router.post("/add-category", authMiddlewares, add_category);
router.get("/get-category", authMiddlewares, get_category);
router.put("/update-category/:id", authMiddlewares, update_category);
router.delete("/delete-category/:id", authMiddlewares, delete_category);

/// Admin routes for coupon management
router.post("/add-coupon", authMiddlewares, add_coupon);

///get-products
router.get("/get_products_admin", authMiddlewares, get_products);
//get_sellers
router.get("/get_seller", authMiddlewares, get_seller);
router.get("/get_coupon", authMiddlewares, get_coupon);
router.patch("/update_coupons/:id", authMiddlewares, update_coupons);
//reject_seller
router.patch("/reject_seller/:id", authMiddlewares, reject_seller);

//toggleFeatured
router.patch("/toggleFeatured/:id", authMiddlewares, toggleFeatured);
///approve_seller
router.patch("/approve_seller/:id", authMiddlewares, approve_seller);

///flash sale
router.post("/create_flash_sale", authMiddlewares, createFlashSale);

// Export the router


module.exports = router;
