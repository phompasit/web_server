const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { authMiddlewares } = require("../../middlewares/authMiddlewares");
const {
  add_product,
  get_products,
  delete_images_products,
  update_product,
  update_status,
} = require("../../controllers/seller_controllers/provider_sellers");
const {
  add_notication,
} = require("../../controllers/seller_controllers/notication");

///ລົງທະບຽນ user
router.post("/products", upload.array("images"), authMiddlewares, add_product);
router.get("/get-products", authMiddlewares, get_products);
router.delete(
  "/delete_images_products/:id/:index",
  authMiddlewares,
  delete_images_products
);
router.patch(
  "/update-products/:id",
  upload.array("images"),
  authMiddlewares,
  update_product
);
router.put("/update-status/:id", authMiddlewares, update_status);

router.post("/notication", authMiddlewares, add_notication);



module.exports = router;
