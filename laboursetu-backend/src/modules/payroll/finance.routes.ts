import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role.js";
import * as c from "./finance.controller.js";
import * as s from "./finance.schema.js";
import * as service from "./finance.service.js";
import { reportKinds } from "./finance.reports.js";

export const financeRoutes = Router();
financeRoutes.use((req, res, next) => {
  const requestId = randomUUID();
  const started = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    console.info(
      JSON.stringify({
        event: "finance_request",
        requestId,
        method: req.method,
        route: req.route?.path ?? req.path,
        status: res.statusCode,
        organizationId: req.user?.organizationId,
        actorId: req.user?.id,
        durationMs: Date.now() - started,
      }),
    );
  });
  next();
});
financeRoutes.use(authMiddleware, requireRole("OWNER", "ACCOUNTANT"));
financeRoutes.get("/settings", c.getSettings);
financeRoutes.put("/settings", c.saveSettings);
financeRoutes.get("/rates", c.list("rates"));
financeRoutes.post("/rates", c.createRate);
financeRoutes.post("/adjustments", c.createAdjustment);
financeRoutes.post("/work-supplements", c.createSupplement);
financeRoutes.get("/advances", c.list("advances"));
financeRoutes.post("/advances", c.createAdvance);
financeRoutes.post(
  "/advances/:id/confirm",
  c.mutate("advanceConfirm", s.confirmationSchema, (tx, a, _input, id) =>
    service.advanceAction(tx, a, id, "confirm"),
  ),
);
financeRoutes.post(
  "/advances/:id/reverse",
  c.mutate("advanceReverse", s.reversalSchema, (tx, a, input, id) =>
    service.advanceAction(tx, a, id, "reverse", input.reason),
  ),
);
financeRoutes.post("/payroll/preview", c.preview);
financeRoutes.post("/payroll", c.createPayroll);
financeRoutes.get("/payroll", c.list("payroll"));
financeRoutes.get("/payroll/:id", c.detail);
financeRoutes.post("/payroll/:id/recalculate", c.recalculate);
for (const action of ["submit", "approve", "finalize", "cancel"])
  financeRoutes.post(
    `/payroll/:id/${action}`,
    c.mutate(
      `payroll-${action}`,
      action === "cancel" ? s.reversalSchema : z.object({}).strict(),
      (tx, a, input, id) => service.transition(tx, a, id, action, input.reason),
    ),
  );
financeRoutes.post(
  "/payroll/:id/return-to-draft",
  c.mutate("returnToDraft", s.reversalSchema, (tx, a, input, id) =>
    service.returnToDraft(tx, a, id, input.reason),
  ),
);
financeRoutes.get("/payments", c.list("payments"));
financeRoutes.post("/payments", c.createPayment);
financeRoutes.get("/payments/:id/receipt", c.receipt);
financeRoutes.post(
  "/payments/:id/confirm",
  c.mutate("paymentConfirm", s.confirmationSchema, (tx, a, _input, id) =>
    service.paymentAction(tx, a, id, "confirm"),
  ),
);
for (const action of ["reverse", "cancel"] as const)
  financeRoutes.post(
    `/payments/:id/${action}`,
    c.mutate(`payment-${action}`, s.reversalSchema, (tx, a, input, id) =>
      service.paymentAction(tx, a, id, action, input.reason),
    ),
  );
financeRoutes.get("/ledger", c.list("ledger"));
for (const kind of reportKinds)
  financeRoutes.get(`/reports/${kind}`, c.report(kind));
