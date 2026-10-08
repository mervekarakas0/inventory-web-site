const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const multer = require("multer");
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// 1. SUPABASE AYARLARI
// ==========================================
const supabaseUrl = 'https://fjgzzcpkieeddscksaqc.supabase.co'; 
const supabaseKey = 'sb_publishable_5eXQ2mFy29-qGIU_YWd2qw_Q-pplW3b';
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 2. MIDDLEWARE AYARLARI
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(expressLayouts);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'benim-gizli-proje-sifrem-12345',
  resave: false,
  saveUninitialized: false,
}));

app.use(flash());

// --- GLOBAL DEĞİŞKENLER & FLASH MESAJ DÜZELTMESİ ---
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.user = req.session.user || null;

  // 1. Flash mesajlarını çek
  const successArr = req.flash('success');
  const errorArr = req.flash('error');

  // 2. Eğer mesaj varsa ilkini al, yoksa NULL yap.
  // Bu sayede EJS'de "boş kutu" sorunu backend tarafında çözülür.
  res.locals.success = successArr.length > 0 ? successArr[0] : null;
  res.locals.error = errorArr.length > 0 ? errorArr[0] : null;

  // Eski kodlarla uyumluluk için bunları da null geçiyoruz
  res.locals.successMessage = null; 
  res.locals.errorMessage = null;

  next();
});

// Giriş Kontrol Fonksiyonu
function isLoggedIn(req, res, next) {
  if (req.session.user) {
    return next();
  }
  req.flash('error', 'Giriş yapmanız gerekiyor.');
  res.redirect('/login');
}

// Dosya Yükleme Ayarları (Multer)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Klasörün public içinde olduğundan emin olun
    cb(null, 'public/uploads/'); 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Dosyalara dışarıdan /uploads/... yoluyla erişebilmek için:
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ==========================================
// 3. ROTALAR (ROUTES)
// ==========================================

// --- GİRİŞ & ÇIKIŞ ---
app.get('/login', (req, res) => {
  res.render('login', { title: 'Giriş Yap', layout: false });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: users, error } = await supabase
      .from('Users')
      .select('*')
      .ilike('Username', username);

    if (error) throw error;

    if (!users || users.length === 0) {
      // Mesajı dizi içine aldık: ['...']
      req.flash('error', ['Kullanıcı adı bulunamadı.']); 
      return res.redirect('/login');
    }

    const user = users[0];
    if (password !== user.Password) {
      // Mesajı dizi içine aldık: ['...']
      req.flash('error', ['Şifre yanlış.']); 
      return res.redirect('/login');
    }

    req.session.user = {
      username: user.Username,
      canAddStock: user.canAddStock,
      canDeleteStock: user.canDeleteStock,
      canManageSuppliers: user.canManageSuppliers, // Veritabanındaki yeni sütunu ekledik
      canManageCategories: user.canManageCategories, // Veritabanındaki yeni sütunu ekledik
      canManageUsers: user.canManageUsers
    };

    req.flash('success', 'Hoş geldiniz! Giriş başarıyla yapıldı.');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    // Dinamik hatayı da dizi içine aldık
    req.flash('error', ['Giriş hatası: ' + err.message]); 
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/dasboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const ejs = require('ejs');
  const filePath = path.join(__dirname, 'views', 'dashboard.ejs');
  ejs.renderFile(filePath, { user: req.session.user }, {}, (err, html) => {
      if (err) return res.status(500).send(err.message);
      res.send(html);
  });
});

app.get('/', (req, res) => res.redirect('/login'));


// --- DASHBOARD (ANA SAYFA) ---
// ⚠️ UYARI: Gemini Ücretsiz API Kotası (Rate Limit) Aşıldı!
// Sistem çökmek yerine "Yedek (Demo) Moduna" geçerek bu örnek refactoring'i üretti.

const applyFilters = (query, filters) => {
  const filterMappings = {
    stockCode: (q, v) => q.ilike('StockCode', '%' + v + '%'),
    manufacturerPN: (q, v) => q.ilike('ManufacturerPN', '%' + v + '%'),
    productTypeId: (q, v) => q.eq('ProductTypeID', v),
    subCategoryId: (q, v) => q.eq('SubCategoryID', v),
    // ... diğer filtreler obje üzerinden dinamik olarak eşleşir
  };

  Object.entries(filters).forEach(([key, value]) => {
    if (value && filterMappings[key]) {
      query = filterMappings[key](query, value);
    }
  });
  
  return query;
};

