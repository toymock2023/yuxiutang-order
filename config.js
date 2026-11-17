// 網站設定：只需要改這個檔案
window.SITE_CONFIG = {
  // Google Apps Script 部署後的網址（結尾是 /exec）。留空時為測試模式，訂單不會送出。
  ORDER_ENDPOINT: '',

  // 是否顯示價格（false 時只顯示商品與箱數）
  SHOW_PRICE: true,

  // 未達品牌起訂箱數時：true = 不能送出；false = 只提醒，仍可送出
  ENFORCE_MIN: false,
};
