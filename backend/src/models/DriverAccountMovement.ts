import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type AccountMovementType = "liquidacion" | "pago_directo";

export class DriverAccountMovement extends Model<
  InferAttributes<DriverAccountMovement>,
  InferCreationAttributes<DriverAccountMovement>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare account_id: string;
  declare item_id: string;
  declare driver_id: string;
  declare tipo: AccountMovementType;
  declare monto: string;
  declare fecha: string;
  declare nota: CreationOptional<string | null>;
  declare settlement_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverAccountMovement(sequelize: Sequelize) {
  DriverAccountMovement.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      account_id: { type: DataTypes.CHAR(36), allowNull: false },
      item_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: {
        type: DataTypes.ENUM("liquidacion", "pago_directo"),
        allowNull: false,
      },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      nota: { type: DataTypes.STRING(512), allowNull: true },
      settlement_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "driver_account_movements", underscored: true },
  );
}