app.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
    const filters = { ...req.query };
    let query = supabase.from('Stocks').select('*, ProductTypes(ProductName), ...');
    
    // Yüzlerce if satırı yerine tek bir fonksiyon çağrısı!
    query = applyFilters(query, filters);
    
    const { data: stocks, error } = await query;
    if (error) throw error;
    
    res.render('dashboard', { stocks, filters });
  } catch(err) {
    res.locals.error = 'Hata: ' + err.message;
    res.render('dashboard', { stocks: [] });
  }
});


// --- STOK İŞLEMLERİ ---

// --- STOK İŞLEMLERİ ---

app.get('/stocks', isLoggedIn, async (req, res) => {
  try {
    const [pt, sc, cl, un, sp] = await Promise.all([
      supabase.from('ProductTypes').select('*').order('ProductName'),
      supabase.from('SubCategories').select('*').order('SubCategory'),
      supabase.from('Colors').select('*').order('ColorName'),
      supabase.from('Units').select('*').order('UnitName'),
      supabase.from('Suppliers').select('*').order('SupplierName')
    ]);

    res.render('stocks', {
      layout: 'layout', title: 'Stok Ekle',
      formData: {},
      productTypes: pt.data || [], 
      subCategories: sc.data || [], 
      colors: cl.data || [], 
      units: un.data || [], 
      suppliers: sp.data || []
    });
  } catch (err) {
    res.redirect('/dashboard');
  }
});

// DEĞİŞTİRİLEN KISIM: Rota /stocks/add olarak güncellendi
// --- STOK İŞLEMLERİ EKLEME (RPC Düzeltmesi) ---

// --- STOK EKLEME ---
// --- STOK EKLEME ---
app.post('/stocks/add', isLoggedIn, upload.single('urunFoto'), async (req, res) => {
    const {
        productTypeId, subCategoryId, colorId, feature, supplierCode, quantity, unitCode,
        lotDate, manufacturerPN, manufacturerLotNo, depo, raf
    } = req.body;
    
    // Veritabanına sadece "/uploads/dosyaadi.jpg" olarak kaydediyoruz
    const fotoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const recordedBy = req.session.user.username; 

    try {
        const { error } = await supabase
            .from('Stocks')
            .insert([{
                ProductTypeID: parseInt(productTypeId),
                SubCategoryID: parseInt(subCategoryId),
                ColorID: colorId ? parseInt(colorId) : null,
                Feature: feature || '',
                SupplierCode: supplierCode,
                Quantity: parseFloat(quantity),
                UnitCode: unitCode,
                LotDate: lotDate || null,
                ManufacturerPN: manufacturerPN,
                ManufacturerLotNo: manufacturerLotNo,
                RecordedBy: recordedBy,
                UrunFotografiYolu: fotoPath,
                Depo: depo,
                Raf: raf
            }]);

        if (error) throw error;

        req.flash('success', 'Yeni Stok başarıyla eklendi.');
        res.redirect('/dashboard'); 
    } catch (err) {
        console.error("Stok Ekleme Hatası:", err);
        req.flash('error', `Hata: ${err.message}`);
        res.redirect('/stocks');
    }
});

// --- STOK GÜNCELLEME ---
app.post('/stocks/edit/:id', isLoggedIn, upload.single('urunFoto'), async (req, res) => {
    try {
        const { id } = req.params;
        const { productTypeId, subCategoryId, colorId, quantity, unitCode, warehouse, shelf } = req.body;

        if (!id || id === 'undefined') {
            return res.status(400).json({ error: "Geçersiz Stok ID!" });
        }

        const updateData = {
            ProductTypeID: productTypeId ? parseInt(productTypeId) : null,
            SubCategoryID: subCategoryId ? parseInt(subCategoryId) : null,
            ColorID: (colorId && colorId !== "null" && colorId !== "") ? parseInt(colorId) : null,
            Quantity: quantity ? parseFloat(quantity) : 0,
            UnitCode: unitCode || null,
            Depo: warehouse || '', 
            Raf: shelf || ''
        };

        // Eğer yeni fotoğraf seçildiyse yolu güncelle, seçilmediyse eski fotoğraf kalır
        if (req.file) {
            updateData.UrunFotografiYolu = `/uploads/${req.file.filename}`;
        }

        const { error } = await supabase
            .from('Stocks')
            .update(updateData)
            .eq('StockID', parseInt(id));

        if (error) {
            console.error("Supabase Hatası:", error);
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ success: true, message: "Stok başarıyla güncellendi." });

    } catch (err) {
        console.error("Sunucu Kritik Hata:", err);
        return res.status(500).json({ error: "Sunucu tarafında bir hata oluştu: " + err.message });
    }
});

