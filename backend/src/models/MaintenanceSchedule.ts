import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type MaintenanceType = "preventivo" | "menor" | "intermedio" | "mayor" | "correctivo";

export class MaintenanceSchedule extends Model<
  InferAttributes<MaintenanceSchedule>,
  InferCreationAttributes<MaintenanceSchedule>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare truck_id: string;
  declare tipo: MaintenanceType;
  declare intervalo_km: CreationOptional<number | null>;
  declare intervalo_dias: CreationOptional<number | null>;
  declare ultimo_km: number;
  declare ultima_fecha: CreationOptional<string | null>;
  declare activo: CreationOptional<boolean>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initMaintenanceSchedule(sequelize: Sequelize) {
  MaintenanceSchedule.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      truck_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: {
        type: DataTypes.ENUM("preventivo", "menor", "intermedio", "mayor", "correctivo"),
        allowNull: false,
      },
      intervalo_km: { type: DataTypes.INTEGER, allowNull: true },
      intervalo_dias: { type: DataTypes.INTEGER, allowNull: true },
      ultimo_km: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ultima_fecha: { type: DataTypes.DATEONLY, allowNull: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    } as never,
    { sequelize, tableName: "maintenance_schedules", underscored: true },
  );
}
