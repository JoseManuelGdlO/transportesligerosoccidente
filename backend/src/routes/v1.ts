import { Router } from "express";
import { authenticateJwt } from "../middlewares/authenticate";
import { requirePermission } from "../middlewares/requirePermission";
import { postLogin, postRefresh, getMe } from "../controllers/authController";
import * as tenantC from "../controllers/tenantController";
import * as truckC from "../controllers/truckController";
import * as driverC from "../controllers/driverController";
import * as clientC from "../controllers/clientController";
import * as tripC from "../controllers/tripController";
import * as cartaPorteC from "../controllers/cartaPorteController";
import * as fiscalC from "../controllers/fiscalController";
import { uploadCsd } from "../middlewares/uploadCsd";
import * as settlementC from "../controllers/settlementController";
import * as driverFinanceC from "../controllers/driverFinanceController";
import * as maintenanceC from "../controllers/maintenanceController";
import { uploadFuelReceipt } from "../middlewares/uploadFuelReceipt";
import * as userC from "../controllers/userController";
import * as roleC from "../controllers/roleController";
import * as reportsC from "../controllers/reportsController";
import * as fuelTicketC from "../controllers/fuelTicketController";
import * as fuelConfigC from "../controllers/fuelConfigController";
import * as reportsFuelC from "../controllers/reportsFuelController";
import { uploadFuelImport } from "../middlewares/uploadFuelImport";
import * as docTypeC from "../controllers/documentTypeController";
import * as docC from "../controllers/documentController";
import * as notifC from "../controllers/notificationController";
import * as pushC from "../controllers/pushController";
import { uploadDriverDocument, uploadTruckDocument } from "../middlewares/uploadDocument";
import { loadDocumentForPatch, uploadDocumentPatch } from "../middlewares/documentPatchUpload";

const r = Router();

r.post("/auth/login", postLogin);
r.post("/auth/refresh", postRefresh);

r.get("/auth/me", authenticateJwt, getMe);

r.get("/tenant", authenticateJwt, tenantC.getTenant);
r.patch("/tenant", authenticateJwt, requirePermission("empresa.gestionar"), tenantC.patchTenant);
r.patch("/tenant/theme", authenticateJwt, requirePermission("marca.gestionar"), tenantC.patchTenantTheme);

r.get("/tenant/fiscal", authenticateJwt, requirePermission("fiscal.configurar", "cartaporte.ver"), fiscalC.getFiscalConfig);
r.patch("/tenant/fiscal", authenticateJwt, requirePermission("fiscal.configurar"), fiscalC.patchFiscalConfig);
r.post(
  "/tenant/fiscal/csd",
  authenticateJwt,
  requirePermission("fiscal.configurar"),
  uploadCsd,
  fiscalC.uploadCsd,
);

r.get("/trucks", authenticateJwt, requirePermission("catalogos.ver"), truckC.listTrucks);
r.get("/trucks/:id", authenticateJwt, requirePermission("catalogos.ver"), truckC.getTruck);
r.post("/trucks", authenticateJwt, requirePermission("catalogos.editar"), truckC.createTruck);
r.patch("/trucks/:id", authenticateJwt, requirePermission("catalogos.editar"), truckC.updateTruck);
r.delete("/trucks/:id", authenticateJwt, requirePermission("catalogos.editar"), truckC.deleteTruck);

r.get("/drivers", authenticateJwt, requirePermission("catalogos.ver"), driverC.listDrivers);
r.get("/drivers/:id", authenticateJwt, requirePermission("catalogos.ver"), driverC.getDriver);
r.post("/drivers", authenticateJwt, requirePermission("catalogos.editar"), driverC.createDriver);
r.patch("/drivers/:id", authenticateJwt, requirePermission("catalogos.editar"), driverC.updateDriver);
r.delete("/drivers/:id", authenticateJwt, requirePermission("catalogos.editar"), driverC.deleteDriver);

r.get("/clients", authenticateJwt, requirePermission("catalogos.ver"), clientC.listClients);
r.get("/clients/:id", authenticateJwt, requirePermission("catalogos.ver"), clientC.getClient);
r.post("/clients", authenticateJwt, requirePermission("catalogos.editar"), clientC.createClient);
r.patch("/clients/:id", authenticateJwt, requirePermission("catalogos.editar"), clientC.updateClient);
r.delete("/clients/:id", authenticateJwt, requirePermission("catalogos.editar"), clientC.deleteClient);

r.get("/trips", authenticateJwt, requirePermission("viajes.ver"), tripC.listTrips);
r.get("/trips/:id", authenticateJwt, requirePermission("viajes.ver"), tripC.getTrip);
r.post("/trips", authenticateJwt, requirePermission("viajes.crear"), tripC.createTrip);
r.patch("/trips/:id", authenticateJwt, requirePermission("viajes.crear"), tripC.patchTrip);
r.post("/trips/:id/close", authenticateJwt, requirePermission("viajes.cerrar"), tripC.postCloseTrip);
r.delete("/trips/:id", authenticateJwt, requirePermission("viajes.eliminar"), tripC.deleteTrip);

