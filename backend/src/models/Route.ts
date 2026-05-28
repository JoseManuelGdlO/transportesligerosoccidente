import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { RouteStop } from "./RouteStop";
import type { Client } from "./Client";

export class Route extends Model<InferAttributes<Route>, InferCreationAttributes<Route>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare client_id: CreationOptional<string | null>;
  declare nombre: string;
  declare tipo_viaje: CreationOptional<"local" | "foraneo" | null>;
  declare estatus: "activo" | "inactivo";
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare stops?: NonAttribute<RouteStop[]>;
  declare Client?: NonAttribute<Client>;
}

export function initRoute(sequelize: Sequelize) {
  Route.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      client_id: { type: DataTypes.CHAR(36), allowNull: true },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      tipo_viaje: { type: DataTypes.ENUM("local", "foraneo"), allowNull: true },
      estatus: { type: DataTypes.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
    } as never,
    { sequelize, tableName: "routes", underscored: true },
  );
}
