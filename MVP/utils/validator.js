// utils/validator.js

/**
 * Stok verisi doğrulama: Miktar pozitif olmalı ve kategori seçilmelidir.
 */
function validateStockData(data) {
    if (!data.quantity || data.quantity <= 0) return false;
    if (!data.productTypeId || data.productTypeId === "") return false;
    return true;
}

/**
 * Veri Formatı Testi: E-posta adresinin standartlara uygunluğunu kontrol eder.
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

/**
 * Güvenlik Testi: Şifrenin en az 6 karakter olup olmadığını kontrol eder.
 */
function validatePassword(password) {
    if (!password || password.length < 6) return false;
    return true;
}

// Tüm fonksiyonları dışa aktarıyoruz ki test dosyası bunları görebilsin.
module.exports = { 
    validateStockData, 
    validateEmail, 
    validatePassword 
};