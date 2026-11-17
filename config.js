// 網站設定：只需要改這個檔案
window.SITE_CONFIG = {
  // Google Apps Script 部署後的網址（結尾是 /exec）。留空時為測試模式，訂單不會送出。
  ORDER_ENDPOINT: 'https://script.google.com/macros/s/AKfycbyLAhrkLLINIwjXgENev479bKg3soXgUzUxwVUy0CJu_r8uMV5zTw0_KX5AMN8FddIknA/exec',

  // 是否顯示價格（false 時只顯示商品與箱數）
  SHOW_PRICE: true,

  // 本批收單：CLOSE_AT 過後網站自動停止收單（台灣時間）
  BATCH: {
    CLOSE_AT: '2026-12-10T23:59:59+08:00',
    CLOSE_TEXT: '2026/12/10（四）',
    ARRIVE_TEXT: '12 月底',
  },

  // 台灣運費（台幣）：每公斤單價；訂單總重未滿 SMALL_KG 加收 SMALL_FEE
  SHIPPING: { PER_KG: 205, SMALL_KG: 5, SMALL_FEE: 110 },
};