r.post("/trips/:id/fuel", authenticateJwt, requirePermission("viajes.crear"), tripC.postFuel);
r.post(
  "/trips/:id/fuel-receipt",
  authenticateJwt,
  requirePermission("viajes.crear"),
  uploadFuelReceipt.single("file"),
  tripC.postFuelReceipt,
);
r.delete("/trips/:id/fuel/:fuelId", authenticateJwt, requirePermission("viajes.crear"), tripC.deleteFuel);
r.post("/trips/:id/expenses", authenticateJwt, requirePermission("viajes.crear"), tripC.postExpense);
r.delete("/trips/:id/expenses/:expenseId", authenticateJwt, requirePermission("viajes.crear"), tripC.deleteExpense);

r.get("/trips/:id/carta-porte", authenticateJwt, requirePermission("cartaporte.ver"), cartaPorteC.getCartaPorte);
r.post("/trips/:id/carta-porte/preview", authenticateJwt, requirePermission("cartaporte.timbrar"), cartaPorteC.postPreview);
r.post("/trips/:id/carta-porte/timbrar", authenticateJwt, requirePermission("cartaporte.timbrar"), cartaPorteC.postTimbrar);
r.post("/trips/:id/carta-porte/cancelar", authenticateJwt, requirePermission("cartaporte.cancelar"), cartaPorteC.postCancelar);
r.put("/trips/:id/carta-porte/ubicacion-origen", authenticateJwt, requirePermission("viajes.crear"), cartaPorteC.putUbicacionOrigen);
r.put("/trips/:id/carta-porte/ubicacion-destino", authenticateJwt, requirePermission("viajes.crear"), cartaPorteC.putUbicacionDestino);
r.get("/trips/:id/mercancias", authenticateJwt, requirePermission("cartaporte.ver"), cartaPorteC.listMercancias);
r.post("/trips/:id/mercancias", authenticateJwt, requirePermission("viajes.crear"), cartaPorteC.postMercancia);
r.delete("/trips/:id/mercancias/:mercanciaId", authenticateJwt, requirePermission("viajes.crear"), cartaPorteC.deleteMercancia);

r.get("/settlements", authenticateJwt, requirePermission("liquidaciones.ver"), settlementC.listSettlements);
r.get("/settlements/summary", authenticateJwt, requirePermission("liquidaciones.ver"), settlementC.getSummary);
r.post("/settlements/draft", authenticateJwt, requirePermission("liquidaciones.cerrar"), settlementC.postDraft);
r.post("/settlements/close", authenticateJwt, requirePermission("liquidaciones.cerrar"), settlementC.postClose);
r.post(
  "/settlements/:id/close",
  authenticateJwt,
  requirePermission("liquidaciones.cerrar"),
  settlementC.postCloseById,
);

r.get(
  "/drivers/:id/advances",
  authenticateJwt,
  requirePermission("liquidaciones.ver"),
  driverFinanceC.listAdvances,
);
r.post(
  "/drivers/:id/advances",
  authenticateJwt,
  requirePermission("liquidaciones.cerrar"),
  driverFinanceC.createAdvance,
);
r.delete(
  "/drivers/:id/advances/:advanceId",
  authenticateJwt,
  requirePermission("liquidaciones.cerrar"),
  driverFinanceC.deleteAdvance,
);
r.get(
  "/drivers/:id/discounts",
  authenticateJwt,
  requirePermission("liquidaciones.ver"),
  driverFinanceC.listDiscounts,
);
r.post(
  "/drivers/:id/discounts",
  authenticateJwt,
  requirePermission("liquidaciones.cerrar"),
  driverFinanceC.createDiscount,
);
r.delete(
  "/drivers/:id/discounts/:discountId",
  authenticateJwt,
  requirePermission("liquidaciones.cerrar"),
  driverFinanceC.deleteDiscount,
);

r.get("/maintenance/overview", authenticateJwt, requirePermission("catalogos.ver"), maintenanceC.getOverview);
r.get("/maintenance/schedules", authenticateJwt, requirePermission("catalogos.ver"), maintenanceC.listSchedules);
r.put("/maintenance/schedules", authenticateJwt, requirePermission("catalogos.editar"), maintenanceC.upsertSchedule);
r.get("/maintenance/records", authenticateJwt, requirePermission("catalogos.ver"), maintenanceC.listRecords);
r.post("/maintenance/records", authenticateJwt, requirePermission("catalogos.editar"), maintenanceC.createRecord);

