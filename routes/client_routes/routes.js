const express = require("express");

const { authMiddlewares } = require("../../middlewares/authMiddlewares");
const {
  get__products,
  get__products_id,
  cart,
  get_cart,
  update_quantity,
  place_order,
  get_coupon,
  discount,
  cancelCoupon,
  couponHold,
  get_temp_order,
  wishlist_add,
  get_wishlist,
  get_wishlist_all,
  delete_cart_item_products,
  delete_items,
  get_home_products,
  get_related_products,
  update_carts,
} = require("../../controllers/client_controllers/products");
const {
  add_shipping,
  get_profile_client,
  update_profile_client,
  update_shipping,
} = require("../../controllers/client_controllers/client_auth_profile");
const router = express.Router();

///ລົງທະບຽນ user

///get-product-client
router.get("/get__products", get__products);
///get__products_id
router.get("/get__products_id/:id", get__products_id);
///cart
router.post("/cart", authMiddlewares, cart);
//get_cart
router.get("/get-cart", authMiddlewares, get_cart);
///delete_cart_item_products
router.delete(
  "/delete_cart_item_products/:cartId/:productId",
  authMiddlewares,
  delete_cart_item_products
);
///update_quantity
router.patch("/update_quantity/:id", authMiddlewares, update_quantity);

///place_order
router.post("/place_order", authMiddlewares, place_order);
//get_coupon
router.get("/get-coupon", get_coupon);
///discount
router.post("/discount", authMiddlewares, discount);
///cancel coupon
router.post("/cancelCoupon", authMiddlewares, cancelCoupon);
///get-couponhold
router.get("/couponHold", authMiddlewares, couponHold);
///
router.post("/client_address", authMiddlewares, add_shipping);
//get_profile_client
router.get("/get_profile_client", authMiddlewares, get_profile_client);
router.patch("/update_profile_client", authMiddlewares, update_shipping);
///order
router.get("/get_temp_order/:id", authMiddlewares, get_temp_order);
//wishlist
router.post("/wishlist", authMiddlewares, wishlist_add);
//get_wishlist
router.get("/get_wishlist/:productId", authMiddlewares, get_wishlist);
//get_wishlist_all
router.get("/get_wishlist_all", authMiddlewares, get_wishlist_all);

///delete_items_cart
router.delete(
  "/delete_items/:cartId/:cart_id/:id",
  authMiddlewares,
  delete_items
);
///get_home_products

router.get("/get_home_products", get_home_products);
// get_related_products
router.get("/get_related_products/:id", get_related_products);

///update_cart 
router.put('/update_cart/:cartId/:cart_id/:id', authMiddlewares,update_carts) 
router.post("/webhook", async (req, res) => {
  const data = req.body;

  console.log("Received webhook:", data);

  // ตรวจสอบ status
  if (data.status === "PAYMENT_COMPLETED") {
    // อัปเดต order เป็น paid
    await Order.findOneAndUpdate(
      { _id: data.billNumber }, // หรือใช้ transactionId
      { status: "paid" }
    );
  }
  console.log("good");
  // ตอบกลับ 200 ให้ Phapay รู้ว่า webhook รับเรียบร้อย
  res.status(200).send("OK");
});

module.exports = router;
