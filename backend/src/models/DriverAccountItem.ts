import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type AccountItemType = "incidencia" | "prestamo" | "pendiente";
export type AccountItemStatus = "activo" | "liquidado" | "cancelado";

export class DriverAccountItem extends Model<
  InferAttributes<DriverAccountItem>,
  InferCreationAttributes<DriverAccountItem>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare account_id: string;
  declare driver_id: string;
  declare tipo: AccountItemType;
  declare concepto: string;
  declare monto_original: string;
  declare cuota_liquidacion: string;
  declare fecha: string;
  declare estatus: AccountItemStatus;
  declare descuento_activo: CreationOptional<boolean>;
  declare origen_settlement_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverAccountItem(sequelize: Sequelize) {
  DriverAccountItem.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      account_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: {
        type: DataTypes.ENUM("incidencia", "prestamo", "pendiente"),
        allowNull: false,
      },
      concepto: { type: DataTypes.STRING(512), allowNull: false },
      monto_original: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      cuota_liquidacion: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      estatus: {
        type: DataTypes.ENUM("activo", "liquidado", "cancelado"),
        allowNull: false,
        defaultValue: "activo",
      },
      descuento_activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      origen_settlement_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "driver_account_items", underscored: true },
  );
}
