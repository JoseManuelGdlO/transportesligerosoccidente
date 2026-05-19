import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class DriverAdvance extends Model<
  InferAttributes<DriverAdvance>,
  InferCreationAttributes<DriverAdvance>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare driver_id: string;
  declare monto: string;
  declare fecha: string;
  declare descripcion: string;
  declare settlement_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverAdvance(sequelize: Sequelize) {
  DriverAdvance.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      settlement_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "driver_advances", underscored: true },
  );
}
