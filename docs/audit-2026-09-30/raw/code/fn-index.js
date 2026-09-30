"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  placeOrder: () => placeOrder
});
module.exports = __toCommonJS(index_exports);
var import_v2 = require("firebase-functions/v2");
var import_https = require("firebase-functions/v2/https");
var import_firebase_functions = require("firebase-functions");
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");

// ../firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "ai-studio-applet-webapp-e9574",
  appId: "1:453256872100:web:22bc084955800000cb6631",
  apiKey: "AIzaSyB3FrzDJys3Kd8B_TXqLCKSWy5uGTKlZr0",
  authDomain: "ai-studio-applet-webapp-e9574.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-manstyle-2b22f2fb-6b7b-4e97-90a0-bda904528869",
  storageBucket: "ai-studio-applet-webapp-e9574.firebasestorage.app",
  messagingSenderId: "453256872100",
  measurementId: "",
  oAuthClientId: "453256872100-iconn1p7cpvqoktm8aqt8kl3hs6o2v4u.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// ../src/shared/orderApi.ts
var FUNCTIONS_REGION = "europe-west1";

// ../src/shared/orderDate.ts
function formatOrderDate(at) {
  return at.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow"
  });
}

// ../src/shared/orderPricing.ts
var DEFAULT_FREE_DELIVERY_THRESHOLD = 5e3;
var QUICK_ORDER_DELIVERY_ID = "quick-order";
var QUICK_ORDER_DELIVERY_TITLE = "\u042D\u043A\u0441\u043F\u0440\u0435\u0441\u0441 \u043A\u0443\u0440\u044C\u0435\u0440 (1 \u043A\u043B\u0438\u043A)";
function calcSubtotal(lines) {
  return lines.reduce((acc, line) => acc + line.price * line.quantity, 0);
}
function isRestricted(promo) {
  return Boolean(promo.applicableProductIds?.length || promo.applicableCategories?.length);
}
function calcEligibleSubtotal(lines, promo) {
  if (promo.applicableProductIds && promo.applicableProductIds.length > 0) {
    return calcSubtotal(lines.filter((l) => promo.applicableProductIds.includes(l.productId)));
  }
  if (promo.applicableCategories && promo.applicableCategories.length > 0) {
    return calcSubtotal(lines.filter((l) => l.category && promo.applicableCategories.includes(l.category)));
  }
  return calcSubtotal(lines);
}
function calcPromoDiscount(lines, promo) {
  if (!promo) return 0;
  const base = calcEligibleSubtotal(lines, promo);
  if (promo.discountType === "fixed" && promo.discountValue) {
    return Math.min(base, promo.discountValue);
  }
  if (promo.discountPercent) {
    return Math.round(base * promo.discountPercent / 100);
  }
  if (promo.discountValue) {
    return Math.round(base * promo.discountValue / 100);
  }
  return 0;
}
function validatePromo(promo, lines, now = Date.now()) {
  if (!promo.active) {
    return "\u0421\u0440\u043E\u043A \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434\u0430 \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0438\u043B\u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D";
  }
  if (promo.usageLimit && (promo.usedCount || 0) >= promo.usageLimit) {
    return "\u041B\u0438\u043C\u0438\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0439 \u0434\u0430\u043D\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434\u0430 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D";
  }
  if (promo.expiresAt && promo.expiresAt.includes("-")) {
    const expTime = new Date(promo.expiresAt).getTime();
    if (!isNaN(expTime) && expTime < now) {
      return `\u0421\u0440\u043E\u043A \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434\u0430 ${promo.code} \u0438\u0441\u0442\u0435\u043A`;
    }
  }
  const subtotal = calcSubtotal(lines);
  if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
    return `\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u0437\u0430\u043A\u0430\u0437\u0430 \u0434\u043B\u044F \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434\u0430 ${promo.code}: ${promo.minOrderAmount.toLocaleString("ru-RU")} \u20BD (\u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0435: ${subtotal.toLocaleString("ru-RU")} \u20BD)`;
  }
  if (lines.length > 0 && isRestricted(promo) && calcEligibleSubtotal(lines, promo) === 0) {
    return promo.applicableProductIds?.length ? `\u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434 ${promo.code} \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u0432\u0430\u0440\u044B` : `\u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434 ${promo.code} \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 (\u0440\u0443\u0431\u0430\u0448\u043A\u0438, \u043F\u0438\u0434\u0436\u0430\u043A\u0438 \u0438 \u0434\u0440.)`;
  }
  return null;
}
function getAvailableDeliveryMethods(methods, settings, subtotal) {
  const freeThreshold = settings?.freeDeliveryThreshold ?? DEFAULT_FREE_DELIVERY_THRESHOLD;
  const isExpressAllowed = settings?.isExpressEnabled !== false;
  return methods.filter((d) => d.isActive !== false).map((d) => {
    let effectivePrice = d.price;
    const threshold = d.freeThreshold !== void 0 ? d.freeThreshold : freeThreshold;
    if (threshold > 0 && subtotal >= threshold) {
      effectivePrice = 0;
    } else if (d.id === "courier" && settings?.courierDeliveryPrice !== void 0) {
      effectivePrice = subtotal >= freeThreshold ? 0 : settings.courierDeliveryPrice;
    } else if (d.id === "pickup" && settings?.pickupDeliveryPrice !== void 0) {
      effectivePrice = settings.pickupDeliveryPrice;
    } else if (d.id === "post" && settings?.postDeliveryPrice !== void 0) {
      effectivePrice = settings.postDeliveryPrice;
    }
    return { ...d, price: effectivePrice };
  }).filter((d) => !(d.id === "express" && !isExpressAllowed));
}
function calcOrderTotals(lines, promo, deliveryFee) {
  const subtotal = calcSubtotal(lines);
  const discount = calcPromoDiscount(lines, promo);
  return {
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee)
  };
}

