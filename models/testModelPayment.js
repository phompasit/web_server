const { Schema, model } = require("mongoose");
const test_paymentSchema = new Schema(
  {
    amount: {
      type: String,
    },
    transactionId: {
      type: String,
    },
    status: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = model("test_payment", test_paymentSchema);