// --- STOK SİLME (JSON YANITLI) ---
app.post('/stocks/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { error } = await supabase
            .from('Stocks')
            .delete()
            .eq('StockID', req.params.id);

        if (error) throw error;

        // JS FETCH İÇİN JSON DÖNÜYORUZ
        return res.status(200).json({ success: true, message: "Stok başarıyla silindi." });
    } catch (err) {
        console.error("Silme Hatası:", err);
        return res.status(400).json({ error: "Silme işlemi başarısız: " + err.message });
    }
});






// --- ÜRÜN ÇEŞİTLERİ (ProductTypes) ---
// app.js içinde rotayı şu şekilde küçük harf ve tireli yapmanı öneririm:
// --- ANA KATEGORİLERİ LİSTELE (İlgili kısım düzenlendi) ---
app.get('/productTypes', isLoggedIn, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ProductTypes')
            .select('*')
            .order('ID', { ascending: true }); 

        if (error) {
            console.error("Sorgu Hatası:", error.message);
            return res.status(400).send(error.message);
        }

        // render ettiğin EJS dosyasının adı 'product-types.ejs' kalsın, sorun yok
        res.render('productTypes', { 
            productTypes: data || [],
            title: 'Ana Kategoriler' 
        });
    } catch (err) {
        res.status(500).send("Sunucu hatası: " + err.message);
    }
});

app.post('/productTypes/add', isLoggedIn, async (req, res) => {
  const { productTypeName } = req.body;
  
  try {
    const { data: existing } = await supabase
      .from('ProductTypes')
      .select('*')
      .ilike('ProductName', productTypeName.trim())
      .maybeSingle();

    if (existing) {
      req.flash('error', [`'${productTypeName}' kategorisi zaten mevcut!`]);
      return res.redirect('/productTypes');
    }

    const { error } = await supabase
      .from('ProductTypes')
      .insert([{ ProductName: productTypeName.trim() }]);

    if (error) throw error;

    req.flash('success', ['Başarıyla eklendi.']);
    res.redirect('/productTypes');
  } catch (err) {
    req.flash('error', ['Hata oluştu.']);
    res.redirect('/productTypes');
  }
});

// --- ANA KATEGORİ GÜNCELLEME ---
app.post('/productTypes/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const { productTypeName } = req.body;
        const { id } = req.params;

        // ÇAKIŞMA KONTROLÜ: Kendisi hariç bu isimde başka kayıt var mı?
        const { data: existing } = await supabase
            .from('ProductTypes')
            .select('*')
            .ilike('ProductName', productTypeName.trim())
            .neq('ID', id)
            .maybeSingle();

        if (existing) return res.status(400).json({ error: "Bu isimde bir ana kategori zaten mevcut!" });

        const { error } = await supabase
            .from('ProductTypes')
            .update({ ProductName: productTypeName.trim() }) 
            .eq('ID', id);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Ana Kategori başarıyla güncellendi." });
    } catch (err) {
        console.error("PT Güncelleme Hatası:", err);
        res.status(400).json({ error: err.message });
    }
});

// --- ANA KATEGORİ SİLME ---
app.post('/productTypes/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { error } = await supabase
            .from('ProductTypes')
            .delete()
            .eq('ID', req.params.id);

        if (error) {
            // Foreign Key Hatası: Bu kategoriye bağlı Alt Kategoriler varsa silinmez
            if (error.code === '23503') {
                return res.status(400).json({ error: "Bu kategoriye bağlı alt kategoriler olduğu için silinemez!" });
            }
            throw error;
        }

        res.status(200).json({ success: true, message: "Ana Kategori başarıyla silindi." });
    } catch (err) {
        console.error("PT Silme Hatası:", err);
        res.status(400).json({ error: "Silme işlemi başarısız oldu." });
    }
});










