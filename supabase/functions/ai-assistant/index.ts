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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    
    // Build the full prompt from messages
    const userMessages = messages.map((m: any) => m.content).join("\n");
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userMessages}`;

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
          ...messages,
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
