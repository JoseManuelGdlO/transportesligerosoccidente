import { Router } from "express";
import { authenticateJwt } from "../middlewares/authenticate";
import { requirePermission } from "../middlewares/requirePermission";
import { postLogin, getMe } from "../controllers/authController";
import * as truckC from "../controllers/truckController";
import * as driverC from "../controllers/driverController";
import * as clientC from "../controllers/clientController";
import * as tripC from "../controllers/tripController";
import * as settlementC from "../controllers/settlementController";
import * as userC from "../controllers/userController";
import * as roleC from "../controllers/roleController";
import * as reportsC from "../controllers/reportsController";

const r = Router();

r.post("/auth/login", postLogin);

r.get("/auth/me", authenticateJwt, getMe);

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

export default r;