// --- ALT KATEGORİLER (SubCategories) GET ROTASI ---
app.get('/subCategories', isLoggedIn, async (req, res) => {
    try {
        // 1. Ana Kategorileri Çek (Dropdown için)
        const { data: ptData, error: ptError } = await supabase
            .from('ProductTypes')
            .select('*')
            .order('ProductName', { ascending: true });

        // 2. Alt Kategorileri Çek (Tablo listesi için)
        const { data: scData, error: scError } = await supabase
            .from('SubCategories')
            .select('*, ProductTypes(ProductName)')
            .order('ID', { ascending: true });

        if (ptError) throw ptError;
        if (scError) throw scError;

        // VERİ GÖNDERİMİ: EJS dosyasındaki döngü 'productTypes' ismini bekliyor
        res.render('subCategories', {
            layout: 'layout',
            title: 'Alt Kategoriler',
            productTypes: ptData || [], // Dropdown'u dolduracak olan dizi
            subCategories: scData || [], // Tabloyu dolduracak olan dizi
            user: req.session.user
        });
    } catch (err) {
        console.error("Alt Kategori Yükleme Hatası:", err.message);
        req.flash('error', ['Kategoriler yüklenirken hata oluştu.']);
        res.redirect('/dashboard');
    }
});



app.post('/subCategories/add', isLoggedIn, async (req, res) => {
    const { productTypeID, subCategory } = req.body;

    try {
        // 1. AYNI ANA KATEGORİ ALTINDA AYNI İSİMLİ ALT KATEGORİ VAR MI?
        const { data: existingSub, error: checkError } = await supabase
            .from('SubCategories')
            .select('*')
            .eq('ProductTypeID', productTypeID) // Aynı ana kategori
            .ilike('SubCategory', subCategory.trim()) // Aynı isim (Büyük/küçük harf duyarsız)
            .maybeSingle();

        if (existingSub) {
            req.flash('error', [`Bu ana kategori altında '${subCategory}' isimli bir alt kategori zaten mevcut!`]);
            return res.redirect('/subCategories');
        }

        // 2. EĞER YOKSA EKLE
        const { error: insertError } = await supabase
            .from('SubCategories')
            .insert([{ 
                ProductTypeID: productTypeID, 
                SubCategory: subCategory.trim() 
            }]);

        if (insertError) throw insertError;

        req.flash('success', ['Alt kategori başarıyla eklendi.']);
        res.redirect('/subCategories');

    } catch (err) {
        console.error("Alt Kategori Ekleme Hatası:", err);
        req.flash('error', ['Alt kategori eklenirken beklenmedik bir hata oluştu.']);
        res.redirect('/subCategories');
    }
});



// --- ALT KATEGORİ GÜNCELLEME ---
// --- ALT KATEGORİ GÜNCELLEME ---
// --- ALT KATEGORİ GÜNCELLEME ---
app.post('/subCategories/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const { subCategory, productTypeID } = req.body;
        const { id } = req.params;

        // ÇAKIŞMA KONTROLÜ: Aynı ana kategori altında kendisi hariç bu isimde başka kayıt var mı?
        const { data: existing } = await supabase
            .from('SubCategories')
            .select('*')
            .eq('ProductTypeID', productTypeID)
            .ilike('SubCategory', subCategory.trim())
            .neq('ID', id)
            .maybeSingle();

        if (existing) return res.status(400).json({ error: "Bu ana kategori altında bu alt kategori zaten mevcut!" });
        
        const { error } = await supabase
            .from('SubCategories')
            .update({ 
                SubCategory: subCategory.trim(),
                ProductTypeID: productTypeID
            })
            .eq('ID', id);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Alt kategori başarıyla güncellendi." });
    } catch (err) {
        console.error("Güncelleme Hatası:", err);
        res.status(400).json({ error: "Güncelleme yapılamadı: " + err.message });
    }
});

// --- ALT KATEGORİ SİLME ---
app.post('/subCategories/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { error } = await supabase
            .from('SubCategories')
            .delete()
            .eq('ID', req.params.id);

        if (error) {
            if (error.code === '23503') {
                return res.status(400).json({ error: "Bu kategoriye bağlı ürünler olduğu için silinemez!" });
            }
            throw error;
        }
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});






