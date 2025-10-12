const Users = require("../../models/sellers");

//ສຳລັບດືງຂໍ້ມູນຜູ້ຂາຍມາທັງໝົດ
const get_seller = async (req, res) => {
  try {
    const find_seller = await Users.find({ verificationStatus: "access" })
    const find_seller_all = await Users.find().populate("user_id")
    res.status(200).json({
      data: find_seller,
      all_seller:find_seller_all 
    });
  } catch (error) {
    console.error("❌ Error ", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
module.exports = {
  get_seller,
};
