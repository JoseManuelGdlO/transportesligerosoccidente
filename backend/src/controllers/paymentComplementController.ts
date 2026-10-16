import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as paymentComplementService from "../services/paymentComplement/paymentComplementService";
import { ComplementError, type ComplementDto } from "../services/paymentComplement/paymentComplementService";

const tid = (req: Request) => req.user!.tenantId;

const createSchema = z.object({
  client_id: z.string().uuid(),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forma_pago_p: z.string().regex(/^\d{2}$/),
  moneda_p: z.string().length(3),
  tipo_cambio_p: z.number().positive(),
  num_operacion: z.string().max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  email_mensaje: z.string().trim().max(1000).optional(),
  documentos: z
    .array(
      z.object({
        document_id: z.string().uuid(),
        monto: z.number().positive(),
      }),
    )
    .min(1),
});

const fromPaymentsSchema = createSchema.omit({ documentos: true }).extend({
  payment_ids: z.array(z.string().uuid()).min(1),
});

function sendDto(res: Response, dto: ComplementDto) {
  if (dto.estatus === "timbrado") {
    res.status(201).json(dto);
    return;
  }
  res.status(422).json(dto);
}

async function guard(res: Response, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    if (err instanceof ComplementError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export const postPaymentComplement = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  await guard(res, async () => {
    const dto = await paymentComplementService.createPaymentComplement(tid(req), req.user?.id, {
      clientId: data.client_id,
      fechaPago: data.fecha_pago,
      formaPagoP: data.forma_pago_p,
      monedaP: data.moneda_p,
      tipoCambioP: data.tipo_cambio_p,
      numOperacion: data.num_operacion,
      email: data.email,
      emailMensaje: data.email_mensaje,
      documentos: data.documentos.map((doc) => ({ documentId: doc.document_id, monto: doc.monto })),
    });
    sendDto(res, dto);
  });
});

export const postPaymentComplementFromPayments = asyncHandler(async (req: Request, res: Response) => {
  const parsed = fromPaymentsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  await guard(res, async () => {
    const dto = await paymentComplementService.createFromExistingPayments(tid(req), req.user?.id, {
      clientId: data.client_id,
      fechaPago: data.fecha_pago,
      formaPagoP: data.forma_pago_p,
      monedaP: data.moneda_p,
      tipoCambioP: data.tipo_cambio_p,
      numOperacion: data.num_operacion,
      email: data.email,
      emailMensaje: data.email_mensaje,
      paymentIds: data.payment_ids,
    });
    sendDto(res, dto);
  });
});

export const postRetryPaymentComplement = asyncHandler(async (req: Request, res: Response) => {
  await guard(res, async () => {
    const dto = await paymentComplementService.retryPaymentComplement(tid(req), req.params.id);
    sendDto(res, dto);
  });
});

export const postDiscardPaymentComplement = asyncHandler(async (req: Request, res: Response) => {
  await guard(res, async () => {
    await paymentComplementService.discardPaymentComplement(tid(req), req.params.id);
    res.status(204).send();
  });
});

export const getPaymentComplementXml = asyncHandler(async (req: Request, res: Response) => {
  await guard(res, async () => {
    const { xml, filename } = await paymentComplementService.getPaymentComplementXml(tid(req), req.params.id);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(xml);
  });
});

export const getPaymentComplementPdf = asyncHandler(async (req: Request, res: Response) => {
  await guard(res, async () => {
    const { pdf, filename } = await paymentComplementService.getPaymentComplementPdf(tid(req), req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(pdf);
  });
});
