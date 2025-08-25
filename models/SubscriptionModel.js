const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  subscription: { type: Object, required: true },
});

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);

module.exports = SubscriptionModel;
