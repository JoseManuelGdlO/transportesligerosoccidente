import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class DriverAccount extends Model<
  InferAttributes<DriverAccount>,
  InferCreationAttributes<DriverAccount>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare driver_id: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriverAccount(sequelize: Sequelize) {
  DriverAccount.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
    } as never,
    { sequelize, tableName: "driver_accounts", underscored: true },
  );
}