r.get("/users", authenticateJwt, requirePermission("usuarios.gestionar"), userC.listUsers);
r.post("/users", authenticateJwt, requirePermission("usuarios.gestionar"), userC.createUser);
r.patch("/users/:id", authenticateJwt, requirePermission("usuarios.gestionar"), userC.patchUser);
r.patch("/users/:id/status", authenticateJwt, requirePermission("usuarios.gestionar"), userC.patchUserStatus);

r.get("/roles", authenticateJwt, requirePermission("usuarios.gestionar"), roleC.listRoles);
r.put("/roles/:slug/permissions", authenticateJwt, requirePermission("usuarios.gestionar"), roleC.putRolePermissions);

r.get("/reports/aggregates", authenticateJwt, requirePermission("reportes.ver"), reportsC.getAggregates);
r.get(
  "/reports/fuel/proration",
  authenticateJwt,
  requirePermission("combustibles.ver", "reportes.ver"),
  reportsFuelC.getFuelProration,
);
r.get(
  "/reports/fuel/summary",
  authenticateJwt,
  requirePermission("combustibles.ver", "reportes.ver"),
  reportsFuelC.getFuelSummary,
);

r.get("/fuel-tickets", authenticateJwt, requirePermission("combustibles.ver"), fuelTicketC.listFuelTickets);
r.post("/fuel-tickets", authenticateJwt, requirePermission("combustibles.crear"), fuelTicketC.createFuelTicket);
r.patch("/fuel-tickets/:id", authenticateJwt, requirePermission("combustibles.crear"), fuelTicketC.patchFuelTicket);
r.delete(
  "/fuel-tickets/:id",
  authenticateJwt,
  requirePermission("combustibles.eliminar"),
  fuelTicketC.deleteFuelTicket,
);
r.post(
  "/fuel-tickets/import",
  authenticateJwt,
  requirePermission("combustibles.importar"),
  uploadFuelImport.single("file"),
  fuelTicketC.importFuelTickets,
);
r.post(
  "/fuel-tickets/sync",
  authenticateJwt,
  requirePermission("combustibles.importar"),
  fuelConfigC.postFuelSyncNow,
);
r.get(
  "/tenant/fuel",
  authenticateJwt,
  requirePermission("combustibles.importar"),
  fuelConfigC.getFuelConfig,
);
r.patch(
  "/tenant/fuel",
  authenticateJwt,
  requirePermission("combustibles.importar"),
  fuelConfigC.patchFuelConfig,
);

r.get(
  "/document-types",
  authenticateJwt,
  requirePermission("catalogos.ver", "tipos_documento.gestionar"),
  docTypeC.listDocumentTypes,
);
r.post("/document-types", authenticateJwt, requirePermission("tipos_documento.gestionar"), docTypeC.createDocumentType);
r.patch("/document-types/:id", authenticateJwt, requirePermission("tipos_documento.gestionar"), docTypeC.updateDocumentType);
r.delete("/document-types/:id", authenticateJwt, requirePermission("tipos_documento.gestionar"), docTypeC.deleteDocumentType);

r.get("/drivers/:id/documents", authenticateJwt, requirePermission("documentos.ver"), docC.listDriverDocuments);
r.post(
  "/drivers/:id/documents",
  authenticateJwt,
  requirePermission("documentos.editar"),
  uploadDriverDocument.single("file"),
  docC.createDriverDocument,
);
r.get("/trucks/:id/documents", authenticateJwt, requirePermission("documentos.ver"), docC.listTruckDocuments);
r.post(
  "/trucks/:id/documents",
  authenticateJwt,
  requirePermission("documentos.editar"),
  uploadTruckDocument.single("file"),
  docC.createTruckDocument,
);

r.get("/documents/dashboard", authenticateJwt, requirePermission("documentos.ver"), docC.getDashboardDocumentSummary);
r.get("/documents/:id/file", authenticateJwt, requirePermission("documentos.ver"), docC.streamDocumentFile);
r.patch(
  "/documents/:id",
  authenticateJwt,
  requirePermission("documentos.editar"),
  loadDocumentForPatch,
  uploadDocumentPatch.single("file"),
  docC.patchDocument,
);
r.delete("/documents/:id", authenticateJwt, requirePermission("documentos.editar"), docC.deleteDocument);

r.get("/notifications", authenticateJwt, requirePermission("notificaciones.ver"), notifC.listNotifications);
r.patch("/notifications/:id/read", authenticateJwt, requirePermission("notificaciones.ver"), notifC.markNotificationRead);
r.post("/notifications/mark-all-read", authenticateJwt, requirePermission("notificaciones.ver"), notifC.markAllNotificationsRead);

r.get("/push/public-key", authenticateJwt, pushC.getPushPublicKey);
r.post("/push/subscribe", authenticateJwt, pushC.postSubscribe);
r.post("/push/unsubscribe", authenticateJwt, pushC.postUnsubscribe);

export default r;
