import type { ReactNode } from 'react';
import type { TableIconActionTone } from '@/src/components/erp/TableIconAction';

type ButtonLook = {
  icon: string;
  tone: TableIconActionTone;
  solid?: boolean;
  /** Keep existing child icons; only apply distinctive tone colors. */
  skipIcon?: boolean;
};

/** Map common Arabic (and a few English) button labels → icon + distinctive tone. */
const EXACT: Record<string, ButtonLook> = {
  تحديث: { icon: 'refresh', tone: 'neutral' },
  حفظ: { icon: 'save', tone: 'save' },
  'حفظ التعديلات': { icon: 'save', tone: 'save' },
  'حفظ المسودة': { icon: 'save', tone: 'save' },
  'حفظ مسودة': { icon: 'save', tone: 'save' },
  'حفظ مسودة وطباعة': { icon: 'save', tone: 'save' },
  'حفظ التغييرات': { icon: 'save', tone: 'save' },
  'حفظ سريع': { icon: 'save', tone: 'save' },
  'حفظ الحالة': { icon: 'save', tone: 'save' },
  'إضافة متابعة': { icon: 'add_comment', tone: 'submit' },
  'التفاصيل والمتابعة': { icon: 'manage_search', tone: 'view' },
  'تسجيل شكوى': { icon: 'report_problem', tone: 'reject' },
  'فتح طلب الصيانة': { icon: 'open_in_new', tone: 'view' },
  'حفظ القالب': { icon: 'save', tone: 'save' },
  إلغاء: { icon: 'close', tone: 'neutral' },
  إغلاق: { icon: 'close', tone: 'neutral' },
  حذف: { icon: 'delete', tone: 'delete' },
  تعديل: { icon: 'edit', tone: 'edit' },
  طباعة: { icon: 'print', tone: 'print' },
  'طباعة PDF': { icon: 'picture_as_pdf', tone: 'print' },
  'طباعة A4': { icon: 'print', tone: 'print' },
  إضافة: { icon: 'add', tone: 'submit' },
  'منتج جديد': { icon: 'add', tone: 'submit' },
  'تقرير جديد': { icon: 'add', tone: 'submit' },
  'إلغاء الربط': { icon: 'link_off', tone: 'delete' },
  'إلغاء عمال الخط': { icon: 'link_off', tone: 'delete' },
  'إلغاء عمال كل الخطوط': { icon: 'link_off', tone: 'delete' },
  'جاري الإلغاء...': { icon: 'hourglass_empty', tone: 'neutral' },
  'جاري الحفظ...': { icon: 'hourglass_empty', tone: 'save' },
  'جاري تجهيز الصورة...': { icon: 'hourglass_empty', tone: 'share' },
  'مشاركة عبر WhatsApp': { icon: 'share', tone: 'share' },
  'ربط دائم': { icon: 'link', tone: 'submit' },
  'حفظ الدور': { icon: 'save', tone: 'save' },
  'ربط بموظف': { icon: 'link', tone: 'submit' },
  'فك الربط': { icon: 'link_off', tone: 'undo' },
  'تحديث الإيميل/الباسورد': { icon: 'key', tone: 'edit' },
  'الموافقة + تفعيل الوصول': { icon: 'verified_user', tone: 'approve' },
  'تعطيل المستخدم': { icon: 'block', tone: 'undo' },
  'تفعيل المستخدم': { icon: 'check_circle', tone: 'approve' },
  'رفع شعار': { icon: 'upload', tone: 'submit' },
  'تغيير الشعار': { icon: 'upload', tone: 'edit' },
  'حذف الشعار': { icon: 'delete', tone: 'delete' },
  'جاري الرفع...': { icon: 'hourglass_empty', tone: 'neutral' },
  معاينة: { icon: 'visibility', tone: 'view' },
  'إضافة صنف': { icon: 'add', tone: 'submit' },
  'إضافة منتج': { icon: 'add', tone: 'submit' },
  'إضافة منتج مفكك': { icon: 'add', tone: 'submit' },
  'إضافة مكون فقط': { icon: 'add', tone: 'submit' },
  'إضافة مكون للمجموعة': { icon: 'add', tone: 'submit' },
  'إضافة راك': { icon: 'add', tone: 'submit' },
  'إضافة أرفف': { icon: 'view_week', tone: 'submit' },
  'إضافة مخزن': { icon: 'add', tone: 'submit' },
  إنشاء: { icon: 'add_circle', tone: 'submit' },
  'إنشاء إذن': { icon: 'precision_manufacturing', tone: 'edit' },
  فتح: { icon: 'open_in_new', tone: 'view' },
  عرض: { icon: 'visibility', tone: 'view' },
  'عرض تفاصيل النقص': { icon: 'warning_amber', tone: 'undo' },
  رجوع: { icon: 'arrow_forward', tone: 'neutral' },
  العودة: { icon: 'arrow_forward', tone: 'neutral' },
  السابق: { icon: 'arrow_forward', tone: 'neutral' },
  التالي: { icon: 'arrow_back', tone: 'submit' },
  تصدير: { icon: 'download', tone: 'export' },
  Excel: { icon: 'download', tone: 'export' },
  'تصدير Excel': { icon: 'download', tone: 'export' },
  'تصدير PDF': { icon: 'picture_as_pdf', tone: 'export' },
  'تنزيل PDF': { icon: 'picture_as_pdf', tone: 'export' },
  'كارت الصيانة الداخلي': { icon: 'badge', tone: 'print' },
  'كارت داخلي': { icon: 'badge', tone: 'print' },
  'إيصال العميل': { icon: 'receipt_long', tone: 'print' },
  إيصال: { icon: 'receipt_long', tone: 'print' },
  داخلي: { icon: 'badge', tone: 'print' },
  'فتح الورشة': { icon: 'handyman', tone: 'execute' },
  'إنشاء شكوى': { icon: 'report', tone: 'reject' },
  'إرسال رابط الموافقة': { icon: 'send', tone: 'share' },
  'طباعة إذن التسليم': { icon: 'print', tone: 'print' },
  'PDF إذن التسليم': { icon: 'picture_as_pdf', tone: 'export' },
  'تجهيز إذن الدفع': { icon: 'request_quote', tone: 'approve' },
  'تجهيز إقفال الضمان': { icon: 'verified', tone: 'approve' },
  'تحصيل كامل وتسليم': { icon: 'payments', tone: 'approve', solid: true },
  'تأكيد تسليم المنتج': { icon: 'local_shipping', tone: 'approve', solid: true },
  'تسليم ضمان': { icon: 'local_shipping', tone: 'approve', solid: true },
  'إعادة إصلاح': { icon: 'restart_alt', tone: 'edit' },
  'تسجيل غير قابل للإصلاح': { icon: 'report', tone: 'reject' },
  'طلب استبدال': { icon: 'swap_horiz', tone: 'edit' },
  'حذف الطلب': { icon: 'delete', tone: 'delete' },
  'رفع Excel': { icon: 'upload_file', tone: 'submit' },
  'تحميل نموذج': { icon: 'download', tone: 'export' },
  'تحميل النموذج': { icon: 'download', tone: 'export' },
  'تحميل نموذج Excel': { icon: 'download', tone: 'export' },
  اعتماد: { icon: 'check_circle', tone: 'approve' },
  رفض: { icon: 'cancel', tone: 'reject' },
  تنفيذ: { icon: 'play_circle', tone: 'execute' },
  'تنفيذ الاستيراد': { icon: 'play_circle', tone: 'execute' },
  تقديم: { icon: 'send', tone: 'submit' },
  إرسال: { icon: 'send', tone: 'submit' },
  مشاركة: { icon: 'share', tone: 'share' },
  'حفظ ومشاركة واتساب': { icon: 'share', tone: 'share' },
  بحث: { icon: 'search', tone: 'view' },
  تصفية: { icon: 'filter_list', tone: 'view' },
  'مسح الفلاتر': { icon: 'filter_alt_off', tone: 'neutral' },
  'حسناً': { icon: 'check', tone: 'approve' },
  تأكيد: { icon: 'check_circle', tone: 'approve' },
  تعطيل: { icon: 'block', tone: 'undo' },
  تفعيل: { icon: 'check_circle', tone: 'approve' },
  'تفعيل الراك': { icon: 'check_circle', tone: 'approve' },
  'تعطيل الراك': { icon: 'block', tone: 'undo' },
  'تفعيل الرف': { icon: 'check_circle', tone: 'approve' },
  'تعطيل الرف': { icon: 'block', tone: 'undo' },
  نسخ: { icon: 'content_copy', tone: 'view' },
  قائمة: { icon: 'view_list', tone: 'view' },
  بطاقات: { icon: 'grid_view', tone: 'view' },
  جدول: { icon: 'table_chart', tone: 'view' },
  الكل: { icon: 'select_all', tone: 'neutral' },
  مرتجع: { icon: 'undo', tone: 'undo' },
  تعويض: { icon: 'replay', tone: 'edit' },
  هالك: { icon: 'delete_forever', tone: 'delete' },
  'طباعة الآن': { icon: 'print', tone: 'print' },
  'حفظ الحركة': { icon: 'save', tone: 'save' },
  'حفظ الراك': { icon: 'save', tone: 'save' },
  'حفظ الأرفف': { icon: 'save', tone: 'save' },
  'حفظ الافتراضي': { icon: 'save', tone: 'save' },
  'حفظ التعديل': { icon: 'save', tone: 'save' },
  'تعبئة من BOM': { icon: 'playlist_add', tone: 'submit' },
  'حذف المجموعة': { icon: 'delete', tone: 'delete' },
  'فاتورة جديدة': { icon: 'receipt_long', tone: 'execute' },
  'إضافة فرع': { icon: 'add_business', tone: 'submit' },
  'إضافة الفرع': { icon: 'add_business', tone: 'submit' },
  'جهاز جديد': { icon: 'devices', tone: 'submit' },
  'لوحة كنبان': { icon: 'view_kanban', tone: 'view' },
  'مركز الاتصال': { icon: 'support_agent', tone: 'view' },
  'قطع الغيار': { icon: 'build', tone: 'view' },
  'لوحة الصيانة': { icon: 'home_repair_service', tone: 'view' },
  'طلبات الصيانة': { icon: 'assignment', tone: 'view' },
  'كل الطلبات': { icon: 'list_alt', tone: 'view' },
  // Repair admin dashboard quick-nav (PageHeader + section links)
  'طلبات الأدمن': { icon: 'admin_panel_settings', tone: 'execute' },
  الطلبات: { icon: 'assignment', tone: 'view' },
  التوريد: { icon: 'local_shipping', tone: 'share' },
  'سندات الصرف': { icon: 'payments', tone: 'edit' },
  'تقرير الخزينة': { icon: 'account_balance', tone: 'save' },
  'الخزينة اليومية': { icon: 'point_of_sale', tone: 'save' },
  'التقرير الشهري': { icon: 'calendar_month', tone: 'view' },
  'أداء الفنيين': { icon: 'groups', tone: 'view' },
  الشكاوى: { icon: 'report_problem', tone: 'reject' },
  'طلبات العملاء': { icon: 'support_agent', tone: 'submit' },
  العهدة: { icon: 'inventory_2', tone: 'share' },
  'غير القابل': { icon: 'block', tone: 'undo' },
  الاستبدال: { icon: 'swap_horiz', tone: 'export' },
  'التسعير (الماستر)': { icon: 'payments', tone: 'edit' },
  الفروع: { icon: 'store', tone: 'submit' },
  'مؤشرات العملاء': { icon: 'analytics', tone: 'view' },
  المخزون: { icon: 'warehouse', tone: 'view' },
  الورشة: { icon: 'handyman', tone: 'execute' },
  'تطبيق الحالة': { icon: 'play_circle', tone: 'execute' },
  'حجز للطلب': { icon: 'bookmark_add', tone: 'submit' },
  'تسجيل بلاغ صيانة سريع': { icon: 'add_circle', tone: 'submit' },
  'بلاغ بنفس الجهاز': { icon: 'content_copy', tone: 'submit' },
  'حذف نهائي': { icon: 'delete_forever', tone: 'delete' },
  'عرض الفنيين': { icon: 'engineering', tone: 'view' },
  'أضف موظف': { icon: 'person_add', tone: 'submit' },
  'إضافة موظف': { icon: 'person_add', tone: 'submit' },
  مبسط: { icon: 'view_agenda', tone: 'view' },
  'كثيف البيانات': { icon: 'table_rows', tone: 'view' },
  تسعير: { icon: 'payments', tone: 'edit' },
  'ملخص العمال': { icon: 'groups', tone: 'view' },
  'تقرير الإنجاز': { icon: 'assessment', tone: 'view' },
  'تقييم العمالة': { icon: 'star_rate', tone: 'view' },
  'نقل من خط إلى خط': { icon: 'swap_horiz', tone: 'export' },
  نقل: { icon: 'swap_horiz', tone: 'export' },
  الأهداف: { icon: 'flag', tone: 'view' },
  'فتح إدارة المستخدمين': { icon: 'manage_accounts', tone: 'view' },
  'فتح صفحة المستخدمين': { icon: 'manage_accounts', tone: 'view' },
  'مشاركة بيانات الدخول واتساب': { icon: 'share', tone: 'share' },
  'إسناد الطلب للفني المختار': { icon: 'person_add', tone: 'submit' },
  'إسناد الطلب لي': { icon: 'assignment_ind', tone: 'submit' },
  'إسناد للفني المختار': { icon: 'person_add', tone: 'submit' },
  'تغيير الفني': { icon: 'swap_horiz', tone: 'submit' },
  'إسناد لي': { icon: 'assignment_ind', tone: 'submit' },
  'فك الإسناد': { icon: 'person_off', tone: 'reject' },
  'إضافة/خصم': { icon: 'tune', tone: 'edit' },
  'تفاصيل / إيصال': { icon: 'receipt_long', tone: 'view' },
  'التفاصيل / إسناد الفني': { icon: 'engineering', tone: 'view' },
  'فتح إعادة الإصلاح': { icon: 'restart_alt', tone: 'execute' },
  'إخفاء خيارات إعادة الإصلاح': { icon: 'expand_less', tone: 'neutral' },
  'إنشاء طلب إعادة إصلاح': { icon: 'add_circle', tone: 'submit' },
  'عرض الطلبات': { icon: 'assignment', tone: 'view' },
  'إقفال الدورة': { icon: 'lock', tone: 'approve' },
  إقفال: { icon: 'lock', tone: 'approve' },
  'دورة جديدة': { icon: 'add_circle', tone: 'submit' },
  'عرض الاحتياجات': { icon: 'list_alt', tone: 'view' },
  'إضافة مادة': { icon: 'add', tone: 'submit' },
  'عرض بالنافذة': { icon: 'open_in_new', tone: 'view' },
  'العودة لقائمة الدورات': { icon: 'arrow_forward', tone: 'neutral' },
  'نعم، احذف': { icon: 'delete', tone: 'delete' },
  'متابعة نقص': { icon: 'warning_amber', tone: 'undo' },
  'أمر شغل مرتبط بالخطة': { icon: 'assignment', tone: 'execute' },
  'تقرير إنتاج': { icon: 'assessment', tone: 'submit' },
  'تفاصيل الخطة': { icon: 'dock_to_right', tone: 'view' },
  إزالة: { icon: 'delete', tone: 'delete' },
  'عرض قائمة المواد (BOM)': { icon: 'account_tree', tone: 'view' },
  إيقاف: { icon: 'pause_circle', tone: 'undo' },
  تصفير: { icon: 'restart_alt', tone: 'neutral' },
  بدء: { icon: 'play_arrow', tone: 'execute' },
  استئناف: { icon: 'play_arrow', tone: 'execute' },
  'قواعد الوردية': { icon: 'settings', tone: 'print' },
  'إشعار توقيع': { icon: 'edit_calendar', tone: 'edit' },
  'عرض كل الإجازات': { icon: 'event', tone: 'view' },
  'عرض كل السُلف': { icon: 'payments', tone: 'view' },
  صرف: { icon: 'payments', tone: 'approve' },
  'تأكيد الصرف': { icon: 'payments', tone: 'approve' },
  'تأكيد صرف الكل': { icon: 'done_all', tone: 'approve' },
  حاضر: { icon: 'check_circle', tone: 'approve' },
  حضور: { icon: 'check_circle', tone: 'approve' },
  غائب: { icon: 'cancel', tone: 'reject' },
  غياب: { icon: 'cancel', tone: 'reject' },
  موافقة: { icon: 'check_circle', tone: 'approve' },
  'موافقة وتفعيل': { icon: 'check_circle', tone: 'approve' },
  'جاري الموافقة...': { icon: 'hourglass_empty', tone: 'neutral' },
  'إعادة احتساب': { icon: 'calculate', tone: 'execute' },
  'جار إعادة الاحتساب...': { icon: 'hourglass_empty', tone: 'neutral' },
  'تطبيق الفلاتر': { icon: 'filter_list', tone: 'view' },
  'تحديث العمال': { icon: 'refresh', tone: 'neutral' },
  'عرض تفاصيل الإنتاج الكاملة': { icon: 'visibility', tone: 'view' },
  'إدارة المستخدم': { icon: 'manage_accounts', tone: 'view' },
  'كروت جرد الصفحة': { icon: 'print', tone: 'print' },
  تراجع: { icon: 'undo', tone: 'undo' },
  'فتح حركات المخزون': { icon: 'swap_horiz', tone: 'view' },
  'نسخ المتبقي لترحيل أول المدة': { icon: 'content_copy', tone: 'view' },
  'إضافة هالك': { icon: 'delete_forever', tone: 'delete' },
  'حفظ تقرير الهالك': { icon: 'save', tone: 'save' },
  'تحديث قائمة الشركات': { icon: 'refresh', tone: 'neutral' },
  'زيارة لوحة الشركة': { icon: 'open_in_new', tone: 'view' },
  'نسخ الرابط الكامل': { icon: 'content_copy', tone: 'view' },
  'تفعيل الشركة': { icon: 'check_circle', tone: 'approve' },
  'تعطيل الشركة': { icon: 'block', tone: 'undo' },
  'تحميل التقرير': { icon: 'download', tone: 'export' },
  'PDF KPI': { icon: 'picture_as_pdf', tone: 'export' },
  'PDF العيوب': { icon: 'picture_as_pdf', tone: 'export' },
  'تحميل المزيد': { icon: 'expand_more', tone: 'neutral' },
  إخفاء: { icon: 'expand_less', tone: 'neutral' },
  'نسخة احتياطية JSON': { icon: 'download', tone: 'export' },
  'حذف السجل فقط': { icon: 'delete', tone: 'delete' },
  'حذف كامل البيانات': { icon: 'delete_forever', tone: 'delete' },
  'إخفاء الموظفين': { icon: 'expand_less', tone: 'neutral' },
  'عرض الموظفين': { icon: 'visibility', tone: 'view' },
  'إزالة الصور': { icon: 'image_not_supported', tone: 'delete' },
  'إنشاء السلفة': { icon: 'add_circle', tone: 'submit' },
  التوزيع: { icon: 'pie_chart', tone: 'view' },
  'تقديم الطلب': { icon: 'send', tone: 'submit' },
  'تأكيد حذف السجل': { icon: 'delete', tone: 'delete' },
  'إخفاء تفاصيل المجموعات': { icon: 'expand_less', tone: 'neutral' },
  'عرض تفاصيل المجموعات': { icon: 'expand_more', tone: 'view' },
  'تحميل الإحصائيات من Firestore': { icon: 'analytics', tone: 'view' },
  'تم ✓': { icon: 'check_circle', tone: 'approve' },
  'جاري...': { icon: 'hourglass_empty', tone: 'neutral' },
  واتساب: { icon: 'share', tone: 'share' },
  'جاري المشاركة...': { icon: 'hourglass_empty', tone: 'neutral' },
  '+ فرعية': { icon: 'add', tone: 'submit' },
  'تصدير كصورة': { icon: 'image', tone: 'export' },
  إظهار: { icon: 'visibility', tone: 'view' },
  'إظهار الكل': { icon: 'visibility', tone: 'view' },
  'مسارات الإنتاج': { icon: 'account_tree', tone: 'view' },
  'إلغاء التقييم': { icon: 'cancel', tone: 'reject' },
  'إنشاء رابط موافقة': { icon: 'fact_check', tone: 'approve' },
  'رجوع لأوامر الشغل': { icon: 'arrow_forward', tone: 'neutral' },
  'حذف المحدد': { icon: 'delete', tone: 'delete' },
  'تحويل لفردي': { icon: 'precision_manufacturing', tone: 'export' },
  'تحويل لجماعي': { icon: 'call_split', tone: 'export' },
  'تفعيل خصم الهالك': { icon: 'done_all', tone: 'approve' },
  'تعطيل خصم الهالك': { icon: 'remove_done', tone: 'undo' },
  'كروت الجرد': { icon: 'print', tone: 'print' },
  'إلغاء التحديد': { icon: 'close', tone: 'neutral' },
  'إلغاء تحديد الكل': { icon: 'deselect', tone: 'neutral' },
  'تحميل قالب المنتجات': { icon: 'download', tone: 'export' },
  'تحميل قالب بيانات المنتجات': { icon: 'download', tone: 'export' },
  'تحميل قالب بيانات المواد': { icon: 'download', tone: 'export' },
  'تحميل قالب المكونات': { icon: 'download', tone: 'export' },
  'رفع/تحديث بيانات المنتجات': { icon: 'upload_file', tone: 'submit' },
  'رفع/تحديث بيانات المواد': { icon: 'upload', tone: 'submit' },
  'رفع/تحديث مكونات المنتجات': { icon: 'upload_file', tone: 'submit' },
  'تصدير بيانات المنتجات (للاستيراد)': { icon: 'table_chart', tone: 'export' },
  'تصدير بيانات المواد (للاستيراد)': { icon: 'download', tone: 'export' },
  'تصدير مكونات المنتجات (للاستيراد)': { icon: 'table_chart', tone: 'export' },
  'تصدير تقرير المنتجات (Excel)': { icon: 'table_chart', tone: 'export' },
  'تصدير تقرير المنتجات بإنتاج الشهر': { icon: 'table_chart', tone: 'export' },
  'تحميل نموذج التقارير': { icon: 'download', tone: 'export' },
  'تحميل قالب الاستيراد': { icon: 'download', tone: 'export' },
  'تحميل القالب': { icon: 'download', tone: 'export' },
  'تحميل القالب (مع اللوكيشن)': { icon: 'download', tone: 'export' },
  'حساب جديد': { icon: 'person_add', tone: 'submit' },
  المزيد: { icon: 'more_horiz', tone: 'neutral' },
  'تسجيل الخروج': { icon: 'logout', tone: 'delete' },
  تثبيت: { icon: 'download', tone: 'approve' },
  'تحديد الكل كمقروء': { icon: 'done_all', tone: 'approve' },
  'Mark all as read': { icon: 'done_all', tone: 'approve' },
  فك: { icon: 'link_off', tone: 'undo' },
  'فك التعيين': { icon: 'link_off', tone: 'undo' },
  'عرض السجل': { icon: 'history', tone: 'view' },
  'حفظ / تغيير': { icon: 'save', tone: 'save' },
  'مسح الكل': { icon: 'filter_alt_off', tone: 'neutral' },
  'Clear all': { icon: 'filter_alt_off', tone: 'neutral' },
  'إنشاء دور جديد': { icon: 'add_circle', tone: 'submit' },
  'تعديل الصلاحيات': { icon: 'edit', tone: 'edit' },
  'إرسال الإشعار': { icon: 'send', tone: 'submit' },
  'مسح المسودة': { icon: 'delete_sweep', tone: 'delete' },
  'معاينة محلية': { icon: 'visibility', tone: 'view' },
  'اعتماد ورفع البيانات': { icon: 'cloud_upload', tone: 'approve' },
  'بدء الوردية الآن': { icon: 'play_circle', tone: 'execute' },
  'نسيت كلمة المرور؟': { icon: 'lock_reset', tone: 'view' },
  'إنشاء حساب جديد': { icon: 'person_add', tone: 'submit' },
  'تسجيل الدخول': { icon: 'login', tone: 'execute' },
  'اختيار ملف الاستيراد': { icon: 'upload_file', tone: 'submit' },
  'تحديد الكل غير المنشأ': { icon: 'select_all', tone: 'neutral' },
  ترحيل: { icon: 'sync_alt', tone: 'execute' },
  'أمر الشغل': { icon: 'assignment', tone: 'view' },
  'فتح الإعدادات': { icon: 'settings', tone: 'print' },
  'عرض عمالة الخط': { icon: 'groups', tone: 'view' },
  'إعادة تعيين للقيم الافتراضية': { icon: 'restart_alt', tone: 'undo' },
  'تجاهل التغييرات': { icon: 'undo', tone: 'neutral' },
  'تأكيد الحذف': { icon: 'delete', tone: 'delete' },
  'جار التحميل...': { icon: 'hourglass_empty', tone: 'neutral' },
  اليوم: { icon: 'today', tone: 'view' },
  أمس: { icon: 'event', tone: 'view' },
  'آخر 7 أيام': { icon: 'date_range', tone: 'view' },
  'هذا الشهر': { icon: 'calendar_month', tone: 'view' },
  'استيراد جديد': { icon: 'upload_file', tone: 'submit' },
  مسح: { icon: 'filter_alt_off', tone: 'neutral' },
  'متابعة إلى تسجيل الدخول': { icon: 'login', tone: 'submit' },
  Close: { icon: 'close', tone: 'neutral' },
  Cancel: { icon: 'close', tone: 'neutral' },
  Save: { icon: 'save', tone: 'save' },
  'إغلاق الوردية': { icon: 'stop_circle', tone: 'approve' },
  'متابعة / إغلاق': { icon: 'stop_circle', tone: 'approve' },
  'بدء الوردية': { icon: 'play_circle', tone: 'execute' },
  'مشاركة واتساب': { icon: 'share', tone: 'share' },
  'إنشاء خطة': { icon: 'add_task', tone: 'submit' },
  'تغيير الحالة': { icon: 'swap_horiz', tone: 'edit' },
  'تحديث الحالة': { icon: 'save', tone: 'save' },
  'ترحيل التاريخ للمحدد': { icon: 'event_repeat', tone: 'execute' },
  'توليد احتياجات المواد': { icon: 'inventory', tone: 'submit' },
  توليد: { icon: 'autorenew', tone: 'execute' },
  'طلب جديد': { icon: 'add', tone: 'submit' },
  'تنفيذ جديد لنفس المنتج': { icon: 'add_circle', tone: 'submit' },
  'العودة للمسارات': { icon: 'arrow_forward', tone: 'neutral' },
  'جاري قراءة الملف...': { icon: 'hourglass_empty', tone: 'neutral' },
  'إنشاء الدور': { icon: 'add_circle', tone: 'submit' },
  'إضافة إلى الجدول': { icon: 'playlist_add', tone: 'submit' },
  'فئة رئيسية': { icon: 'add', tone: 'submit' },
  'إضافة فئة فرعية': { icon: 'add', tone: 'submit' },
  'إضافة فئة رئيسية': { icon: 'add', tone: 'submit' },
  'تحويل جديد': { icon: 'add', tone: 'submit' },
  'طباعة المرجع': { icon: 'print', tone: 'print' },
  'تم الحفظ': { icon: 'check_circle', tone: 'approve' },
  'إعادة تعيين': { icon: 'restart_alt', tone: 'undo' },
  'إضافة زر سريع': { icon: 'add', tone: 'submit' },
  'إضافة Widget': { icon: 'widgets', tone: 'submit' },
  'تفويض جديد': { icon: 'person_add', tone: 'submit' },
  'إنشاء التفويض': { icon: 'add_circle', tone: 'submit' },
  'إضافة بدل': { icon: 'add', tone: 'submit' },
  'جزاء تأديبي': { icon: 'gavel', tone: 'reject' },
  'إلغاء التفعيل': { icon: 'block', tone: 'undo' },
  'العودة للقائمة': { icon: 'arrow_forward', tone: 'neutral' },
  'صفحة الرواتب': { icon: 'receipt_long', tone: 'view' },
  'فتح مركز الموافقات': { icon: 'open_in_new', tone: 'view' },
  'طباعة الكشف': { icon: 'print', tone: 'print' },
  'حفظ أيام السنة': { icon: 'save', tone: 'save' },
  'ترحيل ربط المنتجات': { icon: 'sync_alt', tone: 'execute' },
  'جاري الترحيل...': { icon: 'hourglass_empty', tone: 'neutral' },
  'جاري التصدير...': { icon: 'hourglass_empty', tone: 'neutral' },
  'جاري حفظ تكامل الحضور...': { icon: 'hourglass_empty', tone: 'save' },
  'حفظ إعدادات تكامل الحضور': { icon: 'save', tone: 'save' },
  'إضافة سبب': { icon: 'add', tone: 'submit' },
  'إضافة نوع إجازة': { icon: 'add', tone: 'submit' },
  'إضافة منطقة': { icon: 'add', tone: 'submit' },
  'إضافة خصم': { icon: 'add', tone: 'submit' },
  'السنة السابقة': { icon: 'chevron_right', tone: 'neutral' },
  'السنة التالية': { icon: 'chevron_left', tone: 'neutral' },
};

