import { sequelize } from "../config/database";
import { Permission, initPermission } from "./Permission";
import { Role, initRole } from "./Role";
import { RolePermission, initRolePermission } from "./RolePermission";
import { Tenant, initTenant } from "./Tenant";
import { User, initUser } from "./User";
import { Truck, initTruck } from "./Truck";
import { Driver, initDriver } from "./Driver";
import { Client, initClient } from "./Client";
import { Trip, initTrip } from "./Trip";
import { FuelLoad, initFuelLoad } from "./FuelLoad";
import { FuelTicket, initFuelTicket } from "./FuelTicket";
import { Expense, initExpense } from "./Expense";
import { Settlement, initSettlement } from "./Settlement";
import { DocumentType, initDocumentType } from "./DocumentType";
import { Document, initDocument } from "./Document";
import { PushSubscription, initPushSubscription } from "./PushSubscription";
import { Notification, initNotification } from "./Notification";
import { TripUbicacion, initTripUbicacion } from "./TripUbicacion";
import { TripMercancia, initTripMercancia } from "./TripMercancia";
import { CartaPorte, initCartaPorte } from "./CartaPorte";
import { DriverAdvance, initDriverAdvance } from "./DriverAdvance";
import { DriverDiscount, initDriverDiscount } from "./DriverDiscount";
import { MaintenanceSchedule, initMaintenanceSchedule } from "./MaintenanceSchedule";
import { MaintenanceRecord, initMaintenanceRecord } from "./MaintenanceRecord";
import { ClientUbicacion, initClientUbicacion } from "./ClientUbicacion";

