// tests/inventory.test.js
const { validateStockData, validateEmail, validatePassword } = require('../utils/validator');

describe('Stok Yönetimi Ana Senaryo Testleri', () => {
    
    test('Geçerli stok verisi girildiğinde doğrulama başarılı olmalı', () => {
        const validStock = {
            quantity: 10,
            productTypeId: 1,
            manufacturerPN: 'ABC-123'
        };
        expect(validateStockData(validStock)).toBe(true);
    });

    test('Miktar 0 veya negatifse doğrulama başarısız olmalı', () => {
        const invalidStock = {
            quantity: -5,
            productTypeId: 1,
            manufacturerPN: 'ABC-123'
        };
        expect(validateStockData(invalidStock)).toBe(false);
    });

    test('Kategori seçilmemişse doğrulama başarısız olmalı', () => {
        const invalidStock = {
            quantity: 10,
            productTypeId: "",
            manufacturerPN: 'ABC-123'
        };
        expect(validateStockData(invalidStock)).toBe(false);
    });
});

describe('Veri Formatı ve Güvenlik Testleri', () => {
    
    // Veri Formatı Testi (E-posta)
    test('Geçersiz e-posta formatı reddedilmeli', () => {
        expect(validateEmail('hatali-email.com')).toBe(false);
        expect(validateEmail('test@firmacom')).toBe(false);
    });

    test('Geçerli e-posta formatı kabul edilmeli', () => {
        expect(validateEmail('tedarikci@firma.com')).toBe(true);
    });

    // Güvenlik Testi (Şifre)
    test('6 karakterden kısa şifreler güvenlik nedeniyle reddedilmeli', () => {
        expect(validatePassword('123')).toBe(false);
    });

    test('6 karakter ve üzeri şifreler kabul edilmeli', () => {
        expect(validatePassword('sifre123')).toBe(true);
    });
});