const PREFIX: Array<{ test: RegExp; look: ButtonLook }> = [
  { test: /^تحديث/, look: { icon: 'refresh', tone: 'neutral' } },
  { test: /^حفظ وإغلاق/, look: { icon: 'save', tone: 'save' } },
  { test: /^حفظ/, look: { icon: 'save', tone: 'save' } },
  { test: /^إلغاء|^الغاء/, look: { icon: 'close', tone: 'neutral' } },
  { test: /^إغلاق|^اغلاق/, look: { icon: 'close', tone: 'neutral' } },
  { test: /^حذف نهائي/, look: { icon: 'delete_forever', tone: 'delete' } },
  { test: /^حذف/, look: { icon: 'delete', tone: 'delete' } },
  { test: /^تعديل/, look: { icon: 'edit', tone: 'edit' } },
  { test: /^طباعة/, look: { icon: 'print', tone: 'print' } },
  { test: /^إضافة|^اضافه|^أضف/, look: { icon: 'add', tone: 'submit' } },
  { test: /^إنشاء|^انشاء/, look: { icon: 'add_circle', tone: 'submit' } },
  { test: /^فتح/, look: { icon: 'open_in_new', tone: 'view' } },
  { test: /^عرض/, look: { icon: 'visibility', tone: 'view' } },
  { test: /^رجوع|^العودة|^عودة/, look: { icon: 'arrow_forward', tone: 'neutral' } },
  { test: /^تصدير|^تنزيل/, look: { icon: 'download', tone: 'export' } },
  { test: /^اعتماد/, look: { icon: 'check_circle', tone: 'approve' } },
  { test: /^رفض/, look: { icon: 'cancel', tone: 'reject' } },
  { test: /^تنفيذ/, look: { icon: 'play_circle', tone: 'execute' } },
  { test: /^تقديم|^إرسال/, look: { icon: 'send', tone: 'submit' } },
  { test: /^مشاركة/, look: { icon: 'share', tone: 'share' } },
  { test: /^تأكيد صرف/, look: { icon: 'payments', tone: 'approve' } },
  { test: /^تأكيد/, look: { icon: 'check_circle', tone: 'approve' } },
  { test: /^إعادة احتساب/, look: { icon: 'calculate', tone: 'execute' } },
  { test: /^موافقة/, look: { icon: 'check_circle', tone: 'approve' } },
  { test: /^حاضر|^حضور$/, look: { icon: 'check_circle', tone: 'approve' } },
  { test: /^غائب|^غياب$/, look: { icon: 'cancel', tone: 'reject' } },
  { test: /^تطبيق الفلاتر/, look: { icon: 'filter_list', tone: 'view' } },
  { test: /^إدارة المستخدم/, look: { icon: 'manage_accounts', tone: 'view' } },
  { test: /^نسخ/, look: { icon: 'content_copy', tone: 'view' } },
  { test: /^تحميل/, look: { icon: 'download', tone: 'export' } },
  { test: /^رفع/, look: { icon: 'upload', tone: 'submit' } },
  { test: /^استيراد/, look: { icon: 'upload_file', tone: 'submit' } },
  { test: /^إعادة/, look: { icon: 'refresh', tone: 'neutral' } },
  { test: /^مسح/, look: { icon: 'filter_alt_off', tone: 'neutral' } },
  { test: /^مرتجع/, look: { icon: 'undo', tone: 'undo' } },
  { test: /^تعويض/, look: { icon: 'replay', tone: 'edit' } },
  { test: /^هالك/, look: { icon: 'delete_forever', tone: 'delete' } },
  { test: /^تفعيل/, look: { icon: 'check_circle', tone: 'approve' } },
  { test: /^تعطيل/, look: { icon: 'block', tone: 'undo' } },
  { test: /^تعبئة/, look: { icon: 'playlist_add', tone: 'submit' } },
  { test: /^نقل/, look: { icon: 'swap_horiz', tone: 'export' } },
  { test: /^إسناد/, look: { icon: 'person_add', tone: 'submit' } },
  { test: /^حجز/, look: { icon: 'bookmark_add', tone: 'submit' } },
  { test: /^تطبيق/, look: { icon: 'play_circle', tone: 'execute' } },
  { test: /^تسعير/, look: { icon: 'payments', tone: 'edit' } },
  { test: /^تسجيل بلاغ|^بلاغ/, look: { icon: 'add_circle', tone: 'submit' } },
  { test: /^جاري|^جارٍ/, look: { icon: 'hourglass_empty', tone: 'neutral' } },
  { test: /^إقفال/, look: { icon: 'lock', tone: 'approve' } },
  { test: /^إيقاف/, look: { icon: 'pause_circle', tone: 'undo' } },
  { test: /^إزالة/, look: { icon: 'delete', tone: 'delete' } },
  { test: /^متابعة إلى/, look: { icon: 'login', tone: 'submit' } },
  { test: /^متابعة/, look: { icon: 'warning_amber', tone: 'undo' } },
  { test: /^Close$/i, look: { icon: 'close', tone: 'neutral' } },
  { test: /^Cancel$/i, look: { icon: 'close', tone: 'neutral' } },
  { test: /^Save$/i, look: { icon: 'save', tone: 'save' } },
  { test: /^دورة/, look: { icon: 'add_circle', tone: 'submit' } },
  { test: /^صرف$/, look: { icon: 'payments', tone: 'approve' } },
  { test: /^تراجع/, look: { icon: 'undo', tone: 'undo' } },
  { test: /^بدء|^استئناف/, look: { icon: 'play_arrow', tone: 'execute' } },
  { test: /^تصفير/, look: { icon: 'restart_alt', tone: 'neutral' } },
  { test: /^تفاصيل الخطة/, look: { icon: 'dock_to_right', tone: 'view' } },
  { test: /^نعم[،,]?\s*احذف/, look: { icon: 'delete', tone: 'delete' } },
  { test: /^مسح\s*\(/, look: { icon: 'filter_alt_off', tone: 'neutral' } },
  { test: /^إخفاء/, look: { icon: 'expand_less', tone: 'neutral' } },
  { test: /^عرض الموظفين/, look: { icon: 'visibility', tone: 'view' } },
  { test: /^تحميل المزيد/, look: { icon: 'expand_more', tone: 'neutral' } },
  { test: /^نسخة احتياطية/, look: { icon: 'download', tone: 'export' } },
  { test: /^حذف السجل/, look: { icon: 'delete', tone: 'delete' } },
  { test: /^حذف كامل/, look: { icon: 'delete_forever', tone: 'delete' } },
  { test: /صرف إنتاج|إذن صرف|إنشاء إذن/, look: { icon: 'precision_manufacturing', tone: 'edit' } },
  { test: /تحويل/, look: { icon: 'sync_alt', tone: 'export' } },
  { test: /استلام/, look: { icon: 'inventory_2', tone: 'share' } },
  { test: /جرد|مطابقة/, look: { icon: 'checklist', tone: 'save' } },
  { test: /تحليل/, look: { icon: 'analytics', tone: 'view' } },
  { test: /إعدادات|توجيه/, look: { icon: 'settings', tone: 'print' } },
  { test: /استثناء|نقص/, look: { icon: 'warning_amber', tone: 'undo' } },
  { test: /مراجعة/, look: { icon: 'manage_search', tone: 'view' } },
  { test: /تفاصيل/, look: { icon: 'visibility', tone: 'view' } },
  { test: /فاتورة/, look: { icon: 'receipt_long', tone: 'execute' } },
  { test: /أرفف|راك/, look: { icon: 'view_week', tone: 'submit' } },
  { test: /منتج|مادة|مكون/, look: { icon: 'add_circle', tone: 'submit' } },
  { test: /جهاز/, look: { icon: 'devices', tone: 'submit' } },
  { test: /كنبان|كانبان/, look: { icon: 'view_kanban', tone: 'view' } },
  { test: /فرع/, look: { icon: 'add_business', tone: 'submit' } },
  { test: /فني/, look: { icon: 'engineering', tone: 'view' } },
  { test: /صيانة/, look: { icon: 'home_repair_service', tone: 'view' } },
  { test: /ورشة/, look: { icon: 'handyman', tone: 'execute' } },
  { test: /موظف/, look: { icon: 'person_add', tone: 'submit' } },
  { test: /أهداف/, look: { icon: 'flag', tone: 'view' } },
  { test: /^إظهار/, look: { icon: 'visibility', tone: 'view' } },
  { test: /^مسارات/, look: { icon: 'account_tree', tone: 'view' } },
  { test: /^إلغاء التقييم/, look: { icon: 'cancel', tone: 'reject' } },
  { test: /رابط موافقة|موافقة/, look: { icon: 'fact_check', tone: 'approve' } },
  { test: /إيصال/, look: { icon: 'receipt_long', tone: 'view' } },
  { test: /^فك/, look: { icon: 'link_off', tone: 'undo' } },
  { test: /^معاينة/, look: { icon: 'visibility', tone: 'view' } },
  { test: /^اختيار/, look: { icon: 'upload_file', tone: 'submit' } },
  { test: /^تحديد الكل/, look: { icon: 'select_all', tone: 'neutral' } },
  { test: /^إنشاء\/تفعيل|^إنشاء\/تفعيل/, look: { icon: 'person_add', tone: 'submit' } },
  { test: /^ترحيل/, look: { icon: 'sync_alt', tone: 'execute' } },
  { test: /^أمر الشغل/, look: { icon: 'assignment', tone: 'view' } },
  { test: /^كروت/, look: { icon: 'print', tone: 'print' } },
  { test: /^نسيت/, look: { icon: 'lock_reset', tone: 'view' } },
  { test: /^جار\s/, look: { icon: 'hourglass_empty', tone: 'neutral' } },
  { test: /^سجل الاستيراد/, look: { icon: 'history', tone: 'view' } },
  { test: /^حفظ الكل/, look: { icon: 'save', tone: 'save' } },
  { test: /PDF/i, look: { icon: 'picture_as_pdf', tone: 'print' } },
  { test: /Excel/i, look: { icon: 'download', tone: 'export' } },
  { test: /واتساب|WhatsApp/i, look: { icon: 'share', tone: 'share' } },
];

function extractPlainLabel(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children).replace(/\s+/g, ' ').trim();
  }
  if (Array.isArray(children)) {
    return children.map(extractPlainLabel).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const props = (children as { props?: { children?: ReactNode } }).props;
    return extractPlainLabel(props?.children);
  }
  return '';
}

