import { Button } from "@/components/ui/button";
import { Download, Send } from "lucide-react";

interface OfferItem {
  grade: string;
  content_kg: string;
  cement_type: string;
  price: string;
  notes: string;
}

interface PriceOffer {
  id: string;
  client_name: string;
  company_name: string | null;
  whatsapp: string;
  items: OfferItem[];
  terms: string;
  validity_days: number;
  created_at: string;
  status: string;
  created_by: string | null;
}

interface OfferPreviewProps {
  offer: PriceOffer;
  onDownloadPDF: (offer: PriceOffer) => void;
  onWhatsApp: (offer: PriceOffer) => void;
  onClose: () => void;
}

export function OfferPreview({ offer, onDownloadPDF, onWhatsApp, onClose }: OfferPreviewProps) {
  const dateStr = new Date(offer.created_at).toLocaleDateString("ar-EG");
  const expiryDate = new Date(
    new Date(offer.created_at).getTime() + offer.validity_days * 86400000
  ).toLocaleDateString("ar-EG");
  const offerNum = offer.id.slice(0, 8).toUpperCase();

  const termsList = offer.terms
    .split(/(?=\d+\.\s)/)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Offer Card */}
      <div className="border rounded-xl overflow-hidden shadow-lg">
        {/* Header */}
        <div className="px-6 py-5" style={{ background: "#1B3A6B" }}>
          <div className="flex justify-between items-start">
            <div className="text-right">
              <h2 className="text-2xl font-bold text-white font-cairo">شركة ركيزة</h2>
              <p className="text-white/80 text-sm mt-1 font-cairo">
                لتوريد الخرسانة الجاهزة | جمهورية مصر العربية
              </p>
            </div>
            <div className="text-left text-white/90 text-xs space-y-1">
              <p>رقم العرض: {offerNum}</p>
              <p>التاريخ: {dateStr}</p>
              <p>صالح حتى: {expiryDate}</p>
            </div>
          </div>
        </div>
        {/* Gold stripe */}
        <div className="h-1" style={{ background: "#F5A623" }} />

        {/* Client info */}
        <div className="mx-5 mt-5 rounded-lg p-4" style={{ background: "#F8F9FA" }}>
          <h3 className="text-lg font-bold font-cairo" style={{ color: "#1B3A6B" }}>
            {offer.client_name}
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-500 font-cairo">
            {offer.company_name && <span>الشركة: {offer.company_name}</span>}
            <span>الجوال: {offer.whatsapp}</span>
            <span>التاريخ: {dateStr}</span>
            <span>الصلاحية: {offer.validity_days} أيام</span>
          </div>
        </div>

        {/* Items table */}
        <div className="mx-5 mt-4 rounded-lg overflow-hidden border" style={{ borderColor: "#DEE2E6" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#1B3A6B" }}>
                {["#", "الجريد", "المحتوى (كجم/م³)", "نوع الأسمنت", "السعر (ج.م/م³)", "ملاحظات"].map(
                  (h) => (
                    <th key={h} className="px-3 py-2.5 text-white font-cairo font-semibold text-center text-xs">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {offer.items.map((item, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F0F4FF" }}
                  className="border-t"
                >
                  <td className="px-3 py-2 text-center">{i + 1}</td>
                  <td className="px-3 py-2 text-center">{item.grade}</td>
                  <td className="px-3 py-2 text-center">{item.content_kg || "—"}</td>
                  <td className="px-3 py-2 text-center">{item.cement_type}</td>
                  <td
                    className="px-3 py-2 text-center font-bold"
                    style={{ color: "#1B3A6B" }}
                  >
                    {item.price}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-500">{item.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Terms */}
        <div
          className="mx-5 mt-4 rounded-lg p-4"
          style={{ background: "#F0FFF4", borderRight: "4px solid #28A745" }}
        >
          <h4 className="font-bold font-cairo mb-2" style={{ color: "#1e6432" }}>
            الشروط والأحكام
          </h4>
          <div className="space-y-1 text-sm text-gray-600 font-cairo">
            {termsList.map((term, i) => (
              <p key={i}>{term}</p>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4">
          <div className="h-1" style={{ background: "#F5A623" }} />
          <p className="text-center text-xs text-gray-400 py-3 font-cairo">
            شركة ركيزة لتوريد الخرسانة الجاهزة | جمهورية مصر العربية
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1 font-cairo gap-2"
          variant="outline"
          onClick={() => onDownloadPDF(offer)}
        >
          <Download className="h-4 w-4" />
          تحميل PDF
        </Button>
        <Button
          className="flex-1 font-cairo gap-2 text-white"
          style={{ background: "#28A745" }}
          onClick={() => onWhatsApp(offer)}
        >
          <Send className="h-4 w-4" />
          إرسال واتساب
        </Button>
      </div>
      <Button variant="ghost" className="w-full font-cairo" onClick={onClose}>
        العودة لقائمة العروض
      </Button>
    </div>
  );
}
