import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { Trip } from "./Trip";

export class TripStatus extends Model<InferAttributes<TripStatus>, InferCreationAttributes<TripStatus>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare nombre: string;
  declare color: string;
  declare slug: CreationOptional<string | null>;
  declare is_system: CreationOptional<boolean>;
  declare activo: CreationOptional<boolean>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare trips?: NonAttribute<Trip[]>;
}

export function initTripStatus(sequelize: Sequelize) {
  TripStatus.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      color: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "#6366f1" },
      slug: { type: DataTypes.STRING(32), allowNull: true },
      is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    } as never,
    { sequelize, tableName: "trip_statuses", underscored: true },
  );
}
