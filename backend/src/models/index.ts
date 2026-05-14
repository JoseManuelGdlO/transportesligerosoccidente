import { sequelize } from "../config/database";
import { Permission, initPermission } from "./Permission";
import { Role, initRole } from "./Role";
import { RolePermission, initRolePermission } from "./RolePermission";
import { User, initUser } from "./User";
import { Truck, initTruck } from "./Truck";
import { Driver, initDriver } from "./Driver";
import { Client, initClient } from "./Client";
import { Trip, initTrip } from "./Trip";
import { FuelLoad, initFuelLoad } from "./FuelLoad";
import { Expense, initExpense } from "./Expense";
import { Settlement, initSettlement } from "./Settlement";

export function initModels() {
  initPermission(sequelize);
  initRole(sequelize);
  initRolePermission(sequelize);
  initUser(sequelize);
  initTruck(sequelize);
  initDriver(sequelize);
  initClient(sequelize);
  initTrip(sequelize);
  initFuelLoad(sequelize);
  initExpense(sequelize);
  initSettlement(sequelize);

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

  User.belongsTo(Role, { foreignKey: "role_id" });
  Role.hasMany(User, { foreignKey: "role_id" });

  Trip.belongsTo(Truck, { foreignKey: "truck_id" });
  Trip.belongsTo(Driver, { foreignKey: "driver_id" });
  Trip.belongsTo(Client, { foreignKey: "client_id" });
  Truck.hasMany(Trip, { foreignKey: "truck_id" });
  Driver.hasMany(Trip, { foreignKey: "driver_id" });
  Client.hasMany(Trip, { foreignKey: "client_id" });

  FuelLoad.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasMany(FuelLoad, { foreignKey: "trip_id", as: "fuel" });

  Expense.belongsTo(Trip, { foreignKey: "trip_id" });
  Trip.hasMany(Expense, { foreignKey: "trip_id", as: "expenses" });

  Settlement.belongsTo(Driver, { foreignKey: "driver_id" });
  Driver.hasMany(Settlement, { foreignKey: "driver_id" });
}

export {
  sequelize,
  Permission,
  Role,
  RolePermission,
  User,
  Truck,
  Driver,
  Client,
  Trip,
  FuelLoad,
  Expense,
  Settlement,
};

initModels();
