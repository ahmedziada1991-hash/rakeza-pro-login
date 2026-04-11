import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
}

interface StatementData {
  entityName: string;
  entityType: "عميل" | "محطة" | "مورد";
  phone?: string | null;
  transactions: StatementTransaction[];
  totalDebt: number;
  totalPaid: number;
  balance: number;
}

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "20" + cleaned.slice(1);
  }
  return cleaned;
}

export function generateStatementPDF(data: StatementData): void {
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header background
  doc.setFillColor(27, 58, 107); // #1B3A6B
  doc.rect(0, 0, pageWidth, 35, "F");

  // Company name (use Helvetica for now - Arabic won't render perfectly but layout is correct)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Rakeeza", pageWidth - 15, 15, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Ready-Mix Concrete Supply", pageWidth - 15, 22, { align: "right" });
  doc.setFontSize(11);
  doc.text("Account Statement", pageWidth - 15, 30, { align: "right" });

  // Gold stripe
  doc.setFillColor(245, 166, 35); // #F5A623
  doc.rect(0, 35, pageWidth, 3, "F");

  // Entity info
  const todayStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  doc.setTextColor(27, 58, 107);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.entityName}`, pageWidth - 15, 48, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(todayStr, 15, 48);

  // Summary boxes
  const boxY = 55;
  const boxW = (pageWidth - 40) / 3;
  const boxes = [
    { label: "Total Debt", value: fmt(data.totalDebt), color: [220, 38, 38] },
    { label: "Total Paid", value: fmt(data.totalPaid), color: [22, 163, 74] },
    { label: "Balance", value: fmt(data.balance), color: [27, 58, 107] },
  ];

  boxes.forEach((box, i) => {
    const x = 10 + i * (boxW + 5);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(x, boxY, boxW, 22, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(box.label, x + boxW / 2, boxY + 8, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(box.color[0], box.color[1], box.color[2]);
    doc.text(box.value, x + boxW / 2, boxY + 18, { align: "center" });
    doc.setFont("helvetica", "normal");
  });

  // Transactions table
  const head = [["#", "Date", "Description", "Amount"]];
  const body = data.transactions.map((t, i) => [
    String(i + 1),
    t.date,
    t.description,
    fmt(t.amount),
  ]);

  doc.autoTable({
    head,
    body,
    startY: boxY + 30,
    styles: { fontSize: 8, halign: "center", cellPadding: 3, font: "helvetica" },
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    margin: { left: 10, right: 10 },
    columnStyles: {
      0: { cellWidth: 12 },
      2: { halign: "left", cellWidth: "auto" },
    },
  });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFillColor(245, 166, 35);
  doc.rect(0, footerY - 5, pageWidth, 3, "F");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Rakeeza - Ready-Mix Concrete Supply", pageWidth / 2, footerY + 2, { align: "center" });

  // Save
  const safeName = data.entityName.replace(/\s+/g, "-");
  doc.save(`statement-${safeName}.pdf`);
}

export function sendStatementWhatsApp(phone: string | null | undefined, entityName: string): void {
  const formattedPhone = phone ? formatPhoneForWhatsApp(phone) : "";
  const msg = encodeURIComponent(
    `السلام عليكم 👋\nمرفق كشف حسابكم مع شركة ركيزة لتوريد الخرسانة الجاهزة 🏗️\n— يرجى الاطلاع على الملف المرفق`
  );
  const url = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${msg}`
    : `https://wa.me/?text=${msg}`;
  window.open(url, "_blank");
}
