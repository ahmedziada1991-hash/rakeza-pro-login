import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type for autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export function exportToExcel(data: Record<string, any>[], headers: { key: string; label: string }[], filename: string) {
  const rows = data.map((row) =>
    headers.reduce((acc, h) => {
      acc[h.label] = row[h.key] ?? "";
      return acc;
    }, {} as Record<string, any>)
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(
  data: Record<string, any>[],
  headers: { key: string; label: string }[],
  filename: string,
  title: string
) {
  const doc = new jsPDF({ orientation: "landscape" });

  // Title
  doc.setFontSize(16);
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: "center" });
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("ar-EG"), doc.internal.pageSize.getWidth() / 2, 22, { align: "center" });

  // Table
  const head = [headers.map((h) => h.label).reverse()];
  const body = data.map((row) => headers.map((h) => String(row[h.key] ?? "—")).reverse());

  doc.autoTable({
    head,
    body,
    startY: 28,
    styles: { fontSize: 9, halign: "center", cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { top: 28 },
  });

  doc.save(`${filename}.pdf`);
}