function hasExplicitIcon(children: ReactNode): boolean {
  if (children == null || typeof children === 'boolean') return false;
  if (typeof children === 'string' || typeof children === 'number') return false;
  if (Array.isArray(children)) return children.some(hasExplicitIcon);
  if (typeof children === 'object' && children !== null && 'props' in children) {
    const el = children as {
      type?: unknown;
      props?: { className?: string; children?: ReactNode };
    };
    const type = el.type;
    const cls = String(el.props?.className || '');

    if (typeof type === 'string') {
      if (type === 'svg') return true;
      if (type === 'span' && cls.includes('material-icons')) return true;
      // HTML wrappers — look inside
      return hasExplicitIcon(el.props?.children);
    }

    // Function / forwardRef / memo components (Lucide icons, custom icons…)
    if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
      const name =
        typeof type === 'function'
          ? (type as { displayName?: string; name?: string }).displayName
            || (type as { name?: string }).name
            || ''
          : String(
            (type as { displayName?: string; render?: { name?: string } }).displayName
              || (type as { render?: { name?: string } }).render?.name
              || '',
          );

      // Don't treat layout wrappers as icons — recurse into them
      if (
        name === 'Fragment'
        || name === 'BrowserRouter'
        || /^(Link|NavLink|Router|MemoryRouter)$/i.test(name)
      ) {
        return hasExplicitIcon(el.props?.children);
      }

      return true;
    }
  }
  return false;
}

