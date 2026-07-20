import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";
import type { MaintenanceType } from "./MaintenanceSchedule";

export class MaintenanceRecord extends Model<
  InferAttributes<MaintenanceRecord>,
  InferCreationAttributes<MaintenanceRecord>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare truck_id: string;
  declare tipo: MaintenanceType;
  declare km_odometro: number;
  declare fecha: string;
  declare costo: string;
  declare descripcion: string;
  declare taller: CreationOptional<string | null>;
  declare supplier_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initMaintenanceRecord(sequelize: Sequelize) {
  MaintenanceRecord.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      truck_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: {
        type: DataTypes.ENUM("preventivo", "menor", "intermedio", "mayor", "correctivo"),
        allowNull: false,
      },
      km_odometro: { type: DataTypes.INTEGER, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      costo: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      taller: { type: DataTypes.STRING(255), allowNull: true },
      supplier_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "maintenance_records", underscored: true },
  );
}
