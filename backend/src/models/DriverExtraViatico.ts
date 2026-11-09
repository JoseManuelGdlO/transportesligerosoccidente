import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class DriverExtraViatico extends Model<
  InferAttributes<DriverExtraViatico>,
  InferCreationAttributes<DriverExtraViatico>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare driver_id: string;
  declare fecha: string;
  declare descripcion: string;
  declare monto_entregado: string;
  declare monto_comprobado: CreationOptional<string>;
  declare settlement_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverExtraViatico(sequelize: Sequelize) {
  DriverExtraViatico.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      monto_entregado: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monto_comprobado: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      settlement_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "driver_extra_viaticos", underscored: true },
  );
}
