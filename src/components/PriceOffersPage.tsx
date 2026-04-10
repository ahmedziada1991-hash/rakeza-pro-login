import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileText, Printer, Send, Eye } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const GRADE_OPTIONS = ["B200", "B300", "B350", "B400"];
const DEFAULT_TERMS = "1. الأسعار تشمل التوريد والضخ ما لم نذكر ذلك. 2. العرض ساري لمدة 3 أيام. 3. الدفع: كاش بعد الصبه.";

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

const emptyItem = (): OfferItem => ({
  grade: "B300",
  content_kg: "",
  cement_type: "OPC",
  price: "",
  notes: "",
});

function formatPhone(raw: string): string {
  let phone = raw.replace(/[^0-9]/g, "");
  if (phone.startsWith("0")) phone = "20" + phone.slice(1);
  return phone;
}

function generatePDF(offer: PriceOffer) {
  const doc = new jsPDF({ orientation: "portrait" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const offerNum = String(offer.id).slice(0, 8).toUpperCase();
  const dateStr = new Date(offer.created_at).toLocaleDateString("en-GB");
  const expiryDate = new Date(new Date(offer.created_at).getTime() + offer.validity_days * 86400000).toLocaleDateString("en-GB");

  doc.setFillColor(27, 58, 107);
  doc.rect(0, 0, pw, 44, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("ROKEEZA", pw - 15, 18, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Ready-Mix Concrete Supplier | Arab Republic of Egypt", pw - 15, 27, { align: "right" });
  doc.setFontSize(9);
  doc.text(`Offer #: ${offerNum}`, 15, 14);
  doc.text(`Date: ${dateStr}`, 15, 21);
  doc.text(`Valid until: ${expiryDate}`, 15, 28);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PRICE QUOTATION", 15, 39);

  doc.setFillColor(245, 166, 35);
  doc.rect(0, 44, pw, 4, "F");

  const clientY = 56;
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(15, clientY, pw - 30, offer.company_name ? 30 : 24, 3, 3, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(27, 58, 107);
  doc.text(`Client: ${offer.client_name}`, 22, clientY + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  let infoLine = clientY + 18;
  if (offer.company_name) {
    doc.text(`Company: ${offer.company_name}`, 22, infoLine);
    infoLine += 8;
  }
  doc.text(`Mobile: ${offer.whatsapp}`, 22, infoLine);

  const tableStartY = clientY + (offer.company_name ? 38 : 32);
  const head = [["#", "Grade", "Content (kg/m3)", "Cement Type", "Price (EGP/m3)", "Notes"]];
  const body = offer.items.map((item, i) => [
    String(i + 1), item.grade, item.content_kg || "-", item.cement_type, item.price, item.notes || "-",
  ]);

  doc.autoTable({
    head, body, startY: tableStartY,
    styles: { fontSize: 10, halign: "center", cellPadding: 5, lineColor: [222, 226, 230], lineWidth: 0.3 },
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: "bold", fontSize: 10 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    bodyStyles: { textColor: [50, 50, 50] },
    columnStyles: { 4: { fontStyle: "bold", textColor: [27, 58, 107] } },
    margin: { left: 15, right: 15 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || tableStartY + 60;
  const termsY = finalY + 12;
  const termParts = offer.terms.split(/(\d+\.\s*)/).filter(Boolean);
  const numTerms = termParts.filter(p => /^\d+\.\s*$/.test(p)).length;
  const termsHeight = Math.max(numTerms * 8 + 18, 35);

  doc.setFillColor(240, 255, 244);
  doc.roundedRect(15, termsY, pw - 30, termsHeight, 3, 3, "F");
  doc.setFillColor(40, 167, 69);
  doc.rect(pw - 19, termsY, 4, termsHeight, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 100, 50);
  doc.text("Terms & Conditions", 22, termsY + 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  let ty = termsY + 18;
  let termText = "";
  for (const part of termParts) {
    if (/^\d+\.\s*$/.test(part)) {
      if (termText) {
        const wrapped = doc.splitTextToSize(termText.trim(), pw - 50);
        doc.text(wrapped, 22, ty);
        ty += wrapped.length * 5;
      }
      termText = part;
    } else {
      termText += part;
    }
  }
  if (termText) {
    const wrapped = doc.splitTextToSize(termText.trim(), pw - 50);
    doc.text(wrapped, 22, ty);
  }

  doc.setFillColor(245, 166, 35);
  doc.rect(0, ph - 18, pw, 4, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("Rokeeza - Ready-Mix Concrete Supplier | Arab Republic of Egypt", pw / 2, ph - 7, { align: "center" });

  return doc;
}

// ──────────────────────────── Component ────────────────────────────

export function PriceOffersPage({ prefillName, prefillPhone }: { prefillName?: string; prefillPhone?: string }) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<PriceOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewOffer, setViewOffer] = useState<PriceOffer | null>(null);

  // Form state
  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [items, setItems] = useState<OfferItem[]>([emptyItem()]);
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [validityDays, setValidityDays] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from props (when coming from follow-up page)
  useEffect(() => {
    if (prefillName) {
      setClientName(prefillName);
      setWhatsapp(prefillPhone || "");
      setShowForm(true);
    }
  }, [prefillName, prefillPhone]);

  const fetchOffers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("price_offers")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setOffers(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const resetForm = () => {
    setClientName("");
    setCompanyName("");
    setWhatsapp("");
    setItems([emptyItem()]);
    setTerms(DEFAULT_TERMS);
    setValidityDays(3);
  };

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof OfferItem, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const handleCreate = async () => {
    if (!clientName.trim() || !whatsapp.trim()) {
      toast.error("اسم العميل ورقم الواتساب مطلوبين");
      return;
    }
    if (items.some((it) => !it.grade || !it.price)) {
      toast.error("تأكد من ملء الجريد والسعر لكل صنف");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("price_offers").insert({
      client_name: clientName.trim(),
      company_name: companyName.trim() || null,
      whatsapp: whatsapp.trim(),
      items: JSON.parse(JSON.stringify(items)),
      terms,
      validity_days: validityDays,
      created_by: user?.id ?? null,
      status: "sent",
    });

    setSubmitting(false);

    if (error) {
      console.error("Supabase insert error:", error);
      toast.error(`خطأ: ${error.message}`);
      return;
    }

    toast.success("تم إنشاء العرض بنجاح ✅");
    setShowForm(false);
    resetForm();
    fetchOffers();
  };

  const handlePrint = (offer: PriceOffer) => {
    try {
      const doc = generatePDF(offer);
      doc.save(`عرض-سعر-ركيزة.pdf`);
    } catch (e) {
      console.error("PDF error:", e);
      toast.error("خطأ في إنشاء الـ PDF");
    }
  };

  const handleWhatsApp = (offer: PriceOffer) => {
    handlePrint(offer);
    const phone = formatPhone(offer.whatsapp);
    const msg = encodeURIComponent("السلام عليكم 👋 مرفق عرض سعر خرسانة جاهزة من شركة ركيزة 🏗️ يسعدنا خدمتكم");
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const statusLabel: Record<string, string> = {
    sent: "مُرسل", accepted: "مقبول", rejected: "مرفوض", expired: "منتهي",
  };
  const statusColor: Record<string, string> = {
    sent: "bg-blue-100 text-blue-800", accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800", expired: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-cairo font-bold">عروض الأسعار</h2>
        <Button
          className="font-cairo gap-2"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          <Plus className="h-4 w-4" />
          عرض سعر جديد
        </Button>
      </div>

      {/* New Offer Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-cairo">عرض سعر جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="font-cairo">اسم العميل *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل" className="font-cairo" />
              </div>
              <div>
                <Label className="font-cairo">اسم الشركة (اختياري)</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="اسم الشركة" className="font-cairo" />
              </div>
              <div>
                <Label className="font-cairo">رقم الواتساب *</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="201xxxxxxxxx" dir="ltr" />
              </div>
            </div>

            <div>
              <Label className="font-cairo font-semibold">جدول الأصناف</Label>
              <div className="border rounded-lg overflow-auto mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-cairo text-right">الجريد</TableHead>
                      <TableHead className="font-cairo text-right">المحتوى (كجم/م³)</TableHead>
                      <TableHead className="font-cairo text-right">نوع الأسمنت</TableHead>
                      <TableHead className="font-cairo text-right">السعر (ج.م/م³)</TableHead>
                      <TableHead className="font-cairo text-right">ملاحظات</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={item.grade} onValueChange={(v) => updateItem(idx, "grade", v)}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {GRADE_OPTIONS.map((g) => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={item.content_kg} onChange={(e) => updateItem(idx, "content_kg", e.target.value)} className="w-24" placeholder="350" />
                        </TableCell>
                        <TableCell>
                          <Input value={item.cement_type} onChange={(e) => updateItem(idx, "cement_type", e.target.value)} className="w-20" placeholder="OPC" />
                        </TableCell>
                        <TableCell>
                          <Input value={item.price} onChange={(e) => updateItem(idx, "price", e.target.value)} className="w-24" placeholder="2500" />
                        </TableCell>
                        <TableCell>
                          <Input value={item.notes} onChange={(e) => updateItem(idx, "notes", e.target.value)} className="w-28" placeholder="ملاحظات" />
                        </TableCell>
                        <TableCell>
                          {items.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" size="sm" className="mt-2 font-cairo gap-1" onClick={addItem}>
                <Plus className="h-3 w-3" /> إضافة صنف
              </Button>
            </div>

            <div>
              <Label className="font-cairo">الشروط والأحكام</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="font-cairo text-sm" />
            </div>

            <div className="w-40">
              <Label className="font-cairo">صلاحية العرض (أيام)</Label>
              <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} min={1} />
            </div>

            <Button className="w-full font-cairo gap-2" onClick={handleCreate} disabled={submitting}>
              <FileText className="h-4 w-4" />
              {submitting ? "جاري الإنشاء..." : "إنشاء العرض"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Offer Dialog */}
      {viewOffer && (
        <Dialog open={true} onOpenChange={() => setViewOffer(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" dir="rtl">
            {/* Header */}
            <div style={{ background: "#1B3A6B" }} className="px-6 py-6 rounded-t-lg">
              <div className="flex justify-between items-start">
                <div className="text-right">
                  <h2 className="text-3xl font-bold text-white font-cairo">شركة ركيزة</h2>
                  <p className="text-white/70 text-sm mt-1 font-cairo">لتوريد الخرسانة الجاهزة | جمهورية مصر العربية</p>
                </div>
                <div className="text-left text-white text-sm space-y-1.5">
                  <p className="font-bold">رقم العرض: <span className="font-mono">{String(viewOffer.id).slice(0, 8).toUpperCase()}</span></p>
                  <p>التاريخ: {new Date(viewOffer.created_at).toLocaleDateString("ar-EG")}</p>
                  <p>صالح حتى: <span className="font-semibold text-yellow-300">{new Date(new Date(viewOffer.created_at).getTime() + viewOffer.validity_days * 86400000).toLocaleDateString("ar-EG")}</span></p>
                </div>
              </div>
            </div>
            <div style={{ background: "#F5A623", height: 5 }} />

            {/* Client info */}
            <div className="mx-5 mt-5 rounded-lg p-5" style={{ background: "#F8F9FA" }}>
              <h3 className="text-xl font-bold font-cairo" style={{ color: "#1B3A6B" }}>{viewOffer.client_name}</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-500 font-cairo">
                {viewOffer.company_name && <span>🏢 الشركة: {viewOffer.company_name}</span>}
                <span>📱 الجوال: {viewOffer.whatsapp}</span>
                <span>📅 الصلاحية: {viewOffer.validity_days} أيام</span>
              </div>
            </div>

            {/* Items table */}
            <div className="mx-5 mt-4 rounded-lg overflow-hidden border" style={{ borderColor: "#DEE2E6" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#1B3A6B" }}>
                    {["#", "الجريد", "المحتوى (كجم/م³)", "نوع الأسمنت", "السعر (ج.م/م³)", "ملاحظات"].map(h => (
                      <th key={h} className="px-4 py-3 text-white font-cairo font-semibold text-center text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(viewOffer.items) ? viewOffer.items : []).map((item: OfferItem, i: number) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#F0F4FF" }}>
                      <td className="px-4 py-3 text-center">{i + 1}</td>
                      <td className="px-4 py-3 text-center font-semibold">{item.grade}</td>
                      <td className="px-4 py-3 text-center">{item.content_kg || "—"}</td>
                      <td className="px-4 py-3 text-center">{item.cement_type}</td>
                      <td className="px-4 py-3 text-center font-bold text-lg" style={{ color: "#1B3A6B" }}>{item.price} ج.م</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Terms */}
            <div className="mx-5 mt-4 rounded-lg p-5" style={{ background: "#F0FFF4", borderRight: "4px solid #28A745" }}>
              <h4 className="font-bold font-cairo mb-3" style={{ color: "#1e6432" }}>الشروط والأحكام</h4>
              <div className="space-y-2 text-sm text-gray-600 font-cairo">
                {(viewOffer.terms || "").split(/(?=\d+\.\s)/).map(t => t.trim()).filter(Boolean).map((term, i) => (
                  <p key={i} className="leading-relaxed">{term}</p>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4">
              <div style={{ background: "#F5A623", height: 5 }} />
              <p className="text-center text-xs text-gray-400 py-3 font-cairo">شركة ركيزة لتوريد الخرسانة الجاهزة | جمهورية مصر العربية</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-5 pb-5">
              <Button className="flex-1 font-cairo gap-2 text-white" style={{ background: "#1B3A6B" }} onClick={() => handlePrint(viewOffer)}>
                <Printer className="h-4 w-4" /> تحميل PDF
              </Button>
              <Button className="flex-1 font-cairo gap-2 text-white" style={{ background: "#28A745" }} onClick={() => handleWhatsApp(viewOffer)}>
                <Send className="h-4 w-4" /> إرسال واتساب
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Offers List */}
      <Card>
        <CardHeader>
          <CardTitle className="font-cairo text-lg">العروض السابقة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground font-cairo text-center py-8">جاري التحميل...</p>
          ) : offers.length === 0 ? (
            <p className="text-muted-foreground font-cairo text-center py-8">لا توجد عروض بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-cairo text-right">العميل</TableHead>
                  <TableHead className="font-cairo text-right">الشركة</TableHead>
                  <TableHead className="font-cairo text-right">التاريخ</TableHead>
                  <TableHead className="font-cairo text-right">الحالة</TableHead>
                  <TableHead className="font-cairo text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="font-cairo font-medium">{offer.client_name}</TableCell>
                    <TableCell className="font-cairo">{offer.company_name || "—"}</TableCell>
                    <TableCell>{new Date(offer.created_at).toLocaleDateString("ar-EG")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor[offer.status] || ""}>
                        {statusLabel[offer.status] || offer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewOffer(offer)} title="عرض">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handlePrint(offer)} title="PDF">
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleWhatsApp(offer)} title="واتساب" className="text-green-600">
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
