import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type CompensationType =
  | "bono"
  | "espera"
  | "incentivo"
  | "nomina"
  | "caja"
  | "ahorro"
  | "fianza"
  | "otro";

export class DriverCompensation extends Model<
  InferAttributes<DriverCompensation>,
  InferCreationAttributes<DriverCompensation>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare driver_id: string;
  declare tipo: CompensationType;
  declare monto: string;
  declare fecha: string;
  declare descripcion: string;
  declare settlement_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverCompensation(sequelize: Sequelize) {
  DriverCompensation.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: {
        type: DataTypes.ENUM(
          "bono",
          "espera",
          "incentivo",
          "nomina",
          "caja",
          "ahorro",
          "fianza",
          "otro",
        ),
        allowNull: false,
        defaultValue: "otro",
      },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      settlement_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "driver_compensations", underscored: true },
  );
}
