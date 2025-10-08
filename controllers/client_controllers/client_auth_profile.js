const Joi = require("joi");
const validator = require("validator");
const User = require("../../models/user"); // import โมเดล User

// Schema สำหรับ validation
const shippingSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string()
    .pattern(/^[0-9]{8,15}$/) // เบอร์โทร 8-15 ตัวเลข
    .required(),
  province: Joi.string().required(),
  district: Joi.string().required(),
  village: Joi.string().required(),
  transportCompany: Joi.string().optional(),
  branch: Joi.string().optional(),
});

const add_shipping = async (req, res) => {
  try {
    const userId = req.id; // สมมติ middleware ใส่ req.id ให้
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Validate input ด้วย Joi
    const { error, value } = shippingSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        message:
          "ກະລຸນາກວດສອບຄວາມຖືກຕ້ອງຂອງຂໍ້ມູນເຊັ່ນເບີໂທຕ້ອງເບີລາວ ແລະ ຊື່ ທີ່ຢູ່",
        details: error.details.map((d) => d.message),
      });
    }

    // Sanitize input
    const sanitizedShipping = {
      name: validator.escape(value.name),
      phone: validator.escape(value.phone),
      province: validator.escape(value.province),
      district: validator.escape(value.district),
      village: validator.escape(value.village),
      transportCompany: value.transportCompany
        ? validator.escape(value.transportCompany)
        : "",
      branch: value.branch ? validator.escape(value.branch) : "",
    };

    // เพิ่ม shipping object ใหม่เข้า array ของ user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { shipping: sanitizedShipping } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Shipping added successfully",
      shipping: updatedUser.shipping,
    });
  } catch (error) {
    console.error("Add shipping error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const get_profile_client = async (req, res) => {
  try {
    const find_data = await User.findById(req.id).select("-password -__v");

    if (!find_data) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    res.status(200).json({
      data: find_data,
    });
  } catch (error) {
    console.error("❌ get_profile_client error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const update_shipping = async (req, res) => {
  try {
    const userId = req.id;

    // 1️⃣ สร้าง schema validation
    const schema = Joi.object({
      gender: Joi.string().valid("male", "female", "other").required(),
      birthDate: Joi.date().iso().required(),
      username: Joi.string().min(3).max(30).required(),
    });

    // 2️⃣ validate input
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        message: "Validation error",
        details: error.details.map((d) => d.message),
      });
    }

    // 3️⃣ update user safely
    const updatedUser = await User.findByIdAndUpdate(userId, value, {
      new: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 4️⃣ ส่ง response
    res.status(200).json({
      message: "Shipping updated successfully",
      shipping: updatedUser.shipping,
    });
  } catch (err) {
    console.error("Update shipping error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.update_shipping = update_shipping;

module.exports.add_shipping = add_shipping;
module.exports.get_profile_client = get_profile_client;
