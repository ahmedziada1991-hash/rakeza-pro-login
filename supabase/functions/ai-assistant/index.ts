import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `أنت مساعد مبيعات متخصص في شركة ركيزة لتوريد الخرسانة الجاهزة في أكتوبر سيتي.
تساعد فريق المبيعات على تصنيف العملاء وكتابة سكريبتات المكالمات وتحليل الأداء.
دايماً ترد بالعربي وتستخدم أسلوب الإقناع المناسب لمجال البناء والمقاولات.

عند تصنيف العملاء:
- ساخن 🔥: عميل عنده مشروع جاري وجاهز يطلب
- دافئ 🟠: عميل مهتم بس لسه مش جاهز
- بارد 🔵: عميل مش مهتم دلوقتي بس ممكن يحتاج بعدين

عند كتابة سكريبت مكالمة:
- ابدأ بالسلام والتعريف بالشركة
- اسأل عن المشروع والاحتياجات
- قدم العروض المناسبة
- اختم بتحديد موعد للمتابعة
- ضمّن ردود على اعتراضات شائعة مثل: السعر عالي، مش محتاج دلوقتي، عندي مورد تاني`;

const ACTION_PROMPTS: Record<string, (clientData: string) => string> = {
  classify: (d) => `بناءً على بيانات العميل التالية، صنّف العميل (ساخن/دافئ/بارد) واشرح السبب:\n\n${d}`,
  script: (d) => `اكتب سكريبت مكالمة مبيعات مخصص لهذا العميل بالعربي:\n\n${d}\n\nالسكريبت يتضمن: مقدمة، أسئلة، عرض، ردود على اعتراضات، وختام.`,
  next_step: (d) => `بناءً على بيانات هذا العميل، إيه الخطوة التالية المقترحة؟\n\n${d}`,
  followup_plan: (d) => `بناءً على بيانات العميل التالية، اكتب خطة متابعة مفصلة تتضمن: عدد مرات التواصل المقترحة، طريقة التواصل المناسبة (مكالمة/واتساب/زيارة)، نقاط مهمة يجب ذكرها، وتوقيت مناسب للتواصل:\n\n${d}`,
  execution_notes: (d) => `بناءً على بيانات العميل وتاريخ الصبات، اكتب ملاحظات تنفيذ مهمة يجب مراعاتها أثناء الصب، تشمل: احتياطات الجودة، ملاحظات الموقع، ونصائح للفريق:\n\n${d}`,
  // Legacy actions (still supported)
  last_contact: (d) => `بناءً على بيانات العميل وسجل المكالمات، متى كان آخر تواصل؟ وما هي نتيجة آخر تواصل؟\n\n${d}`,
  pour_suggestion: (d) => `بناءً على بيانات العميل، اقترح موعد مناسب للصبة القادمة مع الأسباب:\n\n${d}`,
  followup_method: (d) => `بناءً على بيانات هذا العميل، إيه أفضل طريقة للمتابعة معاه؟\n\n${d}`,
  pour_details: (d) => `بناءً على بيانات العميل، لخّص تفاصيل الصبة المطلوبة وأي ملاحظات مهمة للتنفيذ:\n\n${d}`,
  quantity_station: (d) => `بناءً على بيانات العميل، حلل الكمية المطلوبة واقترح أنسب محطة للتوريد:\n\n${d}`,
  exec_notes: (d) => `بناءً على بيانات العميل، اكتب ملاحظات تنفيذ مهمة يجب مراعاتها:\n\n${d}`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    let userPrompt: string;

    // New format: { action, role, clientData }
    if (body.action && body.clientData) {
      const promptFn = ACTION_PROMPTS[body.action];
      if (promptFn) {
        userPrompt = promptFn(body.clientData);
      } else {
        userPrompt = `حلل بيانات هذا العميل:\n\n${body.clientData}`;
      }
    }
    // Legacy format: { messages: [{ role, content }] }
    else if (body.messages) {
      userPrompt = body.messages.map((m: any) => m.content).join("\n");
    } else {
      throw new Error("Invalid request format");
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

    // Try Gemini API directly first
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (GEMINI_API_KEY) {
      console.log("Using Gemini API directly");
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
          }),
        }
      );

      if (geminiResponse.ok) {
        const data = await geminiResponse.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "لم يتم الحصول على رد";
        
        return new Response(JSON.stringify({ response: text }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", geminiResponse.status, errorText);
      }
    }

    // Fallback: Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("No API key configured");

    console.log("Using Lovable AI Gateway");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول بعد قليل" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد للاشتراك" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "لم يتم الحصول على رد";
    
    return new Response(JSON.stringify({ response: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: "حدث خطأ في المساعد الذكي" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