// ../src/utils/inventory.ts
function extractColorName(color) {
  if (!color) return "";
  if (typeof color === "string") return color;
  if (typeof color === "object" && color !== null && "name" in color && typeof color.name === "string") {
    return color.name;
  }
  return String(color);
}
function extractSizeName(size) {
  if (size === void 0 || size === null) return "";
  if (typeof size === "string") return size;
  return String(size);
}
function generateSkuCode(product, color, size, prefix = "MS") {
  const catCode = product.category ? product.category.slice(0, 2).toUpperCase() : "PR";
  const idNum = (product.id ? String(product.id) : "01").replace(/[^0-9]/g, "").slice(0, 2) || "01";
  const colorStr = extractColorName(color);
  const colorCode = colorStr.slice(0, 3).toUpperCase().replace(/[^A-ZА-Я0-9]/g, "CLR") || "DEF";
  const sizeStr = extractSizeName(size) || "M";
  return `${prefix}-${catCode}${idNum}-${colorCode}-${sizeStr}`.toUpperCase();
}
function generateDefaultSKUs(product) {
  const skus = [];
  const colors = product.colors && product.colors.length > 0 ? product.colors : [{ name: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439", hex: "#2D3A4E" }];
  const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : ["M", "L"];
  colors.forEach((color) => {
    const colorName = extractColorName(color);
    sizes.forEach((size) => {
      const sizeName = extractSizeName(size);
      skus.push({
        id: `${product.id || "P"}-${colorName}-${sizeName}`,
        color: colorName,
        size: sizeName,
        stock: 0,
        skuCode: generateSkuCode(product, colorName, sizeName)
      });
    });
  });
  return skus;
}
function isHiddenFromSale(product) {
  return product.inStock === false && (product.skus ?? []).some((s) => s.stock > 0);
}

// ../src/utils/deliveryStages.ts
function isRussianPostDelivery(deliveryMethodOrOrder, trackingCompanyParam) {
  if (!deliveryMethodOrOrder) return false;
  let dm = "";
  let tc = trackingCompanyParam || "";
  if (typeof deliveryMethodOrOrder === "object") {
    dm = deliveryMethodOrOrder.deliveryMethod || "";
    tc = tc || deliveryMethodOrOrder.trackingCompany || "";
  } else {
    dm = deliveryMethodOrOrder;
  }
  const dmLower = dm.toLowerCase().trim();
  const tcLower = tc.toLowerCase().trim();
  return tcLower === "pochta" || tcLower === "post" || dmLower.includes("\u043F\u043E\u0447\u0442") || dmLower.includes("post") || dmLower.includes("\u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 1-\u0433\u043E \u043A\u043B\u0430\u0441\u0441\u0430");
}
function isPickupDelivery(deliveryMethodOrOrder) {
  if (!deliveryMethodOrOrder) return false;
  let dm = "";
  if (typeof deliveryMethodOrOrder === "object") {
    dm = deliveryMethodOrOrder.deliveryMethod || "";
  } else {
    dm = deliveryMethodOrOrder;
  }
  const dmLower = dm.toLowerCase().trim();
  return dmLower.includes("\u0441\u0430\u043C\u043E\u0432\u044B\u0432\u043E\u0437") || dmLower.includes("\u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438") || dmLower.includes("\u0431\u0443\u0442\u0438\u043A") || dmLower.includes("\u0448\u043E\u0443\u0440\u0443\u043C") || dmLower.includes("pickup");
}
function isTransportCompanyDelivery(deliveryMethodOrOrder, trackingCompanyParam) {
  if (!deliveryMethodOrOrder) return false;
  let deliveryMethod = "";
  let trackingCompany = trackingCompanyParam || "";
  if (typeof deliveryMethodOrOrder === "object") {
    deliveryMethod = deliveryMethodOrOrder.deliveryMethod || "";
    trackingCompany = trackingCompany || deliveryMethodOrOrder.trackingCompany || "";
  } else {
    deliveryMethod = deliveryMethodOrOrder;
  }
  const dm = deliveryMethod.toLowerCase().trim();
  const tc = trackingCompany.toLowerCase().trim();
  const hasTKCompany = ["cdek", "pochta", "post", "boxberry", "dpd", "dhl", "dellin", "pek"].includes(tc) || dm.includes("\u0441\u0434\u044D\u043A") || dm.includes("cdek") || dm.includes("\u043F\u043E\u0447\u0442\u0430") || dm.includes("\u043F\u043E\u0447\u0442\u043E\u0439") || dm.includes("post") || dm.includes("boxberry") || dm.includes("\u0431\u043E\u043A\u0441\u0431\u0435\u0440\u0440\u0438") || dm.includes("\u0434\u0435\u043B\u043E\u0432\u044B\u0435 \u043B\u0438\u043D\u0438\u0438") || dm.includes("\u043F\u044D\u043A") || dm.includes("dpd") || dm.includes("dhl") || dm.includes("\u0441\u0431\u0435\u0440\u043B\u043E\u0433\u0438\u0441\u0442\u0438\u043A\u0430") || dm.includes("\u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D") || dm.includes(" \u0442\u043A") || dm.startsWith("\u0442\u043A ");
  return hasTKCompany;
}
function formatDeliveryTimestamp(dateInput) {
  const d = dateInput ? new Date(dateInput) : /* @__PURE__ */ new Date();
  if (isNaN(d.getTime())) {
    return typeof dateInput === "string" && dateInput.trim() ? dateInput : "\u0421\u0435\u0433\u043E\u0434\u043D\u044F";
  }
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function getSynchronizedDeliveryStages(order, overrideStatus) {
  const currentStatus = overrideStatus || order.status || "accepted";
  const existingStages = Array.isArray(order.deliveryStages) && order.deliveryStages.length >= 5 ? order.deliveryStages : [];
  const orderDate = order.date || formatDeliveryTimestamp();
  const isPost = isRussianPostDelivery(order.deliveryMethod, order.trackingCompany);
  const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
  const isPickup = isPickupDelivery(order.deliveryMethod);
  const isExpress = (order.deliveryMethod || "").toLowerCase().includes("\u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441") || (order.deliveryMethod || "").toLowerCase().includes("express");
  const hasTrack = isTK && !!order.trackingNumber;
  if (order.isCancelled) {
    return existingStages.map((stage, idx) => {
      if (idx === 0) {
        return {
          ...stage,
          id: stage.id || "stage-accepted",
          title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D",
          desc: "\u0417\u0430\u044F\u0432\u043A\u0430 \u0431\u044B\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0432 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442-\u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435",
          status: "completed",
          time: stage.time && !stage.time.includes("\u041E\u0436\u0438\u0434\u0430\u0435\u0442") ? stage.time : orderDate
        };
      }
      return {
        ...stage,
        status: "pending",
        time: "\u0417\u0430\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0435\u043D",
        desc: "\u042D\u0442\u0430\u043F \u043E\u0442\u043C\u0435\u043D\u0435\u043D \u0432 \u0441\u0432\u044F\u0437\u0438 \u0441 \u043E\u0442\u043C\u0435\u043D\u043E\u0439 \u0437\u0430\u043A\u0430\u0437\u0430"
      };
    });
  }
  const getStage3Title = (status) => {
    if (isPost) {
      if (status === "accepted" || status === "assembling") {
        return hasTrack ? `\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432 \u041F\u043E\u0447\u0442\u0443 \u0420\u043E\u0441\u0441\u0438\u0438 (${order.trackingNumber})` : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432 \u041F\u043E\u0447\u0442\u0443 \u0420\u043E\u0441\u0441\u0438\u0438";
      }
      if (status === "in_transit") {
        return hasTrack ? `\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u041F\u043E\u0447\u0442\u0443 \u0420\u043E\u0441\u0441\u0438\u0438 (${order.trackingNumber})` : "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u041F\u043E\u0447\u0442\u0443 \u0420\u043E\u0441\u0441\u0438\u0438";
      }
      return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438";
    }
    if (isTK) {
      if (status === "accepted" || status === "assembling") {
        return hasTrack ? `\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432 \u0422\u041A (${order.trackingNumber})` : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E";
      }
      return hasTrack ? `\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E (${order.trackingNumber})` : "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E";
    }
    if (isPickup) {
      if (status === "accepted" || status === "assembling") {
        return "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
      }
      return "\u041F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
    }
    if (isExpress) {
      if (status === "accepted" || status === "assembling") {
        return "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440\u0430";
      }
      return "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440\u0443";
    }
    if (status === "accepted" || status === "assembling") {
      return "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u043A\u0443\u0440\u044C\u0435\u0440\u0443";
    }
    return "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0448\u0442\u0430\u0442\u043D\u043E\u043C\u0443 \u043A\u0443\u0440\u044C\u0435\u0440\u0443";
  };
  const getStage3Desc = (status) => {
    if (isPost) {
      if (status === "accepted" || status === "assembling") {
        return hasTrack ? `\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u043E\u0447\u0442\u043E\u0432\u0430\u044F \u043D\u0430\u043A\u043B\u0430\u0434\u043D\u0430\u044F ${order.trackingNumber}. \u0417\u0430\u043A\u0430\u0437 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438` : "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446 \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u043F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435";
      }
      return hasTrack ? `\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0441 \u0442\u0440\u0435\u043A-\u043D\u043E\u043C\u0435\u0440\u043E\u043C ${order.trackingNumber} \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0432 \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043E\u0447\u043D\u043E\u043C \u0446\u0435\u043D\u0442\u0440\u0435 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438` : "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430 \u043A \u043F\u0435\u0440\u0435\u0441\u044B\u043B\u043A\u0435 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438";
    }
    if (isTK) {
      return hasTrack ? `\u041F\u0440\u0438\u0441\u0432\u043E\u0435\u043D \u0442\u0440\u0435\u043A-\u043D\u043E\u043C\u0435\u0440 ${order.trackingNumber} \u0438 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043D\u0430\u043A\u043B\u0430\u0434\u043D\u0430\u044F \u0422\u041A` : "\u0417\u0430\u043A\u0430\u0437 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F \u043A \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0435 \u0432 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E";
    }
    if (isPickup) {
      return "\u0417\u0430\u043A\u0430\u0437 \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0430\u0435\u0442\u0441\u044F \u0441\u043E \u0441\u043A\u043B\u0430\u0434\u0430 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
    }
    if (isExpress) {
      return "\u0421\u0440\u043E\u0447\u043D\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u043A\u0443\u0440\u044C\u0435\u0440\u0443 \u0434\u043B\u044F \u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438";
    }
    return "\u0417\u0430\u043A\u0430\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u043A\u0443\u0440\u044C\u0435\u0440\u0443 \u0434\u043B\u044F \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443";
  };
  const getStage4Title = (status) => {
    if (isPost) {
      if (status === "ready") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043F\u0440\u0438\u0431\u044B\u043B\u0430 \u0432 \u043F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435";
      if (status === "delivered") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0430 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0432\u044B\u0434\u0430\u0447\u0438";
      if (status === "in_transit") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0432 \u043F\u0443\u0442\u0438 \u0432 \u043F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435";
      return "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438";
    }
    if (isPickup) {
      if (status === "ready") return "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432 \u043F\u0443\u043D\u043A\u0442\u0435 \u0432\u044B\u0434\u0430\u0447\u0438";
      if (status === "delivered") return "\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
      if (status === "in_transit") return "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
      return "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438";
    }
    if (isExpress) {
      if (status === "ready") return "\u042D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440 \u043F\u0440\u0438\u0431\u044B\u043B \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443";
      if (status === "delivered") return "\u042D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440 \u0434\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u0437\u0430\u043A\u0430\u0437";
      return "\u042D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443";
    }
    if (isTK) {
      if (status === "ready") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0432 \u043F\u0443\u043D\u043A\u0442\u0435 \u0432\u044B\u0434\u0430\u0447\u0438 \u0422\u041A";
      if (status === "delivered") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0430 \u0422\u041A";
      return "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u0433\u043E\u0440\u043E\u0434 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F";
    }
    if (status === "ready") return "\u041A\u0443\u0440\u044C\u0435\u0440 \u043F\u0440\u0438\u0431\u044B\u043B \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443";
    if (status === "delivered") return "\u041A\u0443\u0440\u044C\u0435\u0440 \u0434\u043E\u0441\u0442\u0430\u0432\u0438\u043B \u0437\u0430\u043A\u0430\u0437";
    return "\u041A\u0443\u0440\u044C\u0435\u0440 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443";
  };
  const getStage4Desc = (status) => {
    if (isPost) {
      if (status === "ready") return `\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443: ${order.deliveryAddress || "\u041F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435"}`;
      return `\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0432 \u043F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443: ${order.deliveryAddress || "\u041F\u043E\u0447\u0442\u043E\u0432\u044B\u0439 \u0438\u043D\u0434\u0435\u043A\u0441"}`;
    }
    if (isPickup) {
      return `\u0410\u0434\u0440\u0435\u0441 \u043F\u0443\u043D\u043A\u0442\u0430 \u0432\u044B\u0434\u0430\u0447\u0438: ${order.deliveryAddress || "\u0431\u0443\u0442\u0438\u043A \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430"}`;
    }
    if (isTK) {
      return `\u0410\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438: ${order.deliveryAddress || "\u0413\u043E\u0440\u043E\u0434 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F"}`;
    }
    return `\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443: ${order.deliveryAddress || "\u0410\u0434\u0440\u0435\u0441 \u043A\u043B\u0438\u0435\u043D\u0442\u0430"}`;
  };
  const getStage5Title = (status) => {
    if (isPost) {
      if (status === "delivered") return "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0432\u0440\u0443\u0447\u0435\u043D\u0430 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438";
      if (status === "ready") return "\u0413\u043E\u0442\u043E\u0432 \u043A \u0432\u044B\u0434\u0430\u0447\u0435 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438";
      return "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u044B\u043B\u043A\u0438 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438";
    }
    if (isPickup) {
      if (status === "delivered") return "\u0417\u0430\u043A\u0430\u0437 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0432 \u043F\u0443\u043D\u043A\u0442\u0435 \u0432\u044B\u0434\u0430\u0447\u0438";
      return "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u0430 \u0432 \u043F\u0443\u043D\u043A\u0442\u0435 \u0432\u044B\u0434\u0430\u0447\u0438";
    }
    if (status === "delivered") return "\u0417\u0430\u043A\u0430\u0437 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0432\u0440\u0443\u0447\u0435\u043D \u043A\u043B\u0438\u0435\u043D\u0442\u0443";
    return "\u0412\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0443";
  };
  const getStage5Desc = (status) => {
    if (isPost) {
      return "\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u0435 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u0438\u043B\u0438 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0438\u0437 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438 \u0434\u043B\u044F \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F";
    }
    if (isPickup) {
      return "\u041F\u0440\u0438\u043C\u0435\u0440\u043A\u0430 \u0432 \u043A\u043E\u043C\u0444\u043E\u0440\u0442\u043D\u044B\u0445 \u0437\u0430\u043B\u0430\u0445 \u0431\u0443\u0442\u0438\u043A\u0430, \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0447\u0435\u043A\u0430";
    }
    return "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E, \u043F\u0440\u0438\u043C\u0435\u0440\u043A\u0430 \u0438 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0447\u0435\u043A\u0430";
  };
  if (currentStatus === "accepted") {
    return [
      {
        id: "stage-accepted",
        title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D",
        desc: isPost ? "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438" : isPickup ? "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438 \u0434\u043B\u044F \u0441\u0430\u043C\u043E\u0432\u044B\u0432\u043E\u0437\u0430" : "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0438 \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438",
        status: "completed",
        time: existingStages[0]?.status === "completed" && existingStages[0]?.time && !existingStages[0]?.time.includes("\u041E\u0436\u0438\u0434\u0430\u0435\u0442") ? existingStages[0].time : orderDate
      },
      {
        id: "stage-assembled",
        title: "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
        desc: isPost ? "\u0422\u043E\u0432\u0430\u0440\u044B \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u044B \u043F\u043E \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u0443 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438" : "\u0422\u043E\u0432\u0430\u0440\u044B \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u043B\u0435\u0440\u043E\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u044B",
        status: "pending",
        time: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0441\u0431\u043E\u0440\u043A\u0438"
      },
      {
        id: "stage-carrier",
        title: getStage3Title("accepted"),
        desc: getStage3Desc("accepted"),
        status: "pending",
        time: hasTrack ? "\u0422\u0440\u0435\u043A \u043F\u0440\u0438\u0441\u0432\u043E\u0435\u043D" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438"
      },
      {
        id: "stage-transit",
        title: getStage4Title("accepted"),
        desc: getStage4Desc("accepted"),
        status: "pending",
        time: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438"
      },
      {
        id: "stage-delivered",
        title: getStage5Title("accepted"),
        desc: getStage5Desc("accepted"),
        status: "pending",
        time: order.estimatedDelivery || "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F"
      }
    ];
  }
  if (currentStatus === "assembling") {
    return [
      {
        id: "stage-accepted",
        title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D",
        desc: isPost ? "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438" : "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0438 \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438",
        status: "completed",
        time: existingStages[0]?.time || orderDate
      },
      {
        id: "stage-assembled",
        title: "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
        desc: isPost ? "\u0421\u0431\u043E\u0440\u0449\u0438\u043A \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0443\u0435\u0442 \u0442\u043E\u0432\u0430\u0440\u044B \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u044B\u0432\u0430\u0435\u0442 \u043F\u043E\u0441\u044B\u043B\u043A\u0443" : "\u0421\u0431\u043E\u0440\u0449\u0438\u043A \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0443\u0435\u0442 \u0442\u043E\u0432\u0430\u0440\u044B \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u043E \u0437\u0430\u043A\u0430\u0437\u0443",
        status: "active",
        time: "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435 \u0441\u0431\u043E\u0440\u043A\u0438"
      },
      {
        id: "stage-carrier",
        title: getStage3Title("assembling"),
        desc: getStage3Desc("assembling"),
        status: "pending",
        time: hasTrack ? "\u0422\u0440\u0435\u043A \u043F\u0440\u0438\u0441\u0432\u043E\u0435\u043D" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438"
      },
      {
        id: "stage-transit",
        title: getStage4Title("assembling"),
        desc: getStage4Desc("assembling"),
        status: "pending",
        time: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438"
      },
      {
        id: "stage-delivered",
        title: getStage5Title("assembling"),
        desc: getStage5Desc("assembling"),
        status: "pending",
        time: order.estimatedDelivery || "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F"
      }
    ];
  }
  if (currentStatus === "in_transit") {
    return [
      {
        id: "stage-accepted",
        title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D",
        desc: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0438 \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438",
        status: "completed",
        time: existingStages[0]?.time || orderDate
      },
      {
        id: "stage-assembled",
        title: "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
        desc: "\u0422\u043E\u0432\u0430\u0440\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u043B\u0435\u0440\u043E\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u044B",
        status: "completed",
        time: existingStages[1]?.time && !existingStages[1].time.includes("\u041E\u0436\u0438\u0434\u0430\u0435\u0442") ? existingStages[1].time : "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D"
      },
      {
        id: "stage-carrier",
        title: getStage3Title("in_transit"),
        desc: getStage3Desc("in_transit"),
        status: "completed",
        time: isPost ? "\u041F\u0440\u0438\u043D\u044F\u0442\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u0441\u0432\u044F\u0437\u0438" : "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443"
      },
      {
        id: "stage-transit",
        title: getStage4Title("in_transit"),
        desc: getStage4Desc("in_transit"),
        status: "active",
        time: isPost ? "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isPickup ? "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u043F\u0443\u043D\u043A\u0442" : isExpress ? "\u042D\u043A\u0441\u043F\u0440\u0435\u0441\u0441 \u0432 \u043F\u0443\u0442\u0438" : "\u041A\u0443\u0440\u044C\u0435\u0440 \u0432 \u043F\u0443\u0442\u0438"
      },
      {
        id: "stage-delivered",
        title: getStage5Title("in_transit"),
        desc: getStage5Desc("in_transit"),
        status: "pending",
        time: order.estimatedDelivery || "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F"
      }
    ];
  }
  if (currentStatus === "ready") {
    return [
      {
        id: "stage-accepted",
        title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D",
        desc: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0438 \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438",
        status: "completed",
        time: existingStages[0]?.time || orderDate
      },
      {
        id: "stage-assembled",
        title: "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
        desc: "\u0422\u043E\u0432\u0430\u0440\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u043B\u0435\u0440\u043E\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u044B",
        status: "completed",
        time: existingStages[1]?.time || "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D"
      },
      {
        id: "stage-carrier",
        title: getStage3Title("ready"),
        desc: getStage3Desc("ready"),
        status: "completed",
        time: isPost ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isPickup ? "\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u043E \u0432 \u0431\u0443\u0442\u0438\u043A" : "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0433\u043E\u0440\u043E\u0434"
      },
      {
        id: "stage-transit",
        title: getStage4Title("ready"),
        desc: getStage4Desc("ready"),
        status: "completed",
        time: isPost ? "\u041F\u0440\u0438\u0431\u044B\u043B\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isPickup ? "\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B \u0432 \u0431\u0443\u0442\u0438\u043A" : "\u041F\u0440\u0438\u0431\u044B\u043B \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443"
      },
      {
        id: "stage-delivered",
        title: getStage5Title("ready"),
        desc: getStage5Desc("ready"),
        status: "active",
        time: isPost ? "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438" : isPickup ? "\u0413\u043E\u0442\u043E\u0432 \u043A \u0432\u044B\u0434\u0430\u0447\u0435" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F"
      }
    ];
  }
  return [
    {
      id: "stage-accepted",
      title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D",
      desc: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043F\u0440\u0438\u043D\u044F\u043B \u0437\u0430\u044F\u0432\u043A\u0443 \u0438 \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043B \u043F\u043E\u0437\u0438\u0446\u0438\u0438",
      status: "completed",
      time: existingStages[0]?.time || orderDate
    },
    {
      id: "stage-assembled",
      title: "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
      desc: "\u0422\u043E\u0432\u0430\u0440\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u043B\u0435\u0440\u043E\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u044B",
      status: "completed",
      time: existingStages[1]?.time && !existingStages[1].time.includes("\u041E\u0436\u0438\u0434\u0430\u0435\u0442") ? existingStages[1].time : "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D"
    },
    {
      id: "stage-carrier",
      title: getStage3Title("delivered"),
      desc: getStage3Desc("delivered"),
      status: "completed",
      time: isPost ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u041F\u043E\u0447\u0442\u043E\u0439" : "\u041F\u0435\u0440\u0435\u0434\u0430\u043D \u0432 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443"
    },
    {
      id: "stage-transit",
      title: getStage4Title("delivered"),
      desc: getStage4Desc("delivered"),
      status: "completed",
      time: isPost ? "\u041F\u0440\u0438\u0431\u044B\u043B\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D"
    },
    {
      id: "stage-delivered",
      title: getStage5Title("delivered"),
      desc: getStage5Desc("delivered"),
      status: "completed",
      time: existingStages[4]?.time && !existingStages[4].time.includes("\u041E\u0436\u0438\u0434\u0430\u0435\u0442") ? existingStages[4].time : "\u0412\u0440\u0443\u0447\u0435\u043D\u043E \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044E"
    }
  ];
}
function getDefaultHistorySteps(order) {
  const status = order.status || "accepted";
  const orderDate = order.date || "\u0421\u0435\u0433\u043E\u0434\u043D\u044F";
  if (order.isCancelled) {
    return [
      {
        title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442",
        date: orderDate,
        completed: true,
        description: "\u0417\u0430\u043A\u0430\u0437 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435"
      },
      {
        title: "\u0417\u0430\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0435\u043D",
        date: order.cancelledAt || "\u041E\u0442\u043C\u0435\u043D\u0435\u043D",
        completed: true,
        description: order.cancelReason || "\u0417\u0430\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0435\u043D. \u0417\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u044B \u043D\u0430 \u0441\u043A\u043B\u0430\u0434."
      }
    ];
  }
  const isDelivered = status === "delivered";
  const isReady = status === "ready" || isDelivered;
  const isTransit = status === "in_transit" || isReady;
  const isAssembling = status === "assembling" || isTransit;
  const isPost = isRussianPostDelivery(order.deliveryMethod, order.trackingCompany);
  const isTK = isTransportCompanyDelivery(order.deliveryMethod, order.trackingCompany);
  const isPickup = isPickupDelivery(order.deliveryMethod);
  const isExpress = (order.deliveryMethod || "").toLowerCase().includes("\u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441") || (order.deliveryMethod || "").toLowerCase().includes("express");
  const transitTitle = isPost ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438" : isPickup ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0432 \u043F\u0443\u043D\u043A\u0442 \u0432\u044B\u0434\u0430\u0447\u0438" : isExpress ? "\u0421\u0440\u043E\u0447\u043D\u0430\u044F \u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430" : isTK ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u043E\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0435\u0439" : "\u0412 \u043F\u0443\u0442\u0438 \u043A\u0443\u0440\u044C\u0435\u0440\u043E\u043C";
  const transitDesc = isPost ? order.trackingNumber ? `\u041F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 (\u0442\u0440\u0435\u043A ${order.trackingNumber})` : "\u041F\u043E\u0447\u0442\u043E\u0432\u043E\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isTK && order.trackingNumber ? `\u0422\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F (\u0442\u0440\u0435\u043A-\u043D\u043E\u043C\u0435\u0440 ${order.trackingNumber})` : isPickup ? "\u0421\u0430\u043C\u043E\u0432\u044B\u0432\u043E\u0437 \u0438\u0437 \u0431\u0443\u0442\u0438\u043A\u0430 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430" : isExpress ? "\u0421\u0440\u043E\u0447\u043D\u0430\u044F \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u044D\u043A\u0441\u043F\u0440\u0435\u0441\u0441-\u043A\u0443\u0440\u044C\u0435\u0440\u043E\u043C" : "\u041A\u0443\u0440\u044C\u0435\u0440\u0441\u043A\u0430\u044F \u0441\u043B\u0443\u0436\u0431\u0430 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430";
  const readyTitle = isPost ? isDelivered ? "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0430 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438" : "\u041F\u0440\u0438\u0431\u044B\u043B\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0441\u0432\u044F\u0437\u0438 / \u0413\u043E\u0442\u043E\u0432\u043E \u043A \u0432\u044B\u0434\u0430\u0447\u0435" : isPickup ? isDelivered ? "\u0417\u0430\u043A\u0430\u0437 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0432 \u0431\u0443\u0442\u0438\u043A\u0435" : "\u0413\u043E\u0442\u043E\u0432 \u043A \u0432\u044B\u0434\u0430\u0447\u0435 \u0432 \u0431\u0443\u0442\u0438\u043A\u0435" : isTK ? isDelivered ? "\u0417\u0430\u043A\u0430\u0437 \u043F\u043E\u043B\u0443\u0447\u0435\u043D" : "\u0413\u043E\u0442\u043E\u0432 \u043A \u0432\u044B\u0434\u0430\u0447\u0435 / \u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D" : isDelivered ? "\u0417\u0430\u043A\u0430\u0437 \u0432\u0440\u0443\u0447\u0435\u043D \u043A\u0443\u0440\u044C\u0435\u0440\u043E\u043C" : "\u041A\u0443\u0440\u044C\u0435\u0440 \u043F\u0440\u0438\u0431\u044B\u043B / \u0412\u0440\u0443\u0447\u0435\u043D\u0438\u0435";
  return [
    {
      title: "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442",
      date: orderDate,
      completed: true,
      description: isPost ? "\u0417\u0430\u043A\u0430\u0437 \u043F\u0440\u0438\u043D\u044F\u0442 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u041F\u043E\u0447\u0442\u043E\u0439 \u0420\u043E\u0441\u0441\u0438\u0438" : "\u0417\u0430\u043A\u0430\u0437 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u043D \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D"
    },
    {
      title: "\u0421\u043E\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435",
      date: isAssembling ? status === "assembling" ? "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435 \u0441\u0431\u043E\u0440\u043A\u0438" : "\u0421\u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043E\u0432\u0430\u043D" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0441\u0431\u043E\u0440\u043A\u0438",
      completed: isAssembling,
      description: isPost ? "\u041A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0430\u0446\u0438\u044F \u0438 \u043D\u0430\u0434\u0435\u0436\u043D\u0430\u044F \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430 \u043F\u043E \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u0430\u043C \u041F\u043E\u0447\u0442\u044B" : "\u041A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0430\u0446\u0438\u044F \u0438 \u0431\u0435\u0440\u0435\u0436\u043D\u0430\u044F \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0430"
    },
    {
      title: transitTitle,
      date: isTransit ? status === "in_transit" ? isPost ? "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isPickup ? "\u0412 \u043F\u0443\u0442\u0438 \u0432 \u043F\u0443\u043D\u043A\u0442" : "\u041A\u0443\u0440\u044C\u0435\u0440 \u0432 \u043F\u0443\u0442\u0438" : isPost ? "\u041F\u0440\u0438\u0431\u044B\u043B\u043E \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435" : isPickup ? "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u0431\u0443\u0442\u0438\u043A" : "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u0433\u043E\u0440\u043E\u0434" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438",
      completed: isTransit,
      description: transitDesc
    },
    {
      title: readyTitle,
      date: isDelivered ? "\u0412\u0440\u0443\u0447\u0435\u043D\u043E \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044E" : order.estimatedDelivery || "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F",
      completed: isDelivered,
      description: isDelivered ? isPost ? "\u041F\u043E\u0441\u044B\u043B\u043A\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0430 \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u043E\u043C \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u0441\u0432\u044F\u0437\u0438" : "\u0417\u0430\u043A\u0430\u0437 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u0435\u043C" : isPost ? "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u043E\u043C \u0432 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0438 \u041F\u043E\u0447\u0442\u044B \u0420\u043E\u0441\u0441\u0438\u0438" : isPickup ? "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F \u0432 \u043F\u0443\u043D\u043A\u0442\u0435 \u0432\u044B\u0434\u0430\u0447\u0438" : "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0443 \u043A\u0443\u0440\u044C\u0435\u0440\u043E\u043C"
    }
  ];
}

// src/placeOrder.ts
var OrderError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "OrderError";
  }
  code;
};
var MAX_ITEMS = 50;
var MAX_QUANTITY = 99;
function requireString(value, field, maxLength, required = true) {
  if (value === void 0 || value === null || value === "") {
    if (required) throw new OrderError("invalid-argument", `\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u043F\u043E\u043B\u0435: ${field}`);
    return "";
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new OrderError("invalid-argument", `\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043F\u043E\u043B\u0435: ${field}`);
  }
  return value.trim();
}
function parsePlaceOrderRequest(data) {
  if (!data || typeof data !== "object") {
    throw new OrderError("invalid-argument", "\u041F\u0443\u0441\u0442\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441");
  }
  const raw = data;
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new OrderError("invalid-argument", "\u041A\u043E\u0440\u0437\u0438\u043D\u0430 \u043F\u0443\u0441\u0442\u0430");
  }
  if (raw.items.length > MAX_ITEMS) {
    throw new OrderError("invalid-argument", `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u043E\u0437\u0438\u0446\u0438\u0439 \u0432 \u0437\u0430\u043A\u0430\u0437\u0435 (\u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C ${MAX_ITEMS})`);
  }
  const items = raw.items.map((it) => {
    const item = it || {};
    const quantity = item.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new OrderError("invalid-argument", "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0442\u043E\u0432\u0430\u0440\u0430");
    }
    return {
      productId: requireString(item.productId, "\u0442\u043E\u0432\u0430\u0440", 128),
      color: requireString(item.color, "\u0446\u0432\u0435\u0442", 128, false),
      size: requireString(item.size, "\u0440\u0430\u0437\u043C\u0435\u0440", 64, false),
      quantity
    };
  });
  const contact = raw.contact || {};
  const promoCode = requireString(raw.promoCode, "\u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434", 64, false).toUpperCase();
  return {
    items,
    deliveryMethodId: requireString(raw.deliveryMethodId, "\u0441\u043F\u043E\u0441\u043E\u0431 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438", 64),
    deliveryAddress: requireString(raw.deliveryAddress, "\u0430\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438", 1e3),
    paymentMethod: requireString(raw.paymentMethod, "\u0441\u043F\u043E\u0441\u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u044B", 128),
    ...promoCode ? { promoCode } : {},
    contact: {
      name: requireString(contact.name, "\u0438\u043C\u044F", 128),
      phone: requireString(contact.phone, "\u0442\u0435\u043B\u0435\u0444\u043E\u043D", 64),
      email: requireString(contact.email, "email", 256, false)
    }
  };
}
function randomOrderId() {
  return `WS-${Math.floor(1e7 + Math.random() * 9e7)}`;
}
function skuKey(color, size) {
  return `${extractColorName(color).trim().toLowerCase()}|${extractSizeName(size).trim().toLowerCase()}`;
}
function stripUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}
async function placeOrderCore(db2, request, customerUid, now = /* @__PURE__ */ new Date()) {
  const isQuickOrder = request.deliveryMethodId === QUICK_ORDER_DELIVERY_ID;
  if (isQuickOrder && request.promoCode) {
    throw new OrderError("invalid-argument", "\u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u043A \u0437\u0430\u043A\u0430\u0437\u0443 \u0432 1 \u043A\u043B\u0438\u043A");
  }
  const productIds = [...new Set(request.items.map((i) => i.productId))];
  const productRefs = productIds.map((id) => db2.collection("products").doc(id));
  return db2.runTransaction(async (tx) => {
    const productSnaps = await tx.getAll(...productRefs);
    const products = /* @__PURE__ */ new Map();
    productSnaps.forEach((snap, idx) => {
      if (!snap.exists) {
        throw new OrderError("not-found", `\u0422\u043E\u0432\u0430\u0440 ${productIds[idx]} \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043F\u0440\u043E\u0434\u0430\u0435\u0442\u0441\u044F`);
      }
      products.set(snap.id, { ref: productRefs[idx], data: { ...snap.data(), id: snap.id } });
    });
    const settingsSnap = await tx.get(db2.collection("settings").doc("storefront"));
    const settings = settingsSnap.exists ? settingsSnap.data() : void 0;
    let promo = null;
    if (request.promoCode) {
      const promoSnap = await tx.get(db2.collection("promos").where("code", "==", request.promoCode).limit(1));
      if (promoSnap.empty) {
        throw new OrderError("not-found", "\u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      }
      const doc = promoSnap.docs[0];
      promo = { ref: doc.ref, data: doc.data() };
    }
    let orderRef = db2.collection("orders").doc(randomOrderId());
    for (let attempt = 0; (await tx.get(orderRef)).exists; attempt++) {
      if (attempt >= 3) throw new Error("Could not allocate a unique order id");
      orderRef = db2.collection("orders").doc(randomOrderId());
    }
    let deliveryMethods = [];
    if (!isQuickOrder) {
      const methodsSnap = await tx.get(db2.collection("delivery_methods"));
      deliveryMethods = methodsSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    }
    const lines = [];
    const cartItems = [];
    const requestedBySku = /* @__PURE__ */ new Map();
    request.items.forEach((item, idx) => {
      const product = products.get(item.productId).data;
      if (isHiddenFromSale(product)) {
        throw new OrderError("failed-precondition", `\u0422\u043E\u0432\u0430\u0440 \xAB${product.title}\xBB \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043F\u0440\u043E\u0434\u0430\u0435\u0442\u0441\u044F`);
      }
      lines.push({ productId: product.id, category: product.category, price: product.price, quantity: item.quantity });
      cartItems.push({
        id: `cart-${idx + 1}`,
        product,
        selectedColor: item.color,
        selectedSize: item.size,
        quantity: item.quantity
      });
      const perProduct = requestedBySku.get(product.id) ?? /* @__PURE__ */ new Map();
      const key = skuKey(item.color, item.size);
      perProduct.set(key, (perProduct.get(key) ?? 0) + item.quantity);
      requestedBySku.set(product.id, perProduct);
    });
    const stockUpdates = [];
    const preorderMode = settings?.isPreorderMode === true;
    const preorderKeys = /* @__PURE__ */ new Set();
    for (const [productId, requested] of requestedBySku) {
      const { ref, data: product } = products.get(productId);
      const skus = product.skus && product.skus.length > 0 ? product.skus : generateDefaultSKUs(product);
      const updatedSkus = skus.map((sku) => ({ ...sku }));
      for (const [key, quantity] of requested) {
        const sku = updatedSkus.find((s) => skuKey(s.color, s.size) === key);
        const [color, size] = key.split("|");
        if (!sku) {
          throw new OrderError("invalid-argument", `\u0412\u0430\u0440\u0438\u0430\u043D\u0442 \xAB${product.title}\xBB (${color}, ${size}) \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D`);
        }
        if (preorderMode && sku.stock <= 0) {
          preorderKeys.add(`${productId}|${key}`);
          continue;
        }
        if (sku.stock < quantity) {
          throw new OrderError(
            "failed-precondition",
            `\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0442\u043E\u0432\u0430\u0440\u0430 \xAB${product.title}\xBB (${sku.color}, ${sku.size}): \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E ${sku.stock} \u0448\u0442.`
          );
        }
        sku.stock -= quantity;
      }
      stockUpdates.push({ ref, skus: updatedSkus });
    }
    for (const item of cartItems) {
      if (preorderKeys.has(`${item.product.id}|${skuKey(item.selectedColor, item.selectedSize)}`)) {
        item.isPreorder = true;
      }
    }
    if (promo) {
      const promoError = validatePromo(promo.data, lines, now.getTime());
      if (promoError) throw new OrderError("failed-precondition", promoError);
    }
    let deliveryTitle = QUICK_ORDER_DELIVERY_TITLE;
    let deliveryFee = 0;
    if (!isQuickOrder) {
      const subtotal = lines.reduce((acc, l) => acc + l.price * l.quantity, 0);
      const method = getAvailableDeliveryMethods(deliveryMethods, settings, subtotal).find(
        (m) => m.id === request.deliveryMethodId
      );
      if (!method) {
        throw new OrderError("invalid-argument", "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
      }
      deliveryTitle = method.title;
      deliveryFee = method.price || 0;
    }
    const totals = calcOrderTotals(lines, promo?.data, deliveryFee);
    const paymentStatus = request.paymentMethod.toLowerCase().includes("\u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0438") ? "paid_on_delivery" : "paid";
    const orderBase = {
      id: orderRef.id,
      date: formatOrderDate(now),
      createdAt: now.toISOString(),
      items: cartItems,
      status: "accepted",
      totalPrice: totals.total,
      deliveryAddress: request.deliveryAddress,
      deliveryMethod: deliveryTitle,
      deliveryFee: totals.deliveryFee,
      discountAmount: totals.discount,
      promoCode: promo?.data.code,
      customerName: request.contact.name,
      customerPhone: request.contact.phone,
      customerEmail: request.contact.email || void 0,
      customerUid: customerUid ?? void 0,
      paymentMethod: request.paymentMethod,
      paymentStatus,
      estimatedDelivery: "\u0427\u0435\u0440\u0435\u0437 1-2 \u0434\u043D\u044F",
      placedVia: "server"
    };
    const order = stripUndefined({
      ...orderBase,
      historySteps: getDefaultHistorySteps(orderBase),
      deliveryStages: getSynchronizedDeliveryStages(orderBase)
    });
    tx.create(orderRef, order);
    for (const { ref, skus } of stockUpdates) {
      tx.update(ref, { skus, inStock: skus.some((s) => s.stock > 0) });
    }
    if (promo) {
      const commissionPercent = promo.data.partnerCommissionPercent || 10;
      tx.update(promo.ref, stripUndefined({
        usedCount: (promo.data.usedCount || 0) + 1,
        generatedRevenue: (promo.data.generatedRevenue || 0) + totals.total,
        commissionEarned: promo.data.isReferral ? (promo.data.commissionEarned || 0) + Math.round(totals.total * commissionPercent / 100) : promo.data.commissionEarned
      }));
    }
    return order;
  });
}

// src/index.ts
(0, import_v2.setGlobalOptions)({ region: FUNCTIONS_REGION, maxInstances: 10 });
(0, import_app.initializeApp)();
var db = (0, import_firestore.getFirestore)(firebase_applet_config_default.firestoreDatabaseId);
var placeOrder = (0, import_https.onCall)(async (request) => {
  try {
    const orderRequest = parsePlaceOrderRequest(request.data);
    const order = await placeOrderCore(db, orderRequest, request.auth?.uid ?? null);
    import_firebase_functions.logger.info("Order placed", { orderId: order.id, total: order.totalPrice, uid: request.auth?.uid ?? null });
    return { order };
  } catch (err) {
    if (err instanceof OrderError) {
      throw new import_https.HttpsError(err.code, err.message);
    }
    import_firebase_functions.logger.error("placeOrder failed", err);
    throw new import_https.HttpsError("internal", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0437\u0430\u043A\u0430\u0437. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
  }
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  placeOrder
});