export function initModels() {
  initTenant(sequelize);
  initPermission(sequelize);
  initRole(sequelize);
  initRolePermission(sequelize);
  initUser(sequelize);
  initTruck(sequelize);
  initDriver(sequelize);
  initClient(sequelize);
  initClientUbicacion(sequelize);
  initTrip(sequelize);
  initFuelLoad(sequelize);
  initFuelTicket(sequelize);
  initExpense(sequelize);
  initSettlement(sequelize);
  initDocumentType(sequelize);
  initDocument(sequelize);
  initPushSubscription(sequelize);
  initNotification(sequelize);
  initTripUbicacion(sequelize);
  initTripMercancia(sequelize);
  initCartaPorte(sequelize);
  initDriverAdvance(sequelize);
  initDriverDiscount(sequelize);
  initMaintenanceSchedule(sequelize);
  initMaintenanceRecord(sequelize);

  Role.belongsToMany(Permission, {
    through: RolePermission,
    foreignKey: "role_id",
    otherKey: "permission_id",
  });
  Permission.belongsToMany(Role, {
    through: RolePermission,
    foreignKey: "permission_id",
    otherKey: "role_id",
  });

  RolePermission.belongsTo(Role, { foreignKey: "role_id" });
  RolePermission.belongsTo(Permission, { foreignKey: "permission_id" });

  Tenant.hasMany(User, { foreignKey: "tenant_id" });
  User.belongsTo(Tenant, { foreignKey: "tenant_id" });
  User.belongsTo(Role, { foreignKey: "role_id" });
  Role.hasMany(User, { foreignKey: "role_id" });

  Tenant.hasMany(Truck, { foreignKey: "tenant_id" });
  Truck.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(Driver, { foreignKey: "tenant_id" });
  Driver.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(Client, { foreignKey: "tenant_id" });
  Client.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(Trip, { foreignKey: "tenant_id" });
  Trip.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(Settlement, { foreignKey: "tenant_id" });
  Settlement.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(FuelLoad, { foreignKey: "tenant_id" });
  FuelLoad.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(FuelTicket, { foreignKey: "tenant_id" });
  FuelTicket.belongsTo(Tenant, { foreignKey: "tenant_id" });
  Tenant.hasMany(Expense, { foreignKey: "tenant_id" });
  Expense.belongsTo(Tenant, { foreignKey: "tenant_id" });

  Trip.belongsTo(Truck, { foreignKey: "truck_id" });
  Trip.belongsTo(Driver, { foreignKey: "driver_id" });
  Trip.belongsTo(Client, { foreignKey: "client_id" });
  Truck.hasMany(Trip, { foreignKey: "truck_id" });
  Truck.hasMany(FuelTicket, { foreignKey: "truck_id", as: "fuelTickets" });
  FuelTicket.belongsTo(Truck, { foreignKey: "truck_id" });
  Driver.hasMany(Trip, { foreignKey: "driver_id" });
  Client.hasMany(Trip, { foreignKey: "client_id" });
  Client.hasMany(ClientUbicacion, { foreignKey: "client_id", as: "ubicaciones" });
  ClientUbicacion.belongsTo(Client, { foreignKey: "client_id" });
  Tenant.hasMany(ClientUbicacion, { foreignKey: "tenant_id" });
  ClientUbicacion.belongsTo(Tenant, { foreignKey: "tenant_id" });

  Driver.belongsTo(Truck, { foreignKey: "truck_id", as: "assignedTruck" });
  Truck.hasMany(Driver, { foreignKey: "truck_id", as: "assignedDrivers" });

  FuelLoad.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasMany(FuelLoad, { foreignKey: "trip_id", as: "fuel" });

  Expense.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasMany(Expense, { foreignKey: "trip_id", as: "expenses" });

  Trip.hasMany(TripUbicacion, { foreignKey: "trip_id", as: "ubicaciones" });
  TripUbicacion.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasMany(TripMercancia, { foreignKey: "trip_id", as: "mercancias" });
  TripMercancia.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasOne(CartaPorte, { foreignKey: "trip_id", as: "cartaPorte" });
  CartaPorte.belongsTo(Trip, { foreignKey: "trip_id" });

  Settlement.belongsTo(Driver, { foreignKey: "driver_id" });
  Driver.hasMany(Settlement, { foreignKey: "driver_id" });

  Driver.hasMany(DriverAdvance, { foreignKey: "driver_id", as: "advances" });
  DriverAdvance.belongsTo(Driver, { foreignKey: "driver_id" });
  Driver.hasMany(DriverDiscount, { foreignKey: "driver_id", as: "discounts" });
  DriverDiscount.belongsTo(Driver, { foreignKey: "driver_id" });
  Settlement.hasMany(DriverAdvance, { foreignKey: "settlement_id" });
  Settlement.hasMany(DriverDiscount, { foreignKey: "settlement_id" });

  Truck.hasMany(MaintenanceSchedule, { foreignKey: "truck_id", as: "maintenanceSchedules" });
  MaintenanceSchedule.belongsTo(Truck, { foreignKey: "truck_id" });
  Truck.hasMany(MaintenanceRecord, { foreignKey: "truck_id", as: "maintenanceRecords" });
  MaintenanceRecord.belongsTo(Truck, { foreignKey: "truck_id" });

  Tenant.hasMany(DocumentType, { foreignKey: "tenant_id" });
  DocumentType.belongsTo(Tenant, { foreignKey: "tenant_id" });

  Tenant.hasMany(Document, { foreignKey: "tenant_id" });
  Document.belongsTo(Tenant, { foreignKey: "tenant_id" });
  DocumentType.hasMany(Document, { foreignKey: "document_type_id" });
  Document.belongsTo(DocumentType, { foreignKey: "document_type_id" });

  Tenant.hasMany(PushSubscription, { foreignKey: "tenant_id" });
  PushSubscription.belongsTo(Tenant, { foreignKey: "tenant_id" });
  User.hasMany(PushSubscription, { foreignKey: "user_id" });
  PushSubscription.belongsTo(User, { foreignKey: "user_id" });

  Tenant.hasMany(Notification, { foreignKey: "tenant_id" });
  Notification.belongsTo(Tenant, { foreignKey: "tenant_id" });
  User.hasMany(Notification, { foreignKey: "user_id" });
  Notification.belongsTo(User, { foreignKey: "user_id" });
  Document.hasMany(Notification, { foreignKey: "document_id" });
  Notification.belongsTo(Document, { foreignKey: "document_id" });
}

export {
  sequelize,
  Tenant,
  Permission,
  Role,
  RolePermission,
  User,
  Truck,
  Driver,
  Client,
  ClientUbicacion,
  Trip,
  FuelLoad,
  FuelTicket,
  Expense,
  Settlement,
  DocumentType,
  Document,
  PushSubscription,
  Notification,
  TripUbicacion,
  TripMercancia,
  CartaPorte,
  DriverAdvance,
  DriverDiscount,
  MaintenanceSchedule,
  MaintenanceRecord,
};

initModels();
