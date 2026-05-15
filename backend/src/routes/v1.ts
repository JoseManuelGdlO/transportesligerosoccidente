import { Router } from "express";
import { authenticateJwt } from "../middlewares/authenticate";
import { requirePermission } from "../middlewares/requirePermission";
import { postLogin, postRefresh, getMe } from "../controllers/authController";
import * as tenantC from "../controllers/tenantController";
import * as truckC from "../controllers/truckController";
import * as driverC from "../controllers/driverController";
import * as clientC from "../controllers/clientController";
import * as tripC from "../controllers/tripController";
import * as settlementC from "../controllers/settlementController";
import * as userC from "../controllers/userController";
import * as roleC from "../controllers/roleController";
import * as reportsC from "../controllers/reportsController";
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
r.delete("/trips/:id/fuel/:fuelId", authenticateJwt, requirePermission("viajes.crear"), tripC.deleteFuel);
r.post("/trips/:id/expenses", authenticateJwt, requirePermission("viajes.crear"), tripC.postExpense);
r.delete("/trips/:id/expenses/:expenseId", authenticateJwt, requirePermission("viajes.crear"), tripC.deleteExpense);

r.get("/settlements/summary", authenticateJwt, requirePermission("liquidaciones.ver"), settlementC.getSummary);
r.post("/settlements/close", authenticateJwt, requirePermission("liquidaciones.cerrar"), settlementC.postClose);

r.get("/users", authenticateJwt, requirePermission("usuarios.gestionar"), userC.listUsers);
r.post("/users", authenticateJwt, requirePermission("usuarios.gestionar"), userC.createUser);
r.patch("/users/:id", authenticateJwt, requirePermission("usuarios.gestionar"), userC.patchUser);
r.patch("/users/:id/status", authenticateJwt, requirePermission("usuarios.gestionar"), userC.patchUserStatus);

r.get("/roles", authenticateJwt, requirePermission("usuarios.gestionar"), roleC.listRoles);
r.put("/roles/:slug/permissions", authenticateJwt, requirePermission("usuarios.gestionar"), roleC.putRolePermissions);

r.get("/reports/aggregates", authenticateJwt, requirePermission("reportes.ver"), reportsC.getAggregates);

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
