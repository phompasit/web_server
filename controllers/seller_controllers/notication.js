const Notification = require("../../models/SubscriptionModel");
const add_notication = async (req, res) => {
  try {
    const { id } = req;
    const { subscription } = req.body;
    const checkId = await Notification.findOne({userId:id})
    if(checkId){
      return res.status(404).json({ message: "คุนเปีดอนุมัดแจ้งเตือนแล้ว ไม่สาดกดอีก" });
    }
    const data = new Notification({
      userId: id,
      subscription: subscription,
    });
    await data.save();
    return res.status(200).json({ message: "คุนเปีดอนุมัดแจ้งเตือนแล้ว" });
  } catch (error) {
    console.error("❌ Error updating product:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
module.exports.add_notication = add_notication;
