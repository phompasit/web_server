const express = require("express");
const {
  register_user_auth,
  login,
  get_user,
  verifyUserCreate,
  getVerifyUser,
  updateSellerReject,
  updateSeller,
  update_access_seller,
  unsubscribe,
  remove_logout,
  get_seller,
  get_sellers,
  statusActive_seller,
  deleteAddress,
} = require("../../controllers/auth_controllers/auth");
const {
  authMiddlewares,
  registerLimiter,
} = require("../../middlewares/authMiddlewares");
const router = express.Router();
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });
///ລົງທະບຽນ user
router.post("/register", registerLimiter, register_user_auth);
router.post("/buyer/login", registerLimiter, (req, res) =>
  login(req, res, ["client"])
);
router.post("/login", registerLimiter, (req, res) =>
  login(req, res, ["sellers", "admin"])
);
router.get("/get-user", authMiddlewares, get_user);
///create seller
router.post(
  "/verify-user",
  upload.fields([{ name: "idCardImage" }, { name: "selfieImage" }]),
  authMiddlewares,
  verifyUserCreate
);
///get seller
router.get("/get-verify-user", authMiddlewares, getVerifyUser);
///update seller reject
router.put(
  "/update-seller-fix/:id",
  upload.fields([{ name: "idCardImage" }, { name: "selfieImage" }]),
  authMiddlewares,
  updateSellerReject
);
///update seller
router.put(
  "/update-seller",
  upload.fields([{ name: "store_images" }, { name: "bank_account_images" }]),
  authMiddlewares,
  updateSeller
);
//check token
// Check Auth Route
router.get("/check-auth", authMiddlewares, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user,
    token: req.token,
    active: req.active,
    success: true,
  });
});
///update_access_seller
router.put("/update_access_seller/:id", authMiddlewares, update_access_seller);
router.delete("/unsubscribeNotification/:id", authMiddlewares, unsubscribe);

///
router.delete("/remove_logout", remove_logout);

///get_seller id
router.get("/get_seller/:userId", get_seller);
///get_seller All
router.get("/get_sellers_all", get_sellers);
///statusActive_seller block seller
router.patch(
  "/statusActive_seller/:userId",
  authMiddlewares,
  statusActive_seller
);

 router.delete("/address/:addressId", authMiddlewares, deleteAddress);
module.exports = router;