// --- ÖZELLİKLER (Attributes: Colors & Units) ---
app.get('/attributes', isLoggedIn, async (req, res) => {
  try {
    // Colors: Senin tablonun birincil anahtarı büyük harf 'ID'
    const { data: colors, error: colorError } = await supabase
      .from('Colors')
      .select('*')
      .order('ID', { ascending: true }); // Büyük 'ID' kullandık

    // Units: Tablonda 'ID' sütunu yok, bu yüzden UnitCode'a göre sıralıyoruz
    const { data: units, error: unitError } = await supabase
      .from('Units')
      .select('*')
      .order('UnitCode', { ascending: true }); // 'UnitCode' alfabetik olarak CM, KG, M sırasıyla getirir

    if (colorError) console.error("Renkler hatası:", colorError.message);
    if (unitError) console.error("Birimler hatası:", unitError.message);

    res.render('attributes', {
      layout: 'layout', 
      title: 'Özellikler', 
      colors: colors || [], 
      units: units || [],
      tab: req.query.tab || 'colors'
    });
  } catch (err) {
    console.error("Genel Hata:", err);
    res.status(500).send("Sunucu hatası oluştu.");
  }
});


app.post('/attributes/colors/add', isLoggedIn, async (req, res) => {
  const { colorName } = req.body;
  
  try {
    const { data: existingColor } = await supabase
      .from('Colors')
      .select('*')
      .ilike('ColorName', colorName.trim()) // ilike ile büyük/küçük harf duyarsız kontrol
      .maybeSingle();

    if (existingColor) {
      req.flash('error', [`'${colorName}' ismiyle bir renk zaten mevcut!`]);
      return res.redirect('/attributes?tab=colors');
    }

    const { error } = await supabase
      .from('Colors')
      .insert([{ ColorName: colorName.trim() }]);

    if (error) throw error;

    req.flash('success', ['Yeni renk başarıyla eklendi.']);
    res.redirect('/attributes?tab=colors');
  } catch (err) {
    req.flash('error', ['Sistem hatası oluştu.']);
    res.redirect('/attributes?tab=colors');
  }
});



// --- RENKLER GÜNCELLEME (Inline Edit Destekli) ---
app.post('/attributes/colors/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const { colorName } = req.body;
        const { id } = req.params;

        // ÇAKIŞMA KONTROLÜ
        const { data: existing } = await supabase
            .from('Colors')
            .select('*')
            .ilike('ColorName', colorName.trim())
            .neq('ID', id)
            .maybeSingle();

        if (existing) return res.status(400).json({ error: "Bu renk ismi zaten mevcut!" });
        
        const { error } = await supabase
            .from('Colors')
            .update({ ColorName: colorName.trim() })
            .eq('ID', id);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Renk başarıyla güncellendi." });
    } catch (err) {
        console.error("Renk Hatası:", err);
        res.status(400).json({ error: err.message });
    }
});



// --- RENKLER SİLME ---
app.post('/attributes/colors/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('Colors')
            .delete()
            .eq('ID', id);

        if (error) {
            // Eğer renk bir ürüne bağlıysa (Foreign Key Hatası)
            if (error.code === '23503') {
                return res.status(400).json({ 
                    error: "Bu renk bir üründe tanımlı olduğu için silinemez!" 
                });
            }
            throw error;
        }

        res.status(200).json({ success: true, message: "Renk başarıyla silindi." });
    } catch (err) {
        console.error("Renk Silme Hatası:", err);
        res.status(500).json({ error: "Renk silinirken bir hata oluştu." });
    }
});




app.post('/attributes/units/add', isLoggedIn, async (req, res) => {
  const { unitCode, unitName } = req.body;
  
  try {
    // 1. AYNI İSİM VEYA KOD VAR MI KONTROL ET
    const { data: existingUnit, error: checkError } = await supabase
      .from('Units')
      .select('*')
      .or(`UnitCode.eq.${unitCode.trim().toUpperCase()},UnitName.eq.${unitName.trim()}`)
      .maybeSingle();

    if (existingUnit) {
      req.flash('error', [`'${unitCode}' kodu veya '${unitName}' ismiyle bir birim zaten mevcut!`]);
      return res.redirect('/attributes?tab=units');
    }

    // 2. EĞER YOKSA EKLE
    const { error: insertError } = await supabase
      .from('Units')
      .insert([{ 
        UnitCode: unitCode.trim().toUpperCase(), 
        UnitName: unitName.trim() 
      }]);

    if (insertError) throw insertError;

    req.flash('success', ['Yeni Birim başarıyla eklendi.']);
    res.redirect('/attributes?tab=units');

  } catch (err) {
    console.error("Hata:", err);
    req.flash('error', ['Ekleme sırasında bir hata oluştu.']);
    res.redirect('/attributes?tab=units');
  }
});




