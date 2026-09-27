/* =====================================================================
   MTX GROUP — Localization (Arabic)
   Templates stay in English; when Arabic is active the rendered DOM is
   translated by exact text-node match. Dynamic values (names, money, dates)
   never match a key, so they're left untouched.
   ===================================================================== */
const I18N = {
  ar: {
    // Brand / chrome
    'BUSINESS OS': 'نظام الأعمال', 'POS & BUSINESS OS': 'نقاط البيع ونظام الأعمال',
    'Online': 'متصل', 'Offline': 'غير متصل', 'Offline Mode': 'وضع عدم الاتصال',
    '＋ Sale': '＋ بيع', '＋ New Sale': '＋ بيع جديد', 'View Reports': 'عرض التقارير',
    // Nav groups
    'Main': 'الرئيسية', 'Catalog': 'الكتالوج', 'Finance': 'المالية', 'People': 'الأشخاص', 'System': 'النظام',
    // Nav items
    'Dashboard': 'لوحة التحكم', 'POS Checkout': 'نقطة البيع', 'Products': 'المنتجات', 'Inventory': 'المخزون',
    'Barcode': 'الباركود', 'Financial Center': 'المركز المالي', 'Expenses': 'المصروفات', 'Invoices': 'الفواتير',
    'Reports': 'التقارير', 'Customers': 'العملاء', 'Suppliers': 'الموردون', 'Users & Roles': 'المستخدمون والصلاحيات',
    'Settings': 'الإعدادات', 'Backup & Restore': 'النسخ والاستعادة', 'Offline Status': 'حالة الاتصال',
    // Common actions
    'Save': 'حفظ', 'Cancel': 'إلغاء', 'Edit': 'تعديل', 'Delete': 'حذف', 'Add': 'إضافة', 'Close': 'إغلاق',
    'Print': '🖨 طباعة', 'Apply': 'تطبيق', 'Remove': 'إزالة', 'Confirm': 'تأكيد', 'Please confirm': 'يرجى التأكيد',
    'View': 'عرض', 'Refund': 'استرجاع', 'Pay': 'دفع', 'Save Product': 'حفظ المنتج', 'View only': 'عرض فقط',
    // Common labels
    'Name': 'الاسم', 'Phone': 'الهاتف', 'Address': 'العنوان', 'Notes': 'ملاحظات', 'Note': 'ملاحظة',
    'Status': 'الحالة', 'Active': 'نشط', 'Inactive': 'غير نشط', 'Category': 'الفئة', 'Categories': 'الفئات',
    'SKU': 'رمز المنتج', 'Unit type': 'نوع الوحدة', 'Supplier': 'المورد', 'Amount': 'المبلغ', 'Date': 'التاريخ',
    'Payment': 'الدفع', 'Payment method': 'طريقة الدفع', 'Total': 'الإجمالي', 'Subtotal': 'المجموع الفرعي',
    'Discount': 'الخصم', 'Items': 'العناصر', 'Time': 'الوقت', 'Cashier': 'الكاشير', 'Customer': 'العميل',
    'Company': 'الشركة', 'Min': 'الحد الأدنى', 'Cost': 'التكلفة', 'Price': 'السعر', 'Stock': 'المخزون',
    'Role': 'الصلاحية', 'Email': 'البريد الإلكتروني', 'Revenue': 'الإيرادات', 'Profit': 'الربح',
    // Buttons (with icons/glyphs as they appear)
    '＋ Add Product': '＋ إضافة منتج', '🏷️ Categories': '🏷️ الفئات', '＋ Add Customer': '＋ إضافة عميل',
    '＋ Add Supplier': '＋ إضافة مورد', '＋ Add User': '＋ إضافة مستخدم', '＋ Add Expense': '＋ إضافة مصروف',
    '🧾 New Purchase': '🧾 شراء جديد', 'New Purchase': 'شراء جديد', 'Purchase': 'شراء', 'Record Purchase': 'تسجيل الشراء',
    // Dashboard
    'Business Overview': 'نظرة عامة على النشاط', "Today's Sales": 'مبيعات اليوم', 'Net Profit (Today)': 'صافي الربح (اليوم)',
    'Expenses (Today)': 'مصروفات اليوم', 'Cash in Drawer': 'النقد في الدرج', 'Total Orders': 'إجمالي الطلبات',
    'Total Revenue': 'إجمالي الإيرادات', 'Inventory Value': 'قيمة المخزون', 'Low-stock Items': 'أصناف منخفضة المخزون',
    'Needs attention': 'يحتاج انتباه', 'All good': 'كل شيء جيد', 'Profit & Loss': 'الأرباح والخسائر',
    'Gross Sales': 'إجمالي المبيعات', 'Cost of Goods': 'تكلفة البضاعة', 'Gross Profit': 'إجمالي الربح',
    'Net Profit': 'صافي الربح', 'This month': 'هذا الشهر', 'Top-selling Products': 'المنتجات الأكثر مبيعاً',
    'Low-stock Alerts': 'تنبيهات نقص المخزون', 'Recent Sales': 'المبيعات الأخيرة', 'Best Cashier': 'أفضل كاشير',
    'Performance': 'الأداء', 'Top': 'الأول', 'Invoice': 'فاتورة', 'Details →': 'التفاصيل →', 'All →': 'الكل →',
    'Everything is well stocked 👍': 'كل الأصناف متوفرة 👍',
    // POS
    'All Items': 'كل الأصناف', 'Current Order': 'الطلب الحالي', 'Walk-in Customer': 'عميل عابر',
    '👤 Customer': '👤 العميل', '％ Discount': '％ خصم', '⏸ Hold': '⏸ تعليق', 'Cash': 'نقدي', 'Card': 'بطاقة',
    'Split': 'مقسّم', 'Account': 'آجل', 'Exact': 'المبلغ بالضبط', 'Clear': 'مسح', 'Change due': 'الباقي',
    '💵 Cash': '💵 نقدي', '💳 Card': '💳 بطاقة', '🔀 Split': '🔀 مقسّم', '📝 Account': '📝 آجل',
    'Cart is empty': 'السلة فارغة', 'Tap products to add': 'اضغط على المنتجات للإضافة', 'Select Customer': 'اختر العميل',
    'Apply Discount': 'تطبيق خصم', 'Beverages': 'مشروبات', 'Snacks': 'وجبات خفيفة', 'Groceries': 'بقالة',
    'Household': 'منزلية', 'Electronics': 'إلكترونيات', 'Health': 'صحة',
    // Cat POS
    'Cat POS': 'نقطة بيع الفئات', 'Calculator': 'الآلة الحاسبة', 'Choose category': 'اختر الفئة',
    'Category amount sale': 'بيع بمبلغ للفئة', 'Clear all': 'مسح الكل', 'PRESS X': 'اضغط X',
    'Invoice discount': 'خصم الفاتورة', 'Category discounts': 'خصومات الفئات', 'Complete sale': 'إتمام البيع',
    'Paid': 'مدفوع', 'Change': 'الباقي', 'Debt': 'آجل',
    'Choose a category first': 'اختر فئة أولاً', 'Type an amount first': 'اكتب مبلغاً أولاً',
    'Cart is empty — pick a category, type an amount, press X': 'السلة فارغة — اختر فئة، اكتب مبلغاً، اضغط X',
    'Pick a customer for a debt sale': 'اختر عميلاً للبيع الآجل', 'Cleared': 'تم المسح',
    'No categories yet': 'لا توجد فئات بعد', 'Clear the whole cart and all discounts?': 'مسح كل السلة وجميع الخصومات؟',
    // Cat POS reports
    'Sales by Category': 'المبيعات حسب الفئة', 'Category Sales Report': 'تقرير مبيعات الفئات',
    'Total Sold': 'إجمالي المُباع', 'Net Sold': 'صافي المُباع', 'Gross': 'الإجمالي', 'Sales': 'المبيعات',
    'Category Lines': 'أسطر الفئات', 'Categories Sold': 'الفئات المُباعة', 'Invoices': 'الفواتير',
    '🖨 Print category report': '🖨 طباعة تقرير الفئات',
    'Category-amount sales made on the Cat POS till': 'مبيعات بمبالغ الفئات من نقطة بيع الفئات',
    // Login
    'Welcome back 👋': 'مرحباً بعودتك 👋', 'All stores': 'كل المتاجر', '← All stores': '← كل المتاجر',
    'SELECT USER': 'اختر المستخدم', 'PIN': 'الرمز السري', 'Sign In →': 'تسجيل الدخول →',
    'Switch store': 'تبديل المتجر', 'Active store': 'المتجر النشط',
    'MTX GROUP': 'مجموعة MTX', 'Point of sale, inventory & accounts': 'نقطة بيع ومخزون وحسابات',
    // Sign-in hero — Melora
    'Every shade, bottle and brush —': 'كل لون وعبوة وفرشاة —',
    'counted, priced and sold.': 'محسوبة ومسعّرة ومُباعة.',
    'Skincare, makeup and fragrance in one catalogue': 'العناية بالبشرة والمكياج والعطور في كتالوج واحد',
    'Barcode checkout built for a busy counter': 'دفع بالباركود مصمّم لكاونتر مزدحم',
    'Customer accounts, loyalty points and balances': 'حسابات العملاء ونقاط الولاء والأرصدة',
    'Daily takings, profit and low-stock alerts': 'مبيعات اليوم والأرباح وتنبيهات نقص المخزون',
    // Sign-in hero — Bangeen Crystal
    'Chandeliers, stemware and gifts —': 'الثريات والكؤوس والهدايا —',
    'every piece accounted for.': 'كل قطعة محسوبة.',
    'Chandeliers, glassware and giftware in one catalogue': 'الثريات والزجاجيات والهدايا في كتالوج واحد',
    'Retail and wholesale prices on the same product': 'سعر المفرد والجملة على المنتج نفسه',
    'Accounts for showroom buyers and trade customers': 'حسابات لزبائن المعرض وتجار الجملة',
    // Store picker (first screen)
    'Select a workspace': 'اختر مساحة العمل',
    'Which store are you': 'في أي متجر', 'working in today?': 'تعمل اليوم؟',
    'Enter store': 'ادخل المتجر',
    'Beauty & Cosmetics': 'الجمال ومستحضرات التجميل', 'Crystal & Glassware': 'الكريستال والزجاجيات',
    'Skincare, fragrance and colour — the full Melora catalogue.': 'العناية بالبشرة والعطور والمكياج — كتالوج ميلورا الكامل.',
    'Crystal, glassware and giftware — the Bangeen showroom.': 'الكريستال والزجاجيات والهدايا — معرض بەنگین.',
    'RETAIL SUITE': 'منظومة التجزئة', 'MTX Group Retail Suite': 'منظومة التجزئة — مجموعة MTX',
    // Settings
    'Store': 'المتجر', 'Currency': 'العملة', 'Receipt & Invoice': 'الإيصال والفاتورة',
    'Appearance & Language': 'المظهر واللغة', 'Data & Offline': 'البيانات والاتصال', 'Store name': 'اسم المتجر',
    'Save Store Info': 'حفظ معلومات المتجر', 'Theme': 'المظهر', 'Light': 'فاتح', 'Dark': 'داكن',
    'Language & Direction': 'اللغة والاتجاه', 'Selling currency': 'عملة البيع', 'Exchange rate': 'سعر الصرف',
    'Preview': 'معاينة', 'Team Members': 'أعضاء الفريق', 'Roles & Permissions': 'الأدوار والصلاحيات',
    'No access': 'لا يوجد وصول', 'Language': 'اللغة', 'Toggle theme': 'تبديل المظهر',
    'Live snapshot of your store': 'لقطة حية لمتجرك', 'Your shift so far': 'ورديتك حتى الآن',
    "Today's sales and products": 'مبيعات ومنتجات اليوم', "Today's Sales": 'مبيعات اليوم', 'orders': 'طلبات', 'margin': 'هامش', 'pcs': 'قطعة',
    'Needs attention': 'يحتاج انتباه', 'left': 'متبقٍ', 'in stock': 'في المخزون', 'Out of stock': 'غير متوفر',
    // Supplier account
    'You Owe (Payable)': 'المستحق عليك', 'Products from Them': 'منتجات منه', 'Stock You Hold (cost)': 'المخزون لديك (تكلفة)',
    'Revenue from Their Products': 'الإيراد من منتجاته', 'Buying from them': 'الشراء منه', 'Selling their products': 'بيع منتجاته',
    'Total purchased': 'إجمالي المشتريات', 'Payments made': 'المدفوعات', 'Currently owed': 'المستحق حالياً',
    'Units sold (net)': 'الوحدات المباعة (صافي)', 'Cost of goods': 'تكلفة البضاعة', 'Profit earned': 'الربح المحقق',
    'In Stock': 'في المخزون', 'Sold': 'المباع', 'Stock Value': 'قيمة المخزون', 'Recent purchases': 'المشتريات الأخيرة',
    'Record Payment': 'تسجيل دفعة', 'units in stock': 'وحدة في المخزون', 'products': 'منتجات',
    // Placeholders
    'Search products, invoices, customers…': 'ابحث في المنتجات والفواتير والعملاء…',
    'Search product or scan barcode…': 'ابحث عن منتج أو امسح الباركود…',
    'Search name, SKU, barcode…': 'ابحث بالاسم أو الرمز أو الباركود…',
    'Enter PIN': 'أدخل الرمز السري', 'Search customer…': 'ابحث عن عميل…',
    'Search invoice #, cashier…': 'ابحث برقم الفاتورة أو الكاشير…', 'Scan or type barcode…': 'امسح أو اكتب الباركود…',
    'New category name': 'اسم فئة جديدة', 'Description': 'الوصف', 'Optional reason / reference': 'سبب / مرجع اختياري',
    // Roles (display only — underlying value stays English)
    'Super Admin': 'المدير العام', 'Admin': 'مسؤول', 'Manager': 'مدير', 'Accountant': 'محاسب', 'Inventory Staff': 'موظف مخزون', 'User': 'المستخدم',
    // Reports / date presets
    'Sales': 'المبيعات', 'Cashiers': 'الكاشيرون', 'Profit & Expenses': 'الأرباح والمصروفات',
    'Sales, products, staff and profit analytics': 'تحليلات المبيعات والمنتجات والموظفين والأرباح',
    'Today': 'اليوم', 'Yesterday': 'أمس', 'Last 7 days': 'آخر 7 أيام', 'Last 30 days': 'آخر 30 يوم',
    'Last month': 'الشهر الماضي', 'This year': 'هذه السنة', 'All time': 'كل الوقت', 'All-time': 'كل الوقت',
    'Revenue Trend': 'اتجاه الإيرادات', 'Daily Sales Report': 'تقرير المبيعات اليومي', 'Monthly Sales Report': 'تقرير المبيعات الشهري',
    'Avg Ticket': 'متوسط الفاتورة', 'Orders': 'الطلبات', 'Date': 'التاريخ', 'Month': 'الشهر',
    'Best Sellers': 'الأكثر مبيعاً', 'Slow Movers': 'بطيئة الحركة', 'Product Sales Report': 'تقرير مبيعات المنتجات',
    'Units Sold': 'الوحدات المباعة', 'Cashier Performance': 'أداء الكاشير', 'Total Sales': 'إجمالي المبيعات',
    'Expenses by Category': 'المصروفات حسب الفئة', 'Refunds': 'المرتجعات', 'Net Revenue': 'صافي الإيرادات', 'by day': 'حسب اليوم', 'by month': 'حسب الشهر',
    // Finance
    'Financial Center': 'المركز المالي', 'Profit & loss, cash flow, debts and balances': 'الأرباح والخسائر والتدفق النقدي والديون والأرصدة',
    'Full Reports': 'التقارير الكاملة', 'Gross Revenue': 'إجمالي الإيرادات', 'Cost of Goods': 'تكلفة البضاعة', 'Gross Profit': 'إجمالي الربح',
    'Profit & Loss Statement': 'بيان الأرباح والخسائر', 'Sales income': 'دخل المبيعات', 'Payment Methods': 'طرق الدفع',
    'Cash Drawer': 'درج النقد', 'Opening balance': 'الرصيد الافتتاحي', 'Expected in drawer': 'المتوقع في الدرج',
    'Receivables (Customer debt)': 'الذمم المدينة (ديون العملاء)', 'Payables (Supplier debt)': 'المستحقات (ديون الموردين)',
    'Manage debts →': 'إدارة الديون →', 'Manage payables →': 'إدارة المستحقات →', 'Monthly Cash Flow': 'التدفق النقدي الشهري',
    'Cash In': 'نقد داخل', 'Cash Out': 'نقد خارج', 'Net': 'صافي', 'Net Profit': 'صافي الربح',
    '= Gross profit': '= إجمالي الربح', '= Net profit': '= صافي الربح',
    // Products / inventory / barcode
    'Product': 'المنتج', 'SKU / Barcode': 'الرمز / الباركود', 'Item': 'الصنف', 'Qty': 'الكمية', 'Method': 'الطريقة',
    'Stock Levels': 'مستويات المخزون', 'Movement History': 'سجل الحركة', 'Stock control, movements & valuation': 'التحكم بالمخزون والحركات والتقييم',
    'Inventory Value (cost)': 'قيمة المخزون (تكلفة)', 'Retail Value': 'قيمة البيع', 'Total Units': 'إجمالي الوحدات', 'Low / Out of Stock': 'منخفض / نافد',
    'Low': 'منخفض', 'OK': 'جيد', 'No movements yet — add stock to begin': 'لا حركات بعد — أضف مخزوناً للبدء',
    'Barcode Management': 'إدارة الباركود', 'Generate, print & scan barcode labels': 'توليد وطباعة ومسح ملصقات الباركود',
    'Barcode Scanner Test': 'اختبار قارئ الباركود', 'Generate Barcode': 'توليد باركود', 'Generate': 'توليد',
    'Create a code for products without one.': 'أنشئ رمزاً للمنتجات التي لا تملك واحداً.', 'Printable Labels': 'ملصقات قابلة للطباعة',
    'Generate for all missing': 'توليد لكل الناقص', 'Barcode Scanning': 'مسح الباركود',
    // Expenses
    'Track every cost of running the business': 'تتبّع كل تكاليف تشغيل النشاط', 'This Month': 'هذا الشهر', 'All-time Expenses': 'إجمالي المصروفات',
    'Recurring': 'متكرر', 'Expense Records': 'سجلات المصروفات', 'By Category': 'حسب الفئة',
    'Rent': 'إيجار', 'Salaries': 'رواتب', 'Utilities': 'مرافق', 'Maintenance': 'صيانة', 'Delivery': 'توصيل', 'Supplies': 'مستلزمات', 'Marketing': 'تسويق', 'Other': 'أخرى',
    // Customers / suppliers
    'Total Spent': 'إجمالي الإنفاق', 'Points': 'النقاط', 'Debt': 'دين', 'We Owe': 'علينا', 'Open': 'فتح', 'Clear': 'خالص',
    'Purchase History': 'سجل المشتريات', 'Purchase #': 'رقم الشراء', 'Company': 'الشركة',
    // Invoices
    'Invoices & Receipts': 'الفواتير والإيصالات', 'Invoice #': 'رقم الفاتورة', 'Date & Time': 'التاريخ والوقت', 'Refund': 'استرجاع',
    'Exchange': 'استبدال', 'Cancel': 'إلغاء', 'Cancelled': 'ملغاة', 'Returning': 'المُرتجع', 'New items': 'أصناف جديدة',
    'Customer pays': 'يدفع العميل', 'Refund to customer': 'استرجاع للعميل', 'Even exchange': 'استبدال متساوٍ', 'Difference': 'الفرق',
    'Returned value': 'قيمة المُرتجع', 'New items value': 'قيمة الأصناف الجديدة', 'Complete Exchange': 'إتمام الاستبدال', 'No new items yet': 'لا أصناف جديدة بعد',
    // Users
    'Users & Permissions': 'المستخدمون والصلاحيات', 'role-based access control': 'تحكم بالوصول حسب الصلاحية', 'Team Members': 'أعضاء الفريق',
    'Roles & Permissions': 'الأدوار والصلاحيات', 'Activity & Login Log': 'سجل النشاط والدخول', 'signed in': 'سجّل الدخول',
    'All modules': 'كل الوحدات', 'User management': 'إدارة المستخدمين', 'Delete records': 'حذف السجلات', 'Disabled': 'معطّل', 'Full name': 'الاسم الكامل', 'Login PIN': 'الرمز السري',
    // Settings
    'Configure this store': 'اضبط هذا المتجر', 'Receipt footer message': 'رسالة تذييل الإيصال',
    'Show logo': 'إظهار الشعار', 'Show barcode/QR': 'إظهار الباركود/الرمز', 'Default printer': 'الطابعة الافتراضية', 'Copies': 'النسخ',
    'Save Receipt Settings': 'حفظ إعدادات الإيصال', 'Selling currency': 'عملة البيع', 'Exchange rate': 'سعر الصرف',
    'Open Backup Center': 'فتح مركز النسخ', 'Offline Database': 'قاعدة بيانات بدون اتصال', 'Offline & Storage Status': 'حالة الاتصال والتخزين',
    // Server & Sync
    'Server & Sync': 'الخادم والمزامنة', 'Server address': 'عنوان الخادم', 'Test connection': 'اختبار الاتصال',
    'Connect this terminal': 'ربط هذا الجهاز', 'Disconnect this terminal': 'فصل هذا الجهاز',
    'Sync now': 'مزامنة الآن', "Upload this terminal's data": 'رفع بيانات هذا الجهاز', 'Full re-download': 'إعادة التنزيل الكامل',
    'Status': 'الحالة', 'This terminal': 'هذا الجهاز', 'Waiting to upload': 'بانتظار الرفع', 'Last sync': 'آخر مزامنة',
    'Sync': 'مزامنة', 'Synced': 'تمت المزامنة', 'Syncing…': 'جارٍ المزامنة…', 'Sync off': 'المزامنة متوقفة',
    'Sync error': 'خطأ في المزامنة', 'Sign in': 'تسجيل الدخول', 'never': 'أبداً', 'connecting': 'جارٍ الاتصال',
    'Setting up this terminal…': 'جارٍ تهيئة هذا الجهاز…', 'Sync complete': 'اكتملت المزامنة',
    'Incorrect user or PIN': 'المستخدم أو الرمز غير صحيح', 'Reconnect to the server to add or edit users': 'أعد الاتصال بالخادم لإضافة أو تعديل المستخدمين',
    // Backup
    'Export Backup': 'تصدير نسخة', 'Restore Backup': 'استيراد نسخة', 'Danger Zone': 'منطقة خطر', 'Reset All Data': 'إعادة ضبط كل البيانات',
    'Automatic Local Backup': 'نسخ احتياطي محلي تلقائي', 'Last backup': 'آخر نسخة', 'Never': 'أبداً', 'Enabled': 'مُفعّل', 'Sales invoices': 'فواتير المبيعات',
    'Erase everything and start from an empty system': 'امسح كل شيء وابدأ من نظام فارغ',
    // Offline
    'Offline & Storage': 'دون اتصال والتخزين', 'Connection': 'الاتصال', 'Service Worker': 'عامل الخدمة', 'Local Database': 'قاعدة بيانات محلية',
    'Storage Used': 'التخزين المستخدم', 'Storage Usage': 'استخدام التخزين', 'How the suite works offline': 'كيف يعمل النظام بدون إنترنت',
    'Local IndexedDB': 'قاعدة IndexedDB محلية', 'Local Printing': 'طباعة محلية', 'Cloud Sync': 'المزامنة السحابية', 'Ready': 'جاهز', 'Manual': 'يدوي', 'None': 'لا يوجد',
    'App shell cached for offline': 'واجهة التطبيق مخزّنة للعمل دون اتصال', 'All features working': 'كل الميزات تعمل',
    'Not available. This device does not share data with any other device.': 'غير متاحة. هذا الجهاز لا يشارك البيانات مع أي جهاز آخر.',
    'Manual only — download a backup file yourself from Backup & Restore.': 'يدوي فقط — نزّل ملف النسخة الاحتياطية بنفسك من النسخ والاستعادة.',
    'Install as App': 'تثبيت كتطبيق', 'Backup Data Now': 'انسخ البيانات الآن',
    // Emoji-prefixed buttons / chips
    '⚖ Adjust Stock': '⚖ تعديل المخزون', '📥 Stock In': '📥 إدخال مخزون', '🖨 Print Sheet': '🖨 طباعة الورقة',
    '📄 Export PDF': '📄 تصدير PDF', '📊 Export CSV': '📊 تصدير CSV', '📊 Full Reports': '📊 التقارير الكاملة',
    '🪙 Cash Drawer': '🪙 درج النقد', '🥤 Beverages': '🥤 مشروبات', '🍫 Snacks': '🍫 وجبات خفيفة', '🛒 Groceries': '🛒 بقالة',
    '🧴 Household': '🧴 منزلية', '🔋 Electronics': '🔋 إلكترونيات', '💊 Health': '💊 صحة', '👤 Walk-in Customer': '👤 عميل عابر',
    'in stock': 'في المخزون', 'items': 'صنف', 'categories': 'فئة', 'sales': 'مبيعة', 'invoices': 'فاتورة', 'expenses': 'مصروف',
    'customers': 'عملاء', 'suppliers': 'موردون', 'outstanding debt': 'ديون مستحقة', 'payable': 'مستحقات',
    // Exact variants (emoji-prefixed buttons and signed P&L labels)
    '📤 Export Backup': '📤 تصدير نسخة', '📥 Restore Backup': '📥 استيراد نسخة', '⚠ Danger Zone': '⚠ منطقة خطر',
    '🔄 Automatic Local Backup': '🔄 نسخ احتياطي محلي تلقائي', '⬇ Download Backup File': '⬇ تنزيل ملف النسخة',
    '⬆ Restore From File': '⬆ استعادة من ملف', '📲 Install as App': '📲 تثبيت كتطبيق',
    'Backups': 'النسخ الاحتياطي', '⚠ Backups are manual': '⚠ النسخ الاحتياطي يدوي', 'Last downloaded': 'آخر تنزيل',
    'Sales — Last 7 days': 'المبيعات — آخر 7 أيام', 'Type': 'النوع', 'Revenue': 'الإيرادات',
    '− Cost of goods sold': '− تكلفة البضاعة المباعة', '− Operating expenses': '− المصروفات التشغيلية',
    '＋ Cash sales': '＋ مبيعات نقدية', '− Cash expenses': '− مصروفات نقدية',
    'Sales income': 'دخل المبيعات', 'Import data from an MTX backup file. This replaces current data.': 'استيراد البيانات من ملف نسخة MTX. سيستبدل البيانات الحالية.',
    'Net margin': 'صافي الهامش', 'Owed to you by': 'مستحق لك من', 'You owe': 'أنت مدين لـ',
    'Cart': 'السلة', 'Charge': 'دفع', 'total': 'الإجمالي', 'Monthly': 'شهري', 'Daily': 'يومي',
    '🖨 Print': '🖨 طباعة', 'Print': 'طباعة', 'Total in range': 'الإجمالي في المدة', 'Records': 'السجلات',
    'thermal & A4 printing': 'طباعة حرارية و A4',
    '⇪ Import from Excel': '⇪ استيراد من إكسل', 'Import products from Excel': 'استيراد المنتجات من إكسل',
    '⇩ Download template': '⇩ تنزيل القالب', 'Import': 'استيراد', 'new': 'جديد', 'update': 'تحديث',
    'Min stock': 'الحد الأدنى', 'Wholesale': 'الجملة', 'Unit': 'الوحدة',
    'no records in this range': 'لا سجلات في هذه المدة', 'refunds': 'مرتجعات', 'Apply': 'تطبيق',
    'No expenses in this range': 'لا مصروفات في هذه المدة', 'No invoices in this range to print': 'لا فواتير في هذه المدة للطباعة',
    'Sales Report': 'تقرير المبيعات', 'Products from Them': 'منتجات منه'
  }
};

/* Translate a subtree in place. Only whole, exactly-matching text nodes and
   placeholders are replaced, so mixed/dynamic content is never mangled. */
function translateTree(node, lang) {
  const dict = I18N[lang];
  if (!node || !dict) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((n) => {
    const key = n.nodeValue.trim();
    if (key && dict[key] !== undefined) n.nodeValue = n.nodeValue.replace(key, dict[key]);
  });
  const scope = node.querySelectorAll ? node : document;
  (node.querySelectorAll ? node.querySelectorAll('[placeholder]') : []).forEach((el) => {
    const key = el.getAttribute('placeholder').trim();
    if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
  });
  (node.querySelectorAll ? node.querySelectorAll('[title]') : []).forEach((el) => {
    const key = el.getAttribute('title').trim();
    if (dict[key] !== undefined) el.setAttribute('title', dict[key]);
  });
}
window.I18N = I18N;
window.translateTree = translateTree;
