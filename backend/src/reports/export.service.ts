import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportResult } from './reports.service';

const BRAND = {
  name: 'LORMA BEAUTY',
  tagline: 'Skincare & Beauty',
  /** Deep rose — the Lorma Beauty accent. */
  accent: 'FF9B2C5E',
  accentHex: '#9B2C5E',
  ink: 'FF2B2B2B',
};

@Injectable()
export class ExportService {
  /**
   * Excel export with Lorma Beauty branding (§44).
   * Money cells carry a real number format so totals can be recalculated
   * in the spreadsheet rather than being frozen strings.
   */
  async toExcel(report: ReportResult, currency: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lorma Beauty POS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(report.title.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 5 }],
    });

    const columnCount = report.columns.length;

    sheet.mergeCells(1, 1, 1, columnCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = BRAND.name;
    titleCell.font = { size: 16, bold: true, color: { argb: BRAND.accent } };

    sheet.mergeCells(2, 1, 2, columnCount);
    sheet.getCell(2, 1).value = `${report.title}${
      report.range.from || report.range.to
        ? `  ·  ${report.range.from ?? 'start'} to ${report.range.to ?? 'today'}`
        : ''
    }`;
    sheet.getCell(2, 1).font = { size: 11, bold: true };

    sheet.mergeCells(3, 1, 3, columnCount);
    sheet.getCell(3, 1).value = `Generated ${new Date(report.generatedAt).toLocaleString('en-GB')}`;
    sheet.getCell(3, 1).font = { size: 9, italic: true, color: { argb: 'FF767676' } };

    const headerRow = sheet.getRow(5);
    report.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.accent } };
      cell.alignment = { horizontal: col.money || col.numeric ? 'right' : 'left' };
    });
    headerRow.commit();

    report.rows.forEach((row, r) => {
      const sheetRow = sheet.getRow(6 + r);
      report.columns.forEach((col, c) => {
        const cell = sheetRow.getCell(c + 1);
        const raw = row[col.key];

        if (col.money && raw !== null && raw !== '—') {
          cell.value = Number(raw);
          cell.numFmt = `"${currency}" #,##0.00`;
          cell.alignment = { horizontal: 'right' };
        } else if (col.numeric && raw !== null) {
          cell.value = Number(raw);
          cell.alignment = { horizontal: 'right' };
        } else {
          cell.value = raw;
        }
      });
      sheetRow.commit();
    });

    if (report.totals) {
      const totalRow = sheet.getRow(6 + report.rows.length + 1);
      totalRow.getCell(1).value = 'TOTAL';
      totalRow.getCell(1).font = { bold: true };

      report.columns.forEach((col, c) => {
        if (report.totals?.[col.key] !== undefined) {
          const cell = totalRow.getCell(c + 1);
          cell.value = Number(report.totals[col.key]);
          cell.numFmt = col.money ? `"${currency}" #,##0.00` : '#,##0';
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'right' };
        }
      });
      totalRow.commit();
    }

    report.columns.forEach((col, i) => {
      const longest = report.rows.reduce(
        (max, row) => Math.max(max, String(row[col.key] ?? '').length),
        col.label.length,
      );
      sheet.getColumn(i + 1).width = Math.min(Math.max(longest + 3, 10), 42);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** PDF export with the same branding (§44). */
  async toPdf(report: ReportResult, currency: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.fillColor(BRAND.accentHex).fontSize(18).font('Helvetica-Bold').text(BRAND.name);
      doc.fillColor('#767676').fontSize(9).font('Helvetica').text(BRAND.tagline);
      doc.moveDown(0.6);

      doc.fillColor('#2B2B2B').fontSize(13).font('Helvetica-Bold').text(report.title);
      const rangeText =
        report.range.from || report.range.to
          ? `${report.range.from ?? 'start'} to ${report.range.to ?? 'today'}`
          : 'All time';
      doc.fillColor('#767676').fontSize(9).font('Helvetica').text(rangeText);
      doc.text(`Generated ${new Date(report.generatedAt).toLocaleString('en-GB')}`);
      doc.moveDown(0.8);

      const widths = this.columnWidths(report, pageWidth);
      let y = doc.y;

      const drawHeader = () => {
        doc.rect(doc.page.margins.left, y, pageWidth, 18).fill(BRAND.accentHex);
        let x = doc.page.margins.left;
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        report.columns.forEach((col, i) => {
          doc.text(col.label, x + 4, y + 5, {
            width: widths[i] - 8,
            align: col.money || col.numeric ? 'right' : 'left',
            lineBreak: false,
          });
          x += widths[i];
        });
        y += 18;
      };

      drawHeader();
      doc.font('Helvetica').fontSize(8);

      for (const [index, row] of report.rows.entries()) {
        // Reserve room for the footer before starting a new row.
        if (y > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
          y = doc.page.margins.top;
          drawHeader();
          doc.font('Helvetica').fontSize(8);
        }

        if (index % 2 === 1) {
          doc.rect(doc.page.margins.left, y, pageWidth, 14).fill('#FAF6F8');
        }

        let x = doc.page.margins.left;
        doc.fillColor('#2B2B2B');
        report.columns.forEach((col, i) => {
          const raw = row[col.key];
          const value =
            col.money && raw !== null && raw !== '—' ? `${currency} ${raw}` : String(raw ?? '');
          doc.text(value, x + 4, y + 3.5, {
            width: widths[i] - 8,
            align: col.money || col.numeric ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true,
          });
          x += widths[i];
        });
        y += 14;
      }

      if (report.totals) {
        y += 4;
        doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + pageWidth, y)
          .strokeColor(BRAND.accentHex).lineWidth(1).stroke();
        y += 6;
        doc.font('Helvetica-Bold').fillColor('#2B2B2B').fontSize(9);
        const summary = Object.entries(report.totals)
          .map(([k, v]) => `${this.humanise(k)}: ${/amount|value|revenue|variance/i.test(k) ? `${currency} ${v}` : v}`)
          .join('     ');
        doc.text(summary, doc.page.margins.left, y, { width: pageWidth, align: 'right' });
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('Helvetica').fontSize(7).fillColor('#9A9A9A').text(
          `Lorma Beauty POS  ·  page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 8,
          { width: pageWidth, align: 'center', lineBreak: false },
        );
      }

      doc.end();
    });
  }

  /** Share the page proportionally, weighted by expected content length. */
  private columnWidths(report: ReportResult, pageWidth: number): number[] {
    const weights = report.columns.map((col) => {
      const longest = report.rows.reduce(
        (max, row) => Math.max(max, String(row[col.key] ?? '').length),
        col.label.length,
      );
      return Math.min(Math.max(longest, 6), 30);
    });
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    return weights.map((w) => (w / sum) * pageWidth);
  }

  private humanise(key: string): string {
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  }
}
