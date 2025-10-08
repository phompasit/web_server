const { Schema, model } = require("mongoose");
const orderSchema = new Schema(
  {
    user_id: {
      type: Schema.ObjectId,
      ref: "User_models",
      required: true,
    },
    orderId: {
      type: Number,
      unique: true,
    },
    items: [
      {
        productId: {
          type: Schema.ObjectId,
          ref: "products_models",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        size: {
          type: String,
        },
        color: {
          type: String,
        },
      },
    ],
    total: {
      type: Number,
      required: true,
    },
    fee_system: {
      type: Number,
    },
    total_summary: {
      type: Number,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    coupon: {
      type: Schema.ObjectId,
      ref: "Coupons_models",
    },
    couponHold: {
      type: Schema.ObjectId,
      ref: "CouponHold_models",
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL index
    },
    status: {
      type: String,
      enum: ["pending_payment", "completed", "expired", "PAYMENT_COMPLETED"],
      default: "pending_payment",
    },
    final_order_id: {
      type: Schema.ObjectId,
      ref: "Order_models",
    },
    transactionId: {
      type: String,
    },
    payment_time: {
      type: Date,
      default: Date.now,
    },
    refNo: {
      type: String,
    },
    qrcode: {
      type: String,
    },
    sourceName: {
      type: String,
    },
    exReferenceNo: {
      type: String,
    },
    sourceAccount: {
      type: String,
    },
    paymentMethod: { type: String, default: "BCEL" }, // หรือ BCEL/NiZPay
    subscriptionId: { type: String }, // ถ้าเป็น recurring
    selectedItems: {
      type: Array,
    },
    shipping_status: {
      type: String,
      enum: [
        "pending",
        "Pending",
        "Shipped",
        "Delivered",
        "returned",
        "Processing",
      ],
      default: "pending",
    },
    shippingAddress: {
      name: { type: String },
      phone: { type: String },
      province: { type: String },
      district: { type: String },
      village: { type: String },
      transportCompany: { type: String },
      branch: { type: String },
    },
    carrier: {
      type: String,
    }, //ບໍລິສັດຂົນສົ່ງ
    trackingNumber: {
      type: String,
    }, ////ລະຫັດຂົນສົ່ງ
    carrierPhone: {
      type: Number,
    }, ///ເບີໂທສາຍດ່ວນ
    imagesShipping: {
      type: String,
    }, ///ຮູບພາບຂົນສົ່ງ
    // ✅ Delivery steps (timeline)
    deliverySteps: [
      {
        step: {
          type: String,
          enum: [
            "order_placed", // ลูกค้าสั่งซื้อ
            "Processing", // กำลังแพ็คสินค้า
            "Shipped", // ส่งออก
            "in_transit", // อยู่ระหว่างทาง
            "out_for_delivery", // กำลังนำส่ง
            "Delivered", // จัดส่งสำเร็จ
            "returned", // ตีกลับ
          ],
          required: true,
        },
        note: { type: String }, // ข้อความอธิบายเพิ่มเติม
        timestamp: { type: Date, default: Date.now }, // เวลาอัพเดท
      },
    ],
  },
  { timestamps: true }
);
orderSchema.virtual("Transaction", {
  ref: "Transaction",
  localField: "_id",
  foreignField: "order_id",
});
orderSchema.virtual("Notification", {
  ref: "Notification",
  localField: "_id",
  foreignField: "order_id",
});
module.exports = model("Order", orderSchema);
