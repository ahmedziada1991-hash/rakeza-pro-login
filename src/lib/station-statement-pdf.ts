import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

function fmt(n: number) {
  return `${n.toLocaleString("ar-EG")} ج.م`;
}

interface PourRow {
  date: string;
  clientName: string;
  quantity: string;
  purchasePrice: string;
  total: string;
}

interface CementSaleRow {
  date: string;
  quantity: string;
  pricePerTon: string;
  total: string;
  paymentMethod: string;
  cashPaid: string;
  deducted: string;
  remaining: string;
  notes: string;
}

interface PaymentRow {
  date: string;
  amount: string;
  method: string;
  notes: string;
}

export interface StationStatementPDFData {
  stationName: string;
  totals: {
    totalCost: number;
    cementBalance: number;
    totalPaid: number;
    finalBalance: number;
  };
  pours: PourRow[];
  cementSales: CementSaleRow[];
  payments: PaymentRow[];
}

export function generateStationStatementPDF(data: StationStatementPDFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // ─── Header ───
  doc.setFillColor(27, 58, 107);
  doc.rect(0, 0, pageWidth, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Rakeeza", pageWidth - margin, 13, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Ready-Mix Concrete Supply | Egypt", pageWidth - margin, 20, { align: "right" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Station Account Statement", pageWidth - margin, 28, { align: "right" });

  // Gold stripe
  doc.setFillColor(245, 166, 35);
  doc.rect(0, 32, pageWidth, 3, "F");

  // Station name & date
  const todayStr = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  doc.setTextColor(27, 58, 107);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Station: ${data.stationName}`, pageWidth - margin, 44, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Date: ${todayStr}`, margin, 44);

  // ─── 4 Summary Boxes ───
  const boxY = 50;
  const boxW = (contentWidth - 9) / 4;
  const boxH = 20;
  const summaryBoxes = [
    { label: "Concrete (Rakeeza owes)", value: fmt(data.totals.totalCost), color: [220, 38, 38] as [number, number, number] },
    { label: "Cement (Station owes)", value: fmt(data.totals.cementBalance), color: [245, 158, 11] as [number, number, number] },
    { label: "Paid (Cash + Deduction)", value: fmt(data.totals.totalPaid), color: [22, 163, 74] as [number, number, number] },
    { label: "Final Balance", value: fmt(data.totals.finalBalance), color: [27, 58, 107] as [number, number, number] },
  ];

  summaryBoxes.forEach((box, i) => {
    const x = margin + i * (boxW + 3);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(x, boxY, boxW, boxH, 2, 2, "F");
    doc.setDrawColor(230, 230, 230);
    doc.roundedRect(x, boxY, boxW, boxH, 2, 2, "S");

    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.text(box.label, x + boxW / 2, boxY + 7, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(box.color[0], box.color[1], box.color[2]);
    doc.text(box.value, x + boxW / 2, boxY + 15, { align: "center" });
  });

  let currentY = boxY + boxH + 8;

  const tableHeadStyle = { fillColor: [27, 58, 107] as [number, number, number], textColor: 255 as any, fontStyle: "bold" as const, fontSize: 7 };
  const tableBodyStyle = { fontSize: 7, cellPadding: 2.5 };
  const altRowStyle = { fillColor: [240, 244, 255] as [number, number, number] };

  // Helper: add section title
  function addSectionTitle(title: string, y: number): number {
    if (y + 20 > pageHeight - 20) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 58, 107);
    doc.text(title, pageWidth - margin, y, { align: "right" });
    return y + 6;
  }

  // ─── Pours Table ───
  if (data.pours.length > 0) {
    currentY = addSectionTitle("Concrete Pours", currentY);
    doc.autoTable({
      head: [["#", "Date", "Client", "Qty (m3)", "Price/m3", "Total"]],
      body: data.pours.map((p, i) => [String(i + 1), p.date, p.clientName, p.quantity, p.purchasePrice, p.total]),
      startY: currentY,
      styles: { ...tableBodyStyle, halign: "center", font: "helvetica" },
      headStyles: tableHeadStyle,
      alternateRowStyles: altRowStyle,
      margin: { left: margin, right: margin },
      columnStyles: { 2: { halign: "left" } },
    });
    currentY = doc.lastAutoTable.finalY + 8;
  }

  // ─── Cement Sales Table ───
  if (data.cementSales.length > 0) {
    currentY = addSectionTitle("Cement Sales", currentY);
    doc.autoTable({
      head: [["#", "Date", "Qty (ton)", "Price/ton", "Total", "Method", "Cash", "Deducted", "Remaining"]],
      body: data.cementSales.map((s, i) => [String(i + 1), s.date, s.quantity, s.pricePerTon, s.total, s.paymentMethod, s.cashPaid, s.deducted, s.remaining]),
      startY: currentY,
      styles: { ...tableBodyStyle, halign: "center", font: "helvetica" },
      headStyles: tableHeadStyle,
      alternateRowStyles: altRowStyle,
      margin: { left: margin, right: margin },
      columnStyles: { 5: { fontSize: 6 } },
    });
    currentY = doc.lastAutoTable.finalY + 8;
  }

  // ─── Payments Table ───
  if (data.payments.length > 0) {
    currentY = addSectionTitle("Payments", currentY);
    doc.autoTable({
      head: [["#", "Date", "Amount", "Method", "Notes"]],
      body: data.payments.map((p, i) => [String(i + 1), p.date, p.amount, p.method, p.notes]),
      startY: currentY,
      styles: { ...tableBodyStyle, halign: "center", font: "helvetica" },
      headStyles: tableHeadStyle,
      alternateRowStyles: altRowStyle,
      margin: { left: margin, right: margin },
      columnStyles: { 4: { halign: "left", cellWidth: "auto" } },
    });
    currentY = doc.lastAutoTable.finalY + 8;
  }

  // ─── Final Balance Box ───
  if (currentY + 30 > pageHeight - 20) {
    doc.addPage();
    currentY = 15;
  }

  const balBoxW = 80;
  const balBoxX = (pageWidth - balBoxW) / 2;
  const balColor = data.totals.finalBalance > 0 ? [220, 38, 38] : [22, 163, 74];
  const balLabel = data.totals.finalBalance > 0 ? "Station owes Rakeeza" : data.totals.finalBalance < 0 ? "Rakeeza owes Station" : "Settled";

  doc.setFillColor(balColor[0], balColor[1], balColor[2]);
  doc.roundedRect(balBoxX, currentY, balBoxW, 22, 3, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(balLabel, pageWidth / 2, currentY + 7, { align: "center" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(fmt(Math.abs(data.totals.finalBalance)), pageWidth / 2, currentY + 17, { align: "center" });

  // ─── Footer ───
  const footerY = pageHeight - 10;
  doc.setFillColor(245, 166, 35);
  doc.rect(0, footerY - 5, pageWidth, 2, "F");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text("Rakeeza - Ready-Mix Concrete Supply | Egypt", pageWidth / 2, footerY, { align: "center" });

  // Save
  const safeName = data.stationName.replace(/\s+/g, "-");
  doc.save(`station-statement-${safeName}.pdf`);
}
