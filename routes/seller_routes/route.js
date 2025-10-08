const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const {
  authMiddlewares,
  authorizeRoles,
} = require("../../middlewares/authMiddlewares");
const {
  add_product,
  get_products,
  delete_images_products,
  update_product,
  update_status,
  get_order,
  update_status_shipping,
  update_add_trackingAndImages,
} = require("../../controllers/seller_controllers/provider_sellers");
const {
  add_notication,
} = require("../../controllers/seller_controllers/notication");

///ລົງທະບຽນ user
router.post(
  "/products",
  upload.array("images"),
  authMiddlewares,
  authorizeRoles("sellers"),
  add_product
);
router.get(
  "/get-products",
  authMiddlewares,
  authorizeRoles("sellers"),
  get_products
);
router.delete(
  "/delete_images_products/:id/:index",
  authMiddlewares,

  authorizeRoles("sellers"),
  delete_images_products
);
router.patch(
  "/update-products/:id",
  upload.array("images"),
  authMiddlewares,
  authorizeRoles("sellers"),
  update_product
);
router.put(
  "/update-status/:id",
  authMiddlewares,
  authorizeRoles("sellers"),
  update_status
);

router.post("/notication", authMiddlewares, add_notication);

////
router.get("/get_order", authMiddlewares, authorizeRoles("sellers"), get_order);
////update_status_shipping
router.patch(
  "/update-status-shipping/:id",
  authMiddlewares,
  authorizeRoles("sellers"),
  update_status_shipping
);
router.patch(
  "/update_tracking/:orderId",
  upload.single("imagesShipping"),
  authMiddlewares,
  authorizeRoles("sellers"),
  update_add_trackingAndImages
);
module.exports = router;