// --- BİRİMLER GÜNCELLEME ---
app.post('/attributes/units/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const { newUnitCode, unitName } = req.body;
        const oldCode = req.params.id;
        
        // ÇAKIŞMA KONTROLÜ: Kod veya İsim başka bir birimde var mı?
        const { data: existing } = await supabase
            .from('Units')
            .select('*')
            .or(`UnitCode.eq.${newUnitCode.trim().toUpperCase()},UnitName.eq.${unitName.trim()}`)
            .neq('UnitCode', oldCode)
            .maybeSingle();

        if (existing) return res.status(400).json({ error: "Bu birim kodu veya ismi zaten mevcut!" });

        const { error } = await supabase
            .from('Units')
            .update({ 
                UnitCode: newUnitCode.trim().toUpperCase(),
                UnitName: unitName.trim() 
            })
            .eq('UnitCode', oldCode);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Birim başarıyla güncellendi." });
    } catch (err) {
        console.error("Birim Hatası:", err);
        res.status(400).json({ error: err.message });
    }
});




app.post('/attributes/units/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { error } = await supabase.from('Units').delete().eq('UnitCode', req.params.id);
        
        if (error) {
            // Foreign Key (Dış Anahtar) kısıtlaması hatası: Birim bir stokta kullanılıyorsa
            if (error.code === '23503') {
                return res.status(400).json({ error: "Bu birim bir veya daha fazla stok kaydında kullanıldığı için silinemez!" });
            }
            throw error;
        }

        // BAŞARILI: success: true yanına message ekliyoruz
        return res.status(200).json({ 
            success: true, 
            message: "Birim başarıyla silindi." 
        });

    } catch (err) {
        console.error("Birim Silme Hatası:", err);
        // Hata durumunda kullanıcıya teknik detayı veya genel mesajı dönüyoruz
        return res.status(500).json({ 
            error: "Birim silinirken bir sunucu hatası oluştu: " + err.message 
        });
    }
});









// --- TEDARİKÇİLER (Suppliers) ---
// app.js içinde bu bloğu bulun veya güncelleyin
app.get('/suppliers', isLoggedIn, async (req, res) => {
    try {
        const { data, error } = await supabase.from('Suppliers').select('*').order('SupplierName');
        
        if (error) throw error;

        res.render('suppliers', {
            layout: 'layout', 
            title: 'Tedarikçiler', 
            suppliers: data || []
        });
    } catch (err) {
        console.error("Tedarikçi Yükleme Hatası:", err);
        res.redirect('/dashboard');
    }
});app.post('/suppliers/add', isLoggedIn, async (req, res) => {
  await supabase.from('Suppliers').insert([{
    SupplierCode: req.body.supplierCode,
    SupplierName: req.body.supplierName.trim(),
    Phone: req.body.phone,
    Email: req.body.email,
    Note: req.body.note
  }]);
  req.flash('success', ['Yeni Tedarikçi başarıyla eklendi.']);
  res.redirect('/suppliers');
});

// --- TEDARİKÇİ GÜNCELLEME ---
// --- TEDARİKÇİ GÜNCELLEME ---
app.post('/suppliers/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const { newSupplierCode, supplierName, phone, email, note } = req.body;
        
        const { error } = await supabase
            .from('Suppliers')
            .update({ 
                SupplierCode: newSupplierCode.toUpperCase(), 
                SupplierName: supplierName,
                Phone: phone,
                Email: email,
                Note: note
            })
            .eq('SupplierCode', req.params.id);

        if (error) throw error;

        // BAŞARILI: json içine 'message' ekliyoruz
        res.status(200).json({ 
            success: true, 
            message: "Tedarikçi Bilgileri başarıyla güncellendi." 
        });
    } catch (err) {
        console.error("Güncelleme Hatası:", err);
        // HATA: Hata mesajını kullanıcıya iletiyoruz
        res.status(400).json({ 
            error: "Güncelleme yapılamadı: " + err.message 
        });
    }
});

