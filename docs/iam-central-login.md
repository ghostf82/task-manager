# الدخول المركزي لبرنامج إدارة المهام

## السلوك
1. `loginAction` يستدعي أولًا  
   `POST /api/program-central-login` على بوابة الموارد البشرية مع `slug=tasks`.
2. عند نجاح العضوية المركزية يُنشأ أو يُربط مستخدم Auth محلي ويُفتح جلسة عبر `generateLink` + `verifyOtp` دون نسخ كلمة المرور.
3. إن فشل المسار المركزي يُجرَّب `signInWithPassword` المحلي كاحتياطي للحسابات التاريخية.

## متغيرات اختيارية
- `HR_CENTRAL_LOGIN_URL`
- `HR_PORTAL_SUPABASE_URL` + `HR_PORTAL_SERVICE_ROLE_KEY` لتحديث كلمة المرور المركزية من شاشة تحديث كلمة المرور عند وجود `hr_platform_user_id`.
