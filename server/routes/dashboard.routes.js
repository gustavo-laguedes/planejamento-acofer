import { Router } from 'express';
import { requireDb } from '../db.js';
import {
  buildExecutiveDashboard,
  normalizeDashboardPeriod
} from '../../services/dashboardExecutive.service.js';
import {
  buildDashboardReport,
  dashboardReportFilename,
  normalizeDashboardReportRequest
} from '../../services/dashboardReports.service.js';
import {
  createDashboardReportPdf,
  createDashboardReportXlsx
} from '../../services/dashboardReportsExport.service.js';

const router = Router();

router.get(
  '/executive',
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        requireDb();

      const period =
        normalizeDashboardPeriod(
          req.query.startDate,
          req.query.endDate
        );

      const payload =
        await buildExecutiveDashboard(
          db,
          period
        );

      res.json(
        payload
      );

    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/reports/:reportId',
  async (req, res, next) => {
    try {
      const request = normalizeDashboardReportRequest({
        reportId: req.params.reportId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        format: req.query.format
      });
      const report = await buildDashboardReport(requireDb(), request);
      const buffer = request.format === 'pdf'
        ? await createDashboardReportPdf(report)
        : await createDashboardReportXlsx(report);
      const filename = dashboardReportFilename(report, request.format);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', request.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
