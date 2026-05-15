import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class FuelLoad extends Model<InferAttributes<FuelLoad>, InferCreationAttributes<FuelLoad>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare litros: string;
  declare precio_litro: string;
  declare ubicacion: string;
  declare fecha: Date;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initFuelLoad(sequelize: Sequelize) {
  FuelLoad.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      litros: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      precio_litro: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
      ubicacion: { type: DataTypes.STRING(255), allowNull: false },
      fecha: { type: DataTypes.DATE, allowNull: false },
    } as never,
    { sequelize, tableName: "fuel_loads", underscored: true },
  );
}