export function resolveButtonLook(
  children: ReactNode,
  opts?: { iconName?: string; tone?: TableIconActionTone; solid?: boolean },
): ButtonLook | null {
  if (opts?.iconName) {
    const label = extractPlainLabel(children);
    const matched = matchLabel(label);
    return {
      icon: opts.iconName,
      tone: opts.tone ?? matched?.tone ?? 'neutral',
      solid: opts.solid ?? matched?.solid,
    };
  }

  const label = extractPlainLabel(children);
  const matched = matchLabel(label);

  if (hasExplicitIcon(children)) {
    if (matched || opts?.tone) {
      return {
        icon: '',
        tone: opts?.tone ?? matched?.tone ?? 'neutral',
        solid: opts?.solid ?? matched?.solid,
        skipIcon: true,
      };
    }
    return null;
  }

  if (!label) {
    if (opts?.tone) {
      return { icon: 'chevron_left', tone: opts.tone, solid: opts.solid };
    }
    return null;
  }

  if (matched) return { ...matched, solid: opts?.solid ?? matched.solid };

  if (opts?.tone) {
    return { icon: 'chevron_left', tone: opts.tone, solid: opts.solid };
  }

  return null;
}

function matchLabel(label: string): ButtonLook | null {
  if (!label) return null;
  const exact = EXACT[label];
  if (exact) return exact;
  for (const row of PREFIX) {
    if (row.test.test(label)) return row.look;
  }
  return null;
}
