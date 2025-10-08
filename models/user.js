const { Schema, model } = require("mongoose");
const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: Number,
    },
    email: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: false,
    },
    agreeTerms: {
      type: Boolean,
    },
    ////client
    shipping: [
      {
        province: {
          type: String,
        },
        name: {
          type: String,
        },
        phone: {
          type: Number,
        },
        district: {
          type: String,
        },
        village: {
          type: String,
        },
        transportCompany: {
          type: String,
        },
        branch: {
          type: String,
        },
      },
    ],
    gender: {
      type: String,
    },
    birthDate: {
      type: Date,
    },
    coins: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);
userSchema.virtual("sellers_models", {
  ref: "sellers_models",
  localField: "_id",
  foreignField: "user_id",
});
userSchema.virtual("products_models", {
  ref: "products_models",
  localField: "_id",
  foreignField: "user_id",
});
userSchema.virtual("coupons_models", {
  ref: "coupons_models",
  localField: "_id",
  foreignField: "user_id",
});
userSchema.virtual("category_models", {
  ref: "Category_models",
  localField: "_id",
  foreignField: "user_id",
});
userSchema.virtual("Coupons_models", {
  ref: "Coupons_models",
  localField: "_id",
  foreignField: "applicable_stores",
});
userSchema.virtual("Cart", {
  ref: "Cart",
  localField: "_id",
  foreignField: "userId",
});
userSchema.virtual("Wishlist", {
  ref: "Wishlist",
  localField: "_id",
  foreignField: "userId",
});
userSchema.virtual("falsh_sales", {
  ref: "falsh_sales",
  localField: "_id",
  foreignField: "user_id",
});
userSchema.virtual("conversations", {
  ref: "Conversation_models",
  localField: "_id",
  foreignField: "participants",
});

userSchema.virtual("messages", {
  ref: "Message_models",
  localField: "_id",
  foreignField: "sender",
});
userSchema.virtual("Subscription", {
  ref: "Subscription",
  localField: "_id",
  foreignField: "userId",
});
module.exports = model("User_models", userSchema);