// --- TEDARİKÇİ SİLME ---
app.post('/suppliers/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const { error } = await supabase
            .from('Suppliers')
            .delete()
            .eq('SupplierCode', req.params.id); 

        if (error) {
            // Eğer bu tedarikçiye bağlı stok kartları varsa hata döndür
            if (error.code === '23503') {
                return res.status(400).json({ error: "Bu tedarikçiye bağlı stok kayıtları olduğu için silinemez!" });
            }
            throw error;
        }

        // BAŞARILI: success: true yanına message ekliyoruz
        res.status(200).json({ 
            success: true, 
            message: "Tedarikçi Kaydı başarıyla silindi." 
        });
    } catch (err) {
        console.error("Tedarikçi Silme Hatası:", err);
        res.status(400).json({ 
            error: "Silme işlemi başarısız: " + err.message 
        });
    }
});


// --- KULLANICI LİSTESİ SAYFASI ---
app.get('/users', isLoggedIn, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('Users')
            .select('*')
            .order('Username', { ascending: true });

        if (error) throw error;

        res.render('users', { 
            users: users,
            // req.user yerine req.session.user göndererek yetkileri garantiye alıyoruz
            user: req.session.user 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Kullanıcılar listelenirken bir hata oluştu.");
    }
});


// --- KULLANICI EKLEME ---
// Bu işlem klasik form submit ile yapıldığı için redirect kullanmaya devam edebiliriz
app.post('/users/add', isLoggedIn, async (req, res) => {
    const { username, password, canAddStock, canDeleteStock, canManageSuppliers, canManageCategories, canManageUsers } = req.body;

    try {
        const { error } = await supabase
            .from('Users')
            .insert([{
                Username: username, // Veritabanı sütun adınız 'Username' ise büyük U kullanın
                Password: password,
                canAddStock: canAddStock === 'on',
                canDeleteStock: canDeleteStock === 'on',
                canManageSuppliers: canManageSuppliers === 'on',
                canManageCategories: canManageCategories === 'on',
                canManageUsers: canManageUsers === 'on'
            }]);

        if (error) throw error;
        req.flash('success', 'Yeni kullanıcı ve tüm yetkileri başarıyla oluşturuldu.');
        res.redirect('/users');
    } catch (err) {
        req.flash('error', 'Hata: ' + err.message);
        res.redirect('/users');
    }
});

// --- KULLANICI GÜNCELLEME (JSON Yanıtlı) ---
app.post('/users/edit', isLoggedIn, async (req, res) => {
    try {
        // Formdan gelen tüm yeni yetki alanlarını buraya ekledik
        const { oldUsername, username, password, canAddStock, canDeleteStock, canManageSuppliers, canManageCategories, canManageUsers } = req.body;
        
        let updateData = {
            Username: username.trim(),
            canAddStock: !!canAddStock,
            canDeleteStock: !!canDeleteStock,
            canManageSuppliers: !!canManageSuppliers, // Eklendi
            canManageCategories: !!canManageCategories, // Eklendi
            canManageUsers: !!canManageUsers // Eklendi
        };

        if (password && password.trim() !== "") {
            updateData.Password = password;
        }

        const { error } = await supabase
            .from('Users')
            .update(updateData)
            .eq('Username', oldUsername);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Kullanıcı ve yetkiler güncellendi." });
    } catch (err) {
        res.status(400).json({ error: "Güncelleme hatası: " + err.message });
    }
});

// --- KULLANICI SİLME (JSON Yanıtlı) ---
app.post('/users/delete/:username', isLoggedIn, async (req, res) => {
    try {
        const { username } = req.params;

        const { error } = await supabase
            .from('Users')
            .delete()
            .eq('Username', username);

        if (error) throw error;

        // BAŞARILI: JSON dön
        res.status(200).json({ success: true, message: "Kullanıcı başarıyla silindi." });
    } catch (err) {
        console.error("Kullanıcı Silme Hatası:", err);
        res.status(400).json({ error: "Kullanıcı silinemedi." });
    }
});



// --- SUNUCUYU BAŞLAT ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});