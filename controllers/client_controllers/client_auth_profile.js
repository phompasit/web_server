const User = require("../../models/user"); // สมมติโมเดลชื่อ User

const add_shipping = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const userId = req.id;
    // เพิ่ม shipping object ใหม่เข้า shipping array ของ user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          shipping: {
            name,
            phone,
            address,
          },
        },
      },
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
    const find_data = await User.findById(req.id);

    res.status(200).json({
      data: find_data,
    });
  } catch (error) {
    console.error("Add shipping error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const update_shipping = async (req, res) => {
  try {
    const { gender, birthDate, username } = req.body;
    const userId = req.id;
    // ใช้ positional operator เพื่ออัปเดตรายการใน shipping array
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { gender, birthDate, username },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User or Shipping not found" });
    }

    res.status(200).json({
      message: "Shipping updated successfully",
      shipping: updatedUser.shipping,
    });
  } catch (error) {
    console.error("Update shipping error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.update_shipping = update_shipping;

module.exports.add_shipping = add_shipping;
module.exports.get_profile_client = get_profile_client;
