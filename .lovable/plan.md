

## المشكلة

عند تسجيل طلب صب جديد، السجل بيتضاف في `client_accounts` بس مش بيتضاف في `station_accounts`. السبب المرجح:

1. **الأخطاء بتتجاهل**: الكود بيعمل `await supabase.from("station_accounts").insert(...)` بدون ما يتحقق من الخطأ — لو الإضافة فشلت (بسبب RLS أو عمود ناقص)، مفيش رسالة خطأ بتظهر والطلب بيتسجل كأن كل حاجة تمام.

2. **نفس المشكلة في `client_accounts`**: الإضافة في `client_accounts` كمان مش بتتحقق من الأخطاء.

3. **احتمال مشكلة في أعمدة الجدول**: الكود بيبعت أعمدة زي `date`, `quantity_m3`, `description` — لو أي عمود مش موجود في `station_accounts` الإضافة بتفشل بصمت.

## الحل

### الملف: `src/components/OrderForm.tsx`

1. **إضافة error handling** للـ inserts في `client_accounts` و `station_accounts` — لو حصل خطأ يطلع `console.error` ورسالة تحذيرية للمستخدم.

2. **إزالة الأعمدة المشكوك فيها** اللي ممكن تكون مش موجودة في الجدول (زي `date`, `quantity_m3`, `description`) واستخدام الأعمدة المؤكدة فقط بناءً على الـ schema المعروف:
   - `station_id`, `station_name`, `transaction_type`, `amount`, `pour_order_id`, `notes`

3. **نقل الوصف لعمود `notes`** بدل `description` لضمان التوافق.

4. **إزالة `as any`** واستخدام الأعمدة الصحيحة مباشرة.

### التعديل المحدد:

```typescript
// station_accounts insert - with error checking
if (stationId && quantity > 0) {
  const stationAmount = purchasePrice > 0 ? quantity * purchasePrice : total;
  const { error: stationErr } = await supabase.from("station_accounts").insert({
    station_id: stationId,
    station_name: form.station_name,
    transaction_type: "concrete",
    amount: stationAmount,
    pour_order_id: data.id,
    notes: `صبة ${form.concrete_type} - عميل: ${clientName}`,
  });
  if (stationErr) {
    console.error("station_accounts insert error:", stationErr);
    toast({ title: "تحذير", description: "تم إنشاء الطلب لكن فشل تسجيله في حساب المحطة", variant: "destructive" });
  }
}

// Same error handling for client_accounts insert
```

