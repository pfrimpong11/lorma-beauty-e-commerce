import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/permissions';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';

const REPORT_KEYS = ['sales', 'inventory', 'product-sales', 'payments', 'shifts'] as const;
type ReportKey = (typeof REPORT_KEYS)[number];

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ExportService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  @ApiOperation({ summary: 'The available reports' })
  available() {
    return {
      data: [
        { key: 'sales', title: 'Sales Report', description: 'Every line sold in the period' },
        { key: 'inventory', title: 'Inventory Report', description: 'Stock levels and valuation' },
        { key: 'product-sales', title: 'Product Sales Report', description: 'Performance by product' },
        { key: 'payments', title: 'Payment Report', description: 'Takings by payment method' },
        { key: 'shifts', title: 'Shift Report', description: 'Cash reconciliation by shift' },
      ],
    };
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  @ApiOperation({ summary: 'Run a report' })
  run(
    @Param('key') key: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertKey(key);
    return this.reports.byKey(key, { from, to });
  }

  @Get(':key/export')
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiOperation({ summary: 'Download a report as Excel or PDF' })
  async export(
    @Param('key') key: string,
    @Res() res: Response,
    @Query('format') format: 'xlsx' | 'pdf' = 'xlsx',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.assertKey(key);

    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('Format must be xlsx or pdf.');
    }

    const report = await this.reports.byKey(key, { from, to });
    const currency = this.config.get<string>('currency') ?? 'GHS';

    const buffer =
      format === 'xlsx'
        ? await this.exports.toExcel(report, currency)
        : await this.exports.toPdf(report, currency);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `lorma-beauty-${key}-${stamp}.${format}`;

    res.set({
      'Content-Type':
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });

    res.send(buffer);
  }

  private assertKey(key: string): asserts key is ReportKey {
    if (!REPORT_KEYS.includes(key as ReportKey)) {
      throw new BadRequestException(`Unknown report. Available: ${REPORT_KEYS.join(', ')}.`);
    }
  }
}